//! Noticing that the workspace changed, without paying to watch it.
//!
//! The app re-reads when its window comes back, which is the gesture that means
//! "look again" and covers most of it. What it misses is the case where nothing
//! about the window changes: a build finishing on another screen, an install in
//! a terminal, a directory removed by something else. This is that case, and
//! only that case.
//!
//! **What is not watched is the design.** A workspace here is a hundred and
//! forty projects and eighty `node_modules`; an install writes tens of
//! thousands of files into one of them, and a watcher that reports each is a
//! watcher that costs more than the reading it triggers. Two rules keep it
//! cheap:
//!
//! Events under an artifact directory are collapsed to that directory. Ten
//! thousand files appearing inside one `node_modules` is one fact — that
//! `node_modules` changed — and the app has no use for the other nine thousand
//! nine hundred and ninety-nine.
//!
//! And nothing is reported until the disk has been quiet. A build is a burst;
//! reading a workspace mid-burst measures a directory that is still being
//! written, which is a number that will be wrong by the time it is on screen.
//!
//! And nothing is watched below the depth where the answers live. A root, the
//! folders in it, and the folders in those: that reaches a project appearing, a
//! project inside a group appearing, and a `node_modules` or a `target` being
//! created or removed, which is every event this app has an answer to.
//!
//! It does not reach the inside of a build directory or of a source tree, and
//! the whole point is that it must not. Somebody running a dev server in the
//! folder they chose writes into both continuously — the disk is never quiet,
//! the debounce never settles, and the app re-reads the workspace every few
//! seconds forever. Recursive watching made that the ordinary case for anyone
//! working in the folder they had pointed the app at.
//!
//! One rule on all three platforms, rather than recursive where the kernel
//! coalesces and shallow where inotify counts. A few hundred watches is nothing
//! anywhere, and one behaviour is one thing to reason about.
//!
//! What this gives up: a project added after the watcher started has its own
//! interior unwatched until the folders change or the app restarts. Its arrival
//! is seen — that is an event on its parent — and everything about it is read
//! then. Only later changes inside it wait for focus.

use notify::{Event, EventKind, RecursiveMode, Watcher};
use std::collections::HashSet;
use std::path::{Path, PathBuf};
use std::sync::mpsc;
use std::time::{Duration, Instant};
use tauri::{AppHandle, Emitter, Manager};

/// How long the disk has to be quiet before the change is reported.
///
/// Long enough that an install or a build lands as one event, short enough that
/// somebody watching the window sees it react to what they just did.
const QUIET: Duration = Duration::from_millis(1200);

/// Never wait longer than this, however busy the disk stays. A build that runs
/// for four minutes should not leave the numbers stale for four minutes.
const AT_MOST: Duration = Duration::from_secs(10);

/// Directories whose contents are never worth reporting one by one.
const ARTIFACTS: &[&str] = &[
    "node_modules",
    "target",
    ".next",
    ".turbo",
    ".angular",
    ".nuxt",
    ".svelte-kit",
    "dist",
    "build",
    ".venv",
    "venv",
    "__pycache__",
    ".git",
];

/// State a watcher is asked to keep, so restarting it is one call.
pub struct Watched {
    _watcher: notify::RecommendedWatcher,
    pub roots: Vec<PathBuf>,
}

/// Starts watching the given roots, replacing whatever was watched before.
///
/// Returns the watcher so the caller can hold it: dropping it stops the
/// watching, which is how this is turned off when the folders change.
pub fn install(app: &AppHandle, roots: &[String]) -> Option<Watched> {
    let paths: Vec<PathBuf> = roots
        .iter()
        .map(PathBuf::from)
        .filter(|path| path.is_dir())
        .collect();
    if paths.is_empty() {
        return None;
    }

    let (sender, receiver) = mpsc::channel::<Event>();
    let mut watcher = notify::recommended_watcher(move |result: notify::Result<Event>| {
        if let Ok(event) = result {
            // A closed channel means the app is going away, and there is
            // nothing to do about it from a watcher thread.
            let _ = sender.send(event);
        }
    })
    .ok()?;

    for path in &paths {
        if watch(&mut watcher, path).is_err() {
            crate::logging::warn(
                "watch",
                &format!(
                    "cannot watch \"{}\"; changes there arrive on focus",
                    path.display()
                ),
            );
        }
    }

    let handle = app.clone();
    std::thread::spawn(move || debounce(handle, receiver));

    Some(Watched {
        _watcher: watcher,
        roots: paths,
    })
}

