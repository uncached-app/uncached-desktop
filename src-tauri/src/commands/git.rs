//! The repository commands, and the only place in the app that writes to one.
//!
//! Three rules, all from WORKSPACE_REDESIGN section 5, and all enforced here
//! rather than by the interface:
//!
//!   - **`pull` does not exist.** Fetch updates remote-tracking refs and touches
//!     nothing the user is working on; pull merges into the working tree. Only
//!     one of those is safe to offer beside a cleanup tool.
//!   - **Deletion goes through `git branch -d`, never `-D`.** `-d` refuses a
//!     branch whose commits are not reachable from anywhere else, which makes
//!     Git the last check rather than this file.
//!   - **Every path is authorised against the chosen folders** by the same
//!     function `reveal_project` uses.
//!
//! Fetch is the app's only network operation. It runs with prompting disabled on
//! every channel, because a repository that wants a password would otherwise
//! wait for a terminal that does not exist and hang the command forever.

use crate::commands::locate::authorize;
use crate::errors::command::CommandError;
use crate::workspace::hygiene::{self, Hygiene};
use serde::Serialize;
use std::path::{Path, PathBuf};
use tauri::AppHandle;

/// Runs a read-only Git command in `path`.
fn run(path: &Path, args: &[&str]) -> Option<String> {
    crate::process::quiet("git")
        .arg("-C")
        .arg(path)
        .args(args)
        .output()
        .ok()
        .filter(|output| output.status.success())
        .and_then(|output| String::from_utf8(output.stdout).ok())
}

/// What the current branch is, so a dead-branch list never offers it.
fn current_branch(path: &Path) -> Option<String> {
    run(path, &["symbolic-ref", "--quiet", "--short", "HEAD"])
        .map(|value| value.trim().to_owned())
        .filter(|value| !value.is_empty())
}

fn read_hygiene(path: &Path) -> Hygiene {
    let refs = run(
        path,
        &[
            "for-each-ref",
            "--format=%(refname:short)%1f%(upstream:track)%1f%(committerdate:unix)",
            "refs/heads",
        ],
    )
    .unwrap_or_default();
    // The same test `git branch -d` applies, asked in advance so the interface
    // only offers deletions that will be accepted.
    let merged = run(
        path,
        &["branch", "--merged", "HEAD", "--format=%(refname:short)"],
    )
    .unwrap_or_default();
    let stash = run(path, &["stash", "list", "--format=%gd%x1f%ct%x1f%gs"]).unwrap_or_default();
    let trees = run(path, &["worktree", "list", "--porcelain"]).unwrap_or_default();

    Hygiene {
        dead_branches: hygiene::dead_branches(&refs, &merged, current_branch(path).as_deref()),
        stashes: hygiene::stashes(&stash),
        worktrees: hygiene::worktrees(&trees, |candidate| Path::new(candidate).is_dir()),
    }
}

/// What this repository is carrying that nothing is using.
///
/// Read-only and offline. Free on every plan: this is the same class of thing as
/// the unpushed-work warning, and a product that charges to be told a six-month
/// stash exists is a product that let it be forgotten.
#[tauri::command]
pub async fn project_hygiene(app: AppHandle, path: String) -> Result<Hygiene, CommandError> {
    let target = authorize(&app, &path)?;
    tauri::async_runtime::spawn_blocking(move || read_hygiene(&target))
        .await
        .map_err(|error| error.to_string().into())
}

/// One repository that is carrying something, and what.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RepositoryHygiene {
    pub path: String,
    pub name: String,
    pub hygiene: Hygiene,
    /// How many of the dead branches `git branch -d` would accept.
    pub prunable: usize,
}

/// Every repository under the chosen folders that is carrying something.
#[derive(Debug, Clone, Default, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkspaceHygiene {
    /// Only the ones with something to report, most to say first.
    pub repositories: Vec<RepositoryHygiene>,
    /// Repositories read, including the ones that turned out to be clean.
    pub examined: usize,
    pub dead_branches: usize,
    pub prunable: usize,
    pub stashes: usize,
    pub worktrees: usize,
}

