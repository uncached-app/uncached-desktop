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
//! Recursive where the platform gives it away — macOS coalesces in the kernel,
//! Windows watches a tree with one handle — and on Linux, where inotify wants a
//! watch per directory and a large workspace would exhaust the user's limit,
//! only the roots and the projects directly under them. There the deep changes
//! still arrive on focus, which is where they arrived before this existed.

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

/// Recursive where a tree costs one handle, shallow where it costs one per
/// directory and the user has a finite number of them.
fn watch(watcher: &mut notify::RecommendedWatcher, root: &Path) -> notify::Result<()> {
    if cfg!(target_os = "linux") {
        watcher.watch(root, RecursiveMode::NonRecursive)?;
        let Ok(entries) = std::fs::read_dir(root) else {
            return Ok(());
        };
        for entry in entries
            .flatten()
            .take(crate::commands::workspace::MAX_PROJECTS)
        {
            let path = entry.path();
            if path.is_dir() && !is_artifact(&path) {
                let _ = watcher.watch(&path, RecursiveMode::NonRecursive);
            }
        }
        Ok(())
    } else {
        watcher.watch(root, RecursiveMode::Recursive)
    }
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
    use super::{collapse, is_artifact};
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