/// How deep the watches go. A root is 0, a project in it is 1, and what that
/// project holds is 2 — the last level that says anything this app can act on.
const DEPTH: usize = 2;

/// A ceiling on how many directories one root may cost, so a pathological tree
/// cannot spend the user's watch limit.
const MAX_WATCHES: usize = 600;

/// Watches a root and the two levels under it, skipping what is only ever noise.
fn watch(watcher: &mut notify::RecommendedWatcher, root: &Path) -> notify::Result<()> {
    watcher.watch(root, RecursiveMode::NonRecursive)?;

    let mut budget = MAX_WATCHES;
    let mut level = vec![root.to_path_buf()];

    for _ in 0..DEPTH {
        let mut next = Vec::new();
        for directory in &level {
            let Ok(entries) = std::fs::read_dir(directory) else {
                continue;
            };
            for entry in entries.flatten() {
                if budget == 0 {
                    return Ok(());
                }
                let path = entry.path();
                if !path.is_dir() || is_artifact(&path) || is_hidden(&path) {
                    continue;
                }
                if watcher.watch(&path, RecursiveMode::NonRecursive).is_ok() {
                    budget -= 1;
                    next.push(path);
                }
            }
        }
        level = next;
    }

    Ok(())
}

/// Collects events until the disk is quiet, then reports once.
fn debounce(app: AppHandle, receiver: mpsc::Receiver<Event>) {
    let mut pending: HashSet<PathBuf> = HashSet::new();
    let mut first_seen: Option<Instant> = None;

    loop {
        let waiting = match first_seen {
            Some(started) => QUIET.min(AT_MOST.saturating_sub(started.elapsed())),
            None => Duration::from_secs(3600),
        };

        match receiver.recv_timeout(waiting) {
            Ok(event) => {
                if !worth_reporting(&event) {
                    continue;
                }
                for path in event.paths {
                    pending.insert(collapse(&path));
                }
                if !pending.is_empty() {
                    first_seen.get_or_insert_with(Instant::now);
                }
            }
            Err(mpsc::RecvTimeoutError::Timeout) => {
                if !pending.is_empty() {
                    announce(&app, std::mem::take(&mut pending));
                }
                first_seen = None;
            }
            // The sender is gone, which is the app closing.
            Err(mpsc::RecvTimeoutError::Disconnected) => return,
        }
    }
}

/// A change to what is on disk, rather than to when it was last read.
///
/// Access times fire constantly and mean nothing here; a scan of the workspace
/// would otherwise report itself as a reason to scan the workspace again.
fn worth_reporting(event: &Event) -> bool {
    matches!(
        event.kind,
        EventKind::Create(_) | EventKind::Remove(_) | EventKind::Modify(_)
    ) && !matches!(
        event.kind,
        EventKind::Modify(notify::event::ModifyKind::Metadata(
            notify::event::MetadataKind::AccessTime
        ))
    )
}

/// The shortest path that says the same thing.
///
/// Ten thousand files appearing inside one `node_modules` is one fact. Keeping
/// them apart costs memory to hold and tells the app nothing it can act on.
fn collapse(path: &Path) -> PathBuf {
    let mut collapsed = PathBuf::new();
    for part in path.components() {
        collapsed.push(part);
        if ARTIFACTS.contains(&part.as_os_str().to_string_lossy().as_ref()) {
            return collapsed;
        }
    }
    collapsed
}

/// A dot directory is a tool's own bookkeeping, written to constantly by the
/// very tools somebody is running while looking at this.
fn is_hidden(path: &Path) -> bool {
    path.file_name()
        .and_then(|name| name.to_str())
        .is_some_and(|name| name.starts_with('.'))
}