/// The same reading, across the workspace instead of one project.
///
/// Until now this was reachable from exactly one place: a single project's own
/// page, after opening the map and clicking the row. A workspace of forty
/// repositories would have taken forty clicks to learn that three of them are
/// carrying branches nobody can reach — so the finding existed and effectively
/// nobody could find it.
///
/// On demand, like every other section that costs something. This runs four
/// `git` invocations per repository, and a number nobody asked for is not worth
/// spawning a hundred processes.
///
/// Read-only and offline, so Free on every plan: it fetches nothing and changes
/// nothing. Pruning is still one repository at a time, through `prune_branches`,
/// which re-reads hygiene before it deletes anything.
#[tauri::command]
pub async fn workspace_hygiene(
    app: AppHandle,
    paths: Vec<String>,
) -> Result<WorkspaceHygiene, CommandError> {
    let mut projects: Vec<PathBuf> = Vec::new();
    for path in &paths {
        projects.push(authorize(&app, path)?);
    }

    tauri::async_runtime::spawn_blocking(move || aggregate(&projects))
        .await
        .map_err(|error| error.to_string().into())
}

/// The aggregation, separated from the command so it can be exercised against
/// real repositories without an `AppHandle`.
fn aggregate(projects: &[PathBuf]) -> WorkspaceHygiene {
    let mut report = WorkspaceHygiene::default();

    for project in projects {
        // Asked before anything is spawned. Most directories in a workspace
        // are not repositories, and `git` in one of them costs a process to
        // be told so.
        if !project.join(".git").exists() {
            continue;
        }
        report.examined += 1;

        let hygiene = read_hygiene(project);
        if hygiene.is_empty() {
            continue;
        }
        let prunable = hygiene.prunable().len();
        report.dead_branches += hygiene.dead_branches.len();
        report.prunable += prunable;
        report.stashes += hygiene.stashes.len();
        report.worktrees += hygiene.worktrees.len();
        report.repositories.push(RepositoryHygiene {
            name: project
                .file_name()
                .map(|value| value.to_string_lossy().into_owned())
                .unwrap_or_else(|| project.to_string_lossy().into_owned()),
            path: project.to_string_lossy().into_owned(),
            hygiene,
            prunable,
        });
    }

    // What can be acted on leads. A repository holding four stashes is worth
    // knowing about, but one holding four prunable branches is the one with
    // a button beside it.
    report.repositories.sort_by_key(|repository| {
        std::cmp::Reverse((
            repository.prunable,
            repository.hygiene.dead_branches.len(),
            repository.hygiene.stashes.len() + repository.hygiene.worktrees.len(),
        ))
    });
    report
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FetchResult {
    /// What the repository knows now, re-read after the fetch. A fetch that did
    /// not change the answer still has to return one, because the interface is
    /// showing the old answer.
    pub hygiene: Hygiene,
    pub fetched_at: i64,
}

/// Updates the remote-tracking refs, and prunes the ones the remote deleted.
///
/// `--prune` is what makes a dead branch detectable at all: without it a branch
/// whose upstream was deleted months ago still reports an upstream that exists.
/// It only removes `refs/remotes/*` — remote-tracking copies, regenerated by the
/// next fetch — and never a local branch, a commit or a file.
///
/// The three environment variables are the difference between a failed fetch and
/// a hung one. Git asks for credentials on whatever channel it can find, and
/// with no terminal attached it waits forever.
#[tauri::command]
pub async fn fetch_project(app: AppHandle, path: String) -> Result<FetchResult, CommandError> {
    let target = authorize(&app, &path)?;
    tauri::async_runtime::spawn_blocking(move || {
        let output = crate::process::quiet("git")
            .arg("-C")
            .arg(&target)
            .args(["fetch", "--prune", "--quiet"])
            .env("GIT_TERMINAL_PROMPT", "0")
            .env("GIT_ASKPASS", "")
            .env("SSH_ASKPASS", "")
            .env("GIT_SSH_COMMAND", "ssh -oBatchMode=yes")
            .output()
            .map_err(|error| CommandError::from(error.to_string()))?;

        if !output.status.success() {
            // Git's own message, trimmed to one line: it says whether this was a
            // missing remote, a refused key or no network, and inventing a
            // friendlier sentence would drop the only useful part.
            let reason = String::from_utf8_lossy(&output.stderr);
            let reason = reason
                .lines()
                .find(|line| !line.trim().is_empty())
                .unwrap_or("Fetch failed")
                .trim();
            return Err(CommandError::new("git_failed", reason).with("detail", reason));
        }

        Ok(FetchResult {
            hygiene: read_hygiene(&target),
            fetched_at: now(),
        })
    })
    .await
    .map_err(|error| error.to_string())?
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PruneResult {
    pub deleted: Vec<String>,
    /// Branches Git declined, with the reason it gave. Never empty silently:
    /// a batch that half worked has to say which half.
    pub refused: Vec<RefusedBranch>,
    pub hygiene: Hygiene,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RefusedBranch {
    pub name: String,
    pub reason: String,
}

/// Deletes local branches whose remote branch is gone.
///
/// The names are checked against a freshly read hygiene report rather than
/// trusted: the interface sends what it was showing, and what it was showing may
/// be a minute old. A name that is no longer prunable is refused with that as
/// the reason.
///
/// `-d`, always. Git's own reachability check is the last word, so the worst
/// outcome of a stale list is a branch that declines to be deleted.
#[tauri::command]
pub async fn prune_branches(
    app: AppHandle,
    path: String,
    branches: Vec<String>,
) -> Result<PruneResult, CommandError> {
    let target = authorize(&app, &path)?;
    tauri::async_runtime::spawn_blocking(move || {
        let before = read_hygiene(&target);
        let allowed: Vec<String> = before
            .prunable()
            .iter()
            .map(|name| name.to_string())
            .collect();

        let mut deleted = Vec::new();
        let mut refused = Vec::new();

        for name in branches {
            if !allowed.contains(&name) {
                refused.push(RefusedBranch {
                    name,
                    reason: "no longer safe to delete".to_owned(),
                });
                continue;
            }
            let output = crate::process::quiet("git")
                .arg("-C")
                .arg(&target)
                .args(["branch", "-d", &name])
                .output();
            match output {
                Ok(output) if output.status.success() => deleted.push(name),
                Ok(output) => refused.push(RefusedBranch {
                    name,
                    reason: String::from_utf8_lossy(&output.stderr)
                        .lines()
                        .find(|line| !line.trim().is_empty())
                        .unwrap_or("Git refused")
                        .trim()
                        .to_owned(),
                }),
                Err(error) => refused.push(RefusedBranch {
                    name,
                    reason: error.to_string(),
                }),
            }
        }

        PruneResult {
            hygiene: read_hygiene(&target),
            deleted,
            refused,
        }
    })
    .await
    .map_err(|error| error.to_string().into())
}

fn now() -> i64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|elapsed| elapsed.as_secs() as i64)
        .unwrap_or(0)
}

#[cfg(test)]
mod tests {
    use super::{aggregate, read_hygiene, PruneResult, RefusedBranch};
    use crate::workspace::hygiene::{BranchState, Hygiene};
    use std::path::{Path, PathBuf};

    /// Aggregation against real repositories: one carrying a stash, one clean,
    /// and one directory that is not a repository at all.
    ///
    /// The last is the one worth the test. Most directories in a workspace are
    /// not repositories, and without the `.git` check each would cost four
    /// processes to be told so — and would count toward a total described to the
    /// user as repositories read.
    #[test]
    fn only_repositories_are_read_and_only_the_carrying_ones_are_reported() {
        let root = std::env::temp_dir().join(format!("uncached-agg-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&root);

        let git = |directory: &Path, args: &[&str]| {
            crate::process::quiet("git")
                .arg("-C")
                .arg(directory)
                .args(args)
                .env("GIT_AUTHOR_NAME", "t")
                .env("GIT_AUTHOR_EMAIL", "t@t")
                .env("GIT_COMMITTER_NAME", "t")
                .env("GIT_COMMITTER_EMAIL", "t@t")
                .output()
                .expect("git")
        };

        let mut repositories = Vec::new();
        for name in ["carrying", "clean"] {
            let directory = root.join(name);
            std::fs::create_dir_all(&directory).unwrap();
            git(&directory, &["init", "--initial-branch=main"]);
            std::fs::write(directory.join("a.txt"), "a").unwrap();
            git(&directory, &["add", "."]);
            git(&directory, &["commit", "-m", "first"]);
            repositories.push(directory);
        }
        // One of them keeps an unapplied stash.
        std::fs::write(root.join("carrying/a.txt"), "changed").unwrap();
        git(&root.join("carrying"), &["stash", "push", "-m", "wip"]);

        let plain = root.join("not-a-repository");
        std::fs::create_dir_all(&plain).unwrap();

        let paths: Vec<PathBuf> = repositories
            .iter()
            .cloned()
            .chain(std::iter::once(plain))
            .collect();
        let report = aggregate(&paths);

        assert_eq!(
            report.examined, 2,
            "the plain directory is not a repository"
        );
        assert_eq!(
            report.repositories.len(),
            1,
            "the clean one has nothing to say"
        );
        assert_eq!(report.repositories[0].name, "carrying");
        assert_eq!(report.stashes, 1);
        assert_eq!(report.prunable, 0, "no branch here is dead");

        let _ = std::fs::remove_dir_all(root);
    }

    /// A directory that is not a repository must not look like a clean one.
    #[test]
    fn a_folder_that_is_not_a_repository_reports_nothing_and_does_not_panic() {
        let hygiene = read_hygiene(Path::new(&std::env::temp_dir()));
        assert!(hygiene.dead_branches.is_empty());
        assert!(hygiene.stashes.is_empty());
    }

    /// End to end against a real repository, because the parsing is only as good
    /// as the format strings, and a format string is exactly the kind of thing a
    /// Git upgrade changes underneath a unit test built from fixtures.
    #[test]
    fn a_real_repository_reports_the_branch_whose_upstream_was_deleted() {
        let root = std::env::temp_dir().join(format!("uncached-git-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&root);
        let origin = root.join("origin");
        let clone = root.join("clone");
        std::fs::create_dir_all(&origin).unwrap();

        let git = |directory: &Path, args: &[&str]| {
            crate::process::quiet("git")
                .arg("-C")
                .arg(directory)
                .args(args)
                .env("GIT_AUTHOR_NAME", "t")
                .env("GIT_AUTHOR_EMAIL", "t@t")
                .env("GIT_COMMITTER_NAME", "t")
                .env("GIT_COMMITTER_EMAIL", "t@t")
                .output()
                .expect("git")
        };

        git(&origin, &["init", "--bare", "--initial-branch=main"]);
        std::fs::create_dir_all(&clone).unwrap();
        git(&clone, &["init", "--initial-branch=main"]);
        std::fs::write(clone.join("a.txt"), "a").unwrap();
        git(&clone, &["add", "."]);
        git(&clone, &["commit", "-m", "first"]);
        git(
            &clone,
            &["remote", "add", "origin", origin.to_str().unwrap()],
        );
        git(&clone, &["push", "-u", "origin", "main"]);

        // A branch pushed and then deleted on the remote: the shape a merged
        // pull request leaves behind.
        git(&clone, &["checkout", "-b", "feature"]);
        git(&clone, &["push", "-u", "origin", "feature"]);
        git(&clone, &["checkout", "main"]);
        git(&origin, &["branch", "-D", "feature"]);
        git(&clone, &["fetch", "--prune"]);
        git(&clone, &["stash", "list"]);

        let hygiene = read_hygiene(&clone);

        let dead: Vec<&str> = hygiene
            .dead_branches
            .iter()
            .map(|branch| branch.name.as_str())
            .collect();
        assert_eq!(dead, vec!["feature"], "{hygiene:?}");
        assert_eq!(
            hygiene.dead_branches[0].state,
            BranchState::Prunable,
            "it has no commits of its own, so `git branch -d` accepts it"
        );
        assert!(hygiene.dead_branches[0].last_commit_at.is_some());
        assert!(
            hygiene.worktrees.is_empty(),
            "the main working copy is not a finding"
        );

        let _ = std::fs::remove_dir_all(&root);
    }

    #[test]
    fn a_prune_result_names_both_halves_in_camel_case() {
        let value = serde_json::to_value(PruneResult {
            deleted: vec!["gone".to_owned()],
            refused: vec![RefusedBranch {
                name: "kept".to_owned(),
                reason: "not fully merged".to_owned(),
            }],
            hygiene: Hygiene::default(),
        })
        .unwrap();

        assert_eq!(value["deleted"][0], "gone");
        assert_eq!(value["refused"][0]["reason"], "not fully merged");
        assert!(value["hygiene"]["deadBranches"].is_array());
    }
}
