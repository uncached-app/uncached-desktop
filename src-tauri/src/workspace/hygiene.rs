//! What a repository is carrying that nobody is using.
//!
//! Pure: every function here takes the text Git already printed and returns a
//! decision. No process and no filesystem — `worktrees` needs to know whether a
//! directory is still there and takes that as a closure, so the one thing that
//! touches a disk is the caller's, and every case is a fixture in the tests.
//!
//! One rule shapes the whole module, and it is the same one the verdict follows:
//! **the only branch this offers to delete is one Git itself would delete.** A
//! branch whose upstream vanished is dead in the sense that nothing on the
//! remote points at it any more; it is not automatically dead in the sense that
//! its commits exist elsewhere. Those two are different questions, they are
//! answered separately here, and only the second one earns a button.

use serde::Serialize;

/// Why a local branch has nothing on the remote behind it.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum BranchState {
    /// Its upstream was deleted — the shape of a merged pull request — and its
    /// commits are reachable from the branch that is checked out. `git branch
    /// -d` accepts this one.
    Prunable,
    /// Its upstream was deleted and its commits are not reachable from anywhere
    /// else here. Deleting it would need `-D`, which is how work that exists
    /// only on this disk is lost, so it is reported and never offered.
    HoldsWork,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DeadBranch {
    pub name: String,
    pub state: BranchState,
    /// Epoch seconds of its last commit, for "abandoned in March".
    pub last_commit_at: Option<i64>,
}

/// A saved change that exists nowhere but this disk.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Stash {
    /// `stash@{0}`, as Git names it, so the user can act on it themselves.
    pub reference: String,
    pub message: String,
    pub at: Option<i64>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Worktree {
    pub path: String,
    pub branch: Option<String>,
    /// The registration points at a directory that is not there any more. The
    /// checkout is gone and the bookkeeping in `.git/worktrees` is not.
    pub missing: bool,
    /// The main working copy, which is a worktree too and is never a finding.
    pub primary: bool,
}

/// Everything read about one repository's housekeeping, in one answer.
#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Hygiene {
    pub dead_branches: Vec<DeadBranch>,
    pub stashes: Vec<Stash>,
    /// Only the ones worth mentioning: the primary worktree is filtered out.
    pub worktrees: Vec<Worktree>,
}

impl Hygiene {
    /// Whether there is anything to say. An empty panel and a panel that has not
    /// loaded look identical, so the caller has to be able to tell them apart.
    pub fn is_empty(&self) -> bool {
        self.dead_branches.is_empty() && self.stashes.is_empty() && self.worktrees.is_empty()
    }

    pub fn prunable(&self) -> Vec<&str> {
        self.dead_branches
            .iter()
            .filter(|branch| branch.state == BranchState::Prunable)
            .map(|branch| branch.name.as_str())
            .collect()
    }
}

/// Branches whose upstream Git reports as `gone`.
///
/// `merged` is the output of `git branch --merged HEAD`, which is the same test
/// `git branch -d` applies. Classifying with it means the button is only offered
/// where the deletion will actually be accepted, and the deletion still goes
/// through `-d` — so a mistake here costs a refusal, never a commit.
///
/// The checked-out branch is dropped whatever its upstream says: Git will not
/// delete the branch you are standing on, and offering it would be offering a
/// failure.
pub fn dead_branches(refs: &str, merged: &str, current: Option<&str>) -> Vec<DeadBranch> {
    let merged: Vec<&str> = merged
        .lines()
        .map(str::trim)
        .filter(|line| !line.is_empty())
        .collect();

    refs.lines()
        .filter_map(|line| {
            let mut fields = line.split('\u{1f}');
            let name = fields.next().unwrap_or_default().trim();
            let track = fields.next().unwrap_or_default().trim();
            let at = fields.next().unwrap_or_default().trim();

            if name.is_empty() || !track.contains("gone") {
                return None;
            }
            if current.is_some_and(|branch| branch == name) {
                return None;
            }
            Some(DeadBranch {
                state: if merged.contains(&name) {
                    BranchState::Prunable
                } else {
                    BranchState::HoldsWork
                },
                name: name.to_owned(),
                last_commit_at: at.parse().ok(),
            })
        })
        .collect()
}