fn is_artifact(path: &Path) -> bool {
    path.file_name()
        .and_then(|name| name.to_str())
        .is_some_and(|name| ARTIFACTS.contains(&name))
}

fn announce(app: &AppHandle, changed: HashSet<PathBuf>) {
    // Nobody is looking, so nothing is asked for: the window reads again when
    // it comes back, which is the path that existed before this did.
    if app
        .get_webview_window("main")
        .and_then(|window| window.is_visible().ok())
        != Some(true)
    {
        return;
    }

    let paths: Vec<String> = changed
        .into_iter()
        .map(|path| path.to_string_lossy().into_owned())
        .collect();
    crate::logging::info("watch", &format!("{} paths changed", paths.len()));
    let _ = app.emit("workspace:changed", paths);
}

#[cfg(test)]
mod tests {
    use super::{collapse, is_artifact, is_hidden};
    use std::path::{Path, PathBuf};

    #[test]
    fn everything_inside_an_artifact_is_the_artifact() {
        // The whole reason this is cheap: an install writes tens of thousands
        // of files into one directory, and that is one fact.
        assert_eq!(
            collapse(Path::new("/w/api/node_modules/react/cjs/index.js")),
            PathBuf::from("/w/api/node_modules")
        );
        assert_eq!(
            collapse(Path::new("/w/api/target/debug/build/x/out")),
            PathBuf::from("/w/api/target")
        );
        assert_eq!(
            collapse(Path::new("/w/api/.git/refs/heads/main")),
            PathBuf::from("/w/api/.git")
        );
    }

    #[test]
    fn a_path_outside_one_is_left_alone() {
        assert_eq!(
            collapse(Path::new("/w/api/src/main.rs")),
            PathBuf::from("/w/api/src/main.rs")
        );
    }

    #[test]
    fn the_artifact_directory_itself_collapses_to_itself() {
        // Its own creation and removal are the two events that matter most:
        // a project gaining or losing everything it holds.
        assert_eq!(
            collapse(Path::new("/w/api/node_modules")),
            PathBuf::from("/w/api/node_modules")
        );
    }

    #[test]
    fn the_places_a_dev_server_writes_are_not_watched() {
        // The reason the depth exists. A build writes into `target` and a dev
        // server into `node_modules/.vite`, both continuously, and a watcher
        // that reaches them never lets the disk go quiet — so the app re-reads
        // the workspace every few seconds for as long as somebody is working in
        // the folder they pointed it at.
        for noisy in [
            "/w/api/node_modules",
            "/w/api/target",
            "/w/api/.next",
            "/w/api/.git",
        ] {
            assert!(
                is_artifact(Path::new(noisy)) || is_hidden(Path::new(noisy)),
                "{noisy} would be watched"
            );
        }
    }

    #[test]
    fn a_directory_named_like_an_artifact_is_one() {
        assert!(is_artifact(Path::new("/w/api/node_modules")));
        assert!(!is_artifact(Path::new("/w/api/src")));
    }
}

/// What is being watched right now, so choosing different folders replaces it.
///
/// Held by the app rather than by the frontend: a watcher is a thread and a set
/// of kernel handles, and the window is the one thing here that can be closed
/// and reopened without either of those going anywhere.
#[derive(Default)]
pub struct Watching(std::sync::Mutex<Option<Watched>>);

/// Points the watcher at these folders, or at nothing if the list is empty.
///
/// Called whenever the chosen folders change. Replacing rather than adding: the
/// previous watcher is dropped, which is what stops it.
#[tauri::command]
pub fn watch_workspace(app: AppHandle, roots: Vec<String>) {
    let state = app.state::<Watching>();
    let mut held = match state.0.lock() {
        Ok(held) => held,
        Err(poisoned) => poisoned.into_inner(),
    };

    let unchanged = held.as_ref().is_some_and(|watched| {
        watched.roots.len() == roots.len()
            && watched
                .roots
                .iter()
                .zip(&roots)
                .all(|(held, asked)| held.to_string_lossy() == asked.as_str())
    });
    if unchanged {
        return;
    }

    // Dropped before the next is built, so two watchers are never on one tree.
    *held = None;
    *held = install(&app, &roots);
}
