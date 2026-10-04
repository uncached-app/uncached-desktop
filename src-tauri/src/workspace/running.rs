//! Which projects have something live inside them.
//!
//! A dev server, a watcher or a test runner keeps its working directory inside
//! the project it serves, and while it is there the project's artifacts are not
//! reclaimable: the tree is being written to, so a measurement is a number that
//! is already wrong, and a removal either fails outright or takes files the
//! running process still has open. Saying so is worth more than either.
//!
//! One process listing answers for the whole workspace. `lsof` is asked for
//! current working directories alone — not open files — which is the cheap
//! query: it is a field every process has, so nothing has to be walked.

use serde::Serialize;
use std::collections::{BTreeMap, BTreeSet};
use std::path::{Path, PathBuf};

/// A project with a live process inside it, and what that process is.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RunningProject {
    pub path: String,
    /// The command name, for a sentence that can say what is holding it.
    pub command: String,
    /// How many processes are sitting inside, when it is more than the one.
    pub processes: usize,
}

/// Reports which of `projects` currently has a process working inside it.
///
/// Unsupported platforms report nothing rather than guessing. An empty answer
/// means "nothing known to be running", which is exactly what every caller
/// already assumes when the list does not mention a project.
pub fn running_projects(projects: &[PathBuf]) -> Vec<RunningProject> {
    if projects.is_empty() {
        return Vec::new();
    }
    let mut found: BTreeMap<&Path, (String, usize)> = BTreeMap::new();

    for (command, cwd) in working_directories() {
        // The deepest match wins: a monorepo root and one of its packages are
        // both ancestors of the same cwd, and the package is the project the
        // process is actually in.
        let Some(project) = projects
            .iter()
            .filter(|project| is_inside(&cwd, project))
            .max_by_key(|project| project.components().count())
        else {
            continue;
        };
        let entry = found
            .entry(project.as_path())
            .or_insert_with(|| (command.clone(), 0));
        entry.1 += 1;
    }

    found
        .into_iter()
        .map(|(path, (command, processes))| RunningProject {
            path: path.to_string_lossy().into_owned(),
            command,
            processes,
        })
        .collect()
}

/// The programs running right now, by the name a process list reports.
///
/// A cache is only disposable while the tool that owns it is not using it.
/// `.claude/ide` holds the lock files of live sessions; a session's scratch
/// directory under `/tmp` is where the agent is writing as you read this.
/// Removing either mid-flight does not free space, it breaks what was running
/// — and afterwards the tool cannot tell that from a corrupt cache.
///
/// Names only, and compared exactly. Matching loosely would block a cache
/// because some unrelated process merely contains the word, and a block that
/// fires when it should not is one people learn to work around.
///
/// **Linux truncates.** `comm` there is the kernel's `TASK_COMM_LEN` field,
/// which is fifteen characters plus a terminator, so a longer executable name
/// arrives cut short. Every owner in the catalogue is well inside that —
/// `claude`, `cursor`, `ollama`, `node`, `Xcode` — and the test below pins the
/// behaviour rather than leaving it to be rediscovered by an owner that is not.
pub fn running_commands() -> BTreeSet<String> {
    let Ok(output) = crate::process::quiet("ps").args(["-axo", "comm="]).output() else {
        return BTreeSet::new();
    };
    String::from_utf8_lossy(&output.stdout)
        .lines()
        .filter_map(|line| {
            // `comm` is a path for anything not started from `$PATH`, and an
            // app bundle's executable is always one:
            // `/Applications/Foo.app/Contents/MacOS/Foo`.
            let name = line.trim().rsplit('/').next()?.trim();
            (!name.is_empty()).then(|| name.to_owned())
        })
        .collect()
}

/// Which of `owners` is running, if any. The first is what the screen says.
pub fn first_running<'a>(owners: &[&'a str], running: &BTreeSet<String>) -> Option<&'a str> {
    owners
        .iter()
        .copied()
        .find(|owner| running.contains(*owner))
}

/// Separator-aware, because `/work-archive` starts with `/work`.
fn is_inside(child: &Path, parent: &Path) -> bool {
    child == parent || child.starts_with(parent)
}