/// Parses `git stash list --format=%gd%x1f%ct%x1f%gs`.
pub fn stashes(list: &str) -> Vec<Stash> {
    list.lines()
        .filter_map(|line| {
            let mut fields = line.split('\u{1f}');
            let reference = fields.next().unwrap_or_default().trim();
            let at = fields.next().unwrap_or_default().trim();
            let message = fields.next().unwrap_or_default().trim();
            if reference.is_empty() {
                return None;
            }
            Some(Stash {
                reference: reference.to_owned(),
                message: message.to_owned(),
                at: at.parse().ok(),
            })
        })
        .collect()
}

/// Parses `git worktree list --porcelain`.
///
/// The format is blank-line-separated records, the first of which is always the
/// main working copy. `exists` answers whether each checkout is still on disk,
/// supplied by the caller so this stays pure.
pub fn worktrees(porcelain: &str, exists: impl Fn(&str) -> bool) -> Vec<Worktree> {
    let mut found = Vec::new();
    let mut path: Option<String> = None;
    let mut branch: Option<String> = None;

    // A trailing empty line flushes the last record; adding one is cheaper than
    // repeating the flush after the loop.
    for line in porcelain.lines().chain(std::iter::once("")) {
        if let Some(value) = line.strip_prefix("worktree ") {
            path = Some(value.trim().to_owned());
            branch = None;
        } else if let Some(value) = line.strip_prefix("branch ") {
            branch = Some(
                value
                    .trim()
                    .strip_prefix("refs/heads/")
                    .unwrap_or(value.trim())
                    .to_owned(),
            );
        } else if line.is_empty() {
            if let Some(path) = path.take() {
                let missing = !exists(&path);
                found.push(Worktree {
                    primary: found.is_empty(),
                    missing,
                    branch: branch.take(),
                    path,
                });
            }
        }
    }

    // The main working copy is where the user already is. Listing it as a
    // finding would mean every repository has one.
    found.retain(|worktree| !worktree.primary);
    found
}

#[cfg(test)]
mod tests {
    use super::{dead_branches, stashes, worktrees, BranchState, Hygiene};

    const REFS: &str = concat!(
        "main\u{1f}\u{1f}1700000000\n",
        "feature/merged\u{1f}[gone]\u{1f}1699000000\n",
        "feature/abandoned\u{1f}[gone]\u{1f}1690000000\n",
        "topic\u{1f}[ahead 2]\u{1f}1701000000\n",
    );

    #[test]
    fn only_a_branch_whose_upstream_is_gone_is_dead() {
        let dead = dead_branches(REFS, "feature/merged\n", Some("main"));

        let names: Vec<&str> = dead.iter().map(|branch| branch.name.as_str()).collect();
        assert_eq!(names, vec!["feature/merged", "feature/abandoned"]);
    }

    /// The distinction the whole module exists for. Both branches lost their
    /// upstream; only one of them can be deleted without losing commits.
    #[test]
    fn a_dead_branch_holding_unreachable_commits_is_never_offered_for_deletion() {
        let dead = dead_branches(REFS, "feature/merged\n", Some("main"));

        assert_eq!(dead[0].state, BranchState::Prunable);
        assert_eq!(dead[1].state, BranchState::HoldsWork);

        let hygiene = Hygiene {
            dead_branches: dead,
            ..Default::default()
        };
        assert_eq!(
            hygiene.prunable(),
            vec!["feature/merged"],
            "the button may only reach what `git branch -d` accepts"
        );
    }

    /// Git refuses to delete the branch you are standing on, so offering it
    /// would be offering a failure.
    #[test]
    fn the_checked_out_branch_is_never_listed_however_dead_its_upstream() {
        let refs = "current\u{1f}[gone]\u{1f}1690000000\n";

        assert!(dead_branches(refs, "current\n", Some("current")).is_empty());
        assert_eq!(dead_branches(refs, "current\n", None).len(), 1);
    }

    #[test]
    fn a_branch_with_an_unreadable_date_still_reports_itself() {
        let dead = dead_branches("orphan\u{1f}[gone]\u{1f}\n", "", None);

        assert_eq!(dead.len(), 1);
        assert_eq!(dead[0].last_commit_at, None);
        assert_eq!(dead[0].state, BranchState::HoldsWork);
    }

    #[test]
    fn stashes_keep_their_reference_so_the_user_can_act_on_them() {
        let parsed = stashes(concat!(
            "stash@{0}\u{1f}1700000000\u{1f}WIP on main: abc123 half a refactor\n",
            "stash@{1}\u{1f}1680000000\u{1f}On topic: experiment\n",
        ));

        assert_eq!(parsed.len(), 2);
        assert_eq!(parsed[0].reference, "stash@{0}");
        assert_eq!(parsed[0].message, "WIP on main: abc123 half a refactor");
        assert_eq!(parsed[1].at, Some(1_680_000_000));
    }

    #[test]
    fn an_empty_stash_list_is_no_stashes_rather_than_one_blank_one() {
        assert!(stashes("").is_empty());
        assert!(stashes("\n\n").is_empty());
    }

    #[test]
    fn the_main_working_copy_is_not_a_finding() {
        let porcelain = concat!(
            "worktree /w/api\nHEAD abc\nbranch refs/heads/main\n\n",
            "worktree /w/api-hotfix\nHEAD def\nbranch refs/heads/hotfix\n\n",
        );

        let found = worktrees(porcelain, |_| true);

        assert_eq!(found.len(), 1);
        assert_eq!(found[0].path, "/w/api-hotfix");
        assert_eq!(found[0].branch.as_deref(), Some("hotfix"));
        assert!(!found[0].missing);
    }

    /// The checkout is gone and the bookkeeping is not, which is the case worth
    /// reporting: the directory was deleted by hand and Git still holds a
    /// registration and its build output.
    #[test]
    fn a_worktree_whose_directory_is_gone_is_flagged_rather_than_dropped() {
        let porcelain = concat!(
            "worktree /w/api\nHEAD abc\nbranch refs/heads/main\n\n",
            "worktree /w/deleted\nHEAD def\nbranch refs/heads/old\n\n",
        );

        let found = worktrees(porcelain, |path| path != "/w/deleted");

        assert_eq!(found.len(), 1);
        assert!(found[0].missing);
    }

    /// A record not followed by a blank line is the last one, and dropping it
    /// would silently hide the finding most likely to matter.
    #[test]
    fn the_last_record_survives_a_missing_trailing_blank_line() {
        let porcelain = "worktree /w/api\n\nworktree /w/extra\nbranch refs/heads/x";

        let found = worktrees(porcelain, |_| true);

        assert_eq!(found.len(), 1);
        assert_eq!(found[0].path, "/w/extra");
    }

    #[test]
    fn a_detached_worktree_has_no_branch_and_is_still_listed() {
        let found = worktrees(
            "worktree /w/api\n\nworktree /w/detached\nHEAD abc\n\n",
            |_| true,
        );

        assert_eq!(found.len(), 1);
        assert_eq!(found[0].branch, None);
    }

    #[test]
    fn a_repository_with_nothing_to_report_says_so() {
        assert!(Hygiene::default().is_empty());
        assert!(Hygiene {
            stashes: stashes("stash@{0}\u{1f}1\u{1f}wip\n"),
            ..Default::default()
        }
        .is_empty()
        .eq(&false));
    }
}