/// Every process's working directory, paired with the command that owns it.
///
/// `-F pcn` is the machine-readable form: one field per line, tagged by its
/// first character. `-d cwd` restricts the descriptors to the working
/// directory, which is what makes this a listing rather than a scan of every
/// open file on the machine.
#[cfg(unix)]
fn working_directories() -> Vec<(String, PathBuf)> {
    let Ok(output) = crate::process::quiet("lsof")
        .args(["-a", "-d", "cwd", "-F", "pcn"])
        .output()
    else {
        return Vec::new();
    };
    // `lsof` exits non-zero when any descriptor was refused, which is the
    // ordinary case without root. What it did read is still on stdout.
    let text = String::from_utf8_lossy(&output.stdout);

    let mut directories = Vec::new();
    let mut command = String::new();
    for line in text.lines() {
        let Some((tag, value)) = line.split_at_checked(1) else {
            continue;
        };
        match tag {
            "c" => command = value.to_owned(),
            "n" if value.starts_with('/') => {
                directories.push((command.clone(), PathBuf::from(value)));
            }
            _ => {}
        }
    }
    directories
}

#[cfg(not(unix))]
fn working_directories() -> Vec<(String, PathBuf)> {
    // Windows has no equivalent that does not cost a handle enumeration of
    // every process on the machine, which is the price this call exists to
    // avoid. Reporting nothing is honest; cleanup still refuses a locked
    // directory on its own, with the error that says so.
    Vec::new()
}

#[cfg(test)]
mod tests {
    #[cfg(unix)]
    use super::running_commands;
    use super::{is_inside, running_projects};
    use std::collections::BTreeSet;
    use std::path::{Path, PathBuf};

    #[test]
    fn a_shared_prefix_is_not_containment() {
        assert!(is_inside(Path::new("/work/api"), Path::new("/work")));
        assert!(!is_inside(Path::new("/work-archive"), Path::new("/work")));
        assert!(is_inside(Path::new("/work"), Path::new("/work")));
    }

    /// `ps` lists this test binary, whatever else the machine is doing.
    ///
    /// Compared on the first fifteen characters, which is what Linux reports:
    /// `comm` is the kernel's `TASK_COMM_LEN` field and a test binary's name —
    /// `uncached_lib-9c249e9c22cad2b8` — is far longer than that. macOS returns
    /// it whole, so the same assertion holds on both by truncating each side.
    #[cfg(unix)]
    #[test]
    fn the_process_list_contains_the_process_asking_for_it() {
        /// `TASK_COMM_LEN - 1`, from the Linux kernel.
        const COMM_LEN: usize = 15;

        let running = running_commands();
        assert!(!running.is_empty(), "ps reported nothing at all");
        let me = std::env::current_exe()
            .ok()
            .and_then(|path| {
                path.file_name()
                    .map(|name| name.to_string_lossy().into_owned())
            })
            .expect("this test has an executable");
        let short: String = me.chars().take(COMM_LEN).collect();
        assert!(
            running.contains(&me) || running.contains(&short),
            "{me} is running and was not listed, as itself or as {short}"
        );
    }

    #[test]
    fn an_owner_matches_by_whole_name_and_not_by_part() {
        let running: BTreeSet<String> = ["claude", "node"].iter().map(|s| s.to_string()).collect();
        assert_eq!(super::first_running(&["claude"], &running), Some("claude"));
        assert_eq!(
            super::first_running(&["codex", "claude"], &running),
            Some("claude")
        );
        assert_eq!(super::first_running(&["claude-code"], &running), None);
        assert_eq!(super::first_running(&["clau"], &running), None);
        assert_eq!(super::first_running(&[], &running), None);
    }

    #[test]
    fn nothing_is_reported_for_an_empty_workspace() {
        assert!(running_projects(&[]).is_empty());
    }

    /// This process is running in some directory. Handed that directory as the
    /// only project, the listing has to find it — which is the whole mechanism
    /// end to end, without depending on what else the machine happens to run.
    #[cfg(unix)]
    #[test]
    fn the_directory_this_test_runs_in_is_reported_as_running() {
        let Ok(cwd) = std::env::current_dir() else {
            return;
        };
        let reported = running_projects(std::slice::from_ref(&cwd));
        assert_eq!(
            reported.first().map(|project| project.path.as_str()),
            Some(cwd.to_string_lossy().as_ref()),
            "lsof is unavailable or reported no working directories"
        );
    }

    #[test]
    fn a_project_nothing_runs_in_is_absent() {
        let nowhere = PathBuf::from("/uncached-no-such-project-0f1e2d3c");
        assert!(running_projects(&[nowhere]).is_empty());
    }
}
