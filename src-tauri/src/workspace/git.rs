//! Reads a repository. Every call is local, offline and read-only.

use super::verdict::{recoverability_level, RecoverabilityLevel};
use serde::Serialize;
use std::path::Path;
use std::process::Command;

#[derive(Debug, Clone, Default, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GitContext {
    pub branch: Option<String>,
    pub last_commit_summary: Option<String>,
    pub last_commit_at: Option<i64>,
    pub dirty: Option<bool>,
    /// Normalised, so the same repository cloned twice compares equal.
    pub remote: Option<String>,
    pub recoverability: Recoverability,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Recoverability {
    pub unpushed_commits: u32,
    pub branches_without_upstream: u32,
    pub stash_entries: u32,
    pub untracked_files: u32,
    pub level: RecoverabilityLevel,
}

impl Default for Recoverability {
    fn default() -> Self {
        Self {
            unpushed_commits: 0,
            branches_without_upstream: 0,
            stash_entries: 0,
            untracked_files: 0,
            level: RecoverabilityLevel::Unknown,
        }
    }
}

pub fn read(path: &Path) -> GitContext {
    if !path.join(".git").exists() {
        return GitContext::default();
    }

    let status = run(
        path,
        &[
            "status",
            "--porcelain=v2",
            "--branch",
            "--untracked-files=normal",
        ],
    );
    let tracking = run(
        path,
        &[
            "for-each-ref",
            "--format=%(upstream)%x1f%(upstream:track)",
            "refs/heads",
        ],
    );
    let stash = run(path, &["stash", "list"]);
    let log = run(path, &["log", "-1", "--format=%h%x1f%ct%x1f%s"]);
    let remote =
        run(path, &["config", "--get", "remote.origin.url"]).map(|url| normalise_remote(&url));

    let (branch, dirty, untracked_files) = parse_status(status.as_deref());
    let (unpushed_commits, branches_without_upstream) = parse_tracking(tracking.as_deref());
    let stash_entries = stash.map_or(0, |list| {
        list.lines().filter(|line| !line.is_empty()).count() as u32
    });
    let (last_commit_summary, last_commit_at) = parse_log(log.as_deref());

    let level = recoverability_level(
        unpushed_commits,
        branches_without_upstream,
        stash_entries,
        untracked_files,
        remote.is_some(),
    );

    GitContext {
        branch,
        last_commit_summary,
        last_commit_at,
        dirty,
        remote,
        recoverability: Recoverability {
            unpushed_commits,
            branches_without_upstream,
            stash_entries,
            untracked_files,
            level,
        },
    }
}

fn run(path: &Path, args: &[&str]) -> Option<String> {
    Command::new("git")
        .arg("-C")
        .arg(path)
        .args(args)
        .output()
        .ok()
        .filter(|output| output.status.success())
        .and_then(|output| String::from_utf8(output.stdout).ok())
}

/// Branch, whether anything is uncommitted, and how many files are untracked.
fn parse_status(status: Option<&str>) -> (Option<String>, Option<bool>, u32) {
    let Some(status) = status else {
        return (None, None, 0);
    };
    let mut branch = None;
    let mut changes = 0;
    let mut untracked = 0;

    for line in status.lines() {
        if let Some(head) = line.strip_prefix("# branch.head ") {
            branch = (head != "(detached)").then(|| head.to_owned());
        } else if line.starts_with('?') {
            untracked += 1;
            changes += 1;
        } else if line.starts_with('1') || line.starts_with('2') || line.starts_with('u') {
            changes += 1;
        }
    }

    (branch, Some(changes > 0), untracked)
}

/// Commits ahead of a remote, and branches that have no remote at all.
///
/// Both fields are needed. `%(upstream:track)` is empty for a branch with no
/// upstream *and* for one that is perfectly in sync, so reading it alone marks
/// every up-to-date repository as holding work that exists nowhere else.
/// `%(upstream)` is what tells the two apart.
///
/// Behind is ignored: it says something exists elsewhere, not that something
/// here is at risk.
fn parse_tracking(tracking: Option<&str>) -> (u32, u32) {
    let Some(tracking) = tracking else {
        return (0, 0);
    };
    let mut ahead = 0;
    let mut without_upstream = 0;

    for line in tracking.lines() {
        let mut fields = line.split('\u{1f}');
        let upstream = fields.next().unwrap_or_default().trim();
        let track = fields.next().unwrap_or_default().trim();

        if upstream.is_empty() {
            without_upstream += 1;
            continue;
        }
        if let Some(rest) = track.split("ahead ").nth(1) {
            let digits: String = rest.chars().take_while(char::is_ascii_digit).collect();
            ahead += digits.parse::<u32>().unwrap_or(0);
        }
    }

    (ahead, without_upstream)
}

fn parse_log(log: Option<&str>) -> (Option<String>, Option<i64>) {
    let Some(line) = log.and_then(|log| log.lines().next().map(str::to_owned)) else {
        return (None, None);
    };
    let mut parts = line.split('\u{1f}');
    let short = parts.next().unwrap_or_default().to_owned();
    let at = parts
        .next()
        .and_then(|value| value.trim().parse::<i64>().ok());
    let subject = parts.next().unwrap_or_default().trim().to_owned();
    let summary = format!("{short} {subject}").trim().to_owned();
    (Some(summary).filter(|value| !value.is_empty()), at)
}

/// Strips the parts that differ between equivalent clone URLs, so SSH and
/// HTTPS forms of the same repository compare equal.
pub fn normalise_remote(url: &str) -> String {
    let url = url.trim();
    let url = url.strip_suffix(".git").unwrap_or(url);
    let url = url
        .strip_prefix("git@")
        .map(|rest| rest.replacen(':', "/", 1))
        .unwrap_or_else(|| {
            url.strip_prefix("https://")
                .or_else(|| url.strip_prefix("http://"))
                .or_else(|| url.strip_prefix("ssh://git@"))
                .unwrap_or(url)
                .to_owned()
        });
    url.trim_end_matches('/').to_lowercase()
}

#[cfg(test)]
mod tests {
    use super::{normalise_remote, parse_log, parse_status, parse_tracking};

    #[test]
    fn equivalent_clone_urls_normalise_to_the_same_remote() {
        let expected = "github.com/uncached-app/uncached-core";
        for url in [
            "git@github.com:uncached-app/uncached-core.git",
            "https://github.com/uncached-app/uncached-core.git",
            "https://github.com/uncached-app/uncached-core",
            "ssh://git@github.com/uncached-app/uncached-core.git",
            "git@github.com:uncached-app/Uncached-Core.git",
        ] {
            assert_eq!(normalise_remote(url), expected, "{url}");
        }
    }

    #[test]
    fn status_reports_branch_changes_and_untracked_separately() {
        let status = "# branch.oid abc\n# branch.head main\n1 .M N... 100644 100644 100644 a b file.rs\n? notes.txt\n? scratch.md\n";

        let (branch, dirty, untracked) = parse_status(Some(status));

        assert_eq!(branch.as_deref(), Some("main"));
        assert_eq!(dirty, Some(true));
        assert_eq!(untracked, 2);
    }

    #[test]
    fn a_clean_tree_is_not_dirty_and_a_detached_head_has_no_branch() {
        let (branch, dirty, untracked) = parse_status(Some("# branch.head (detached)\n"));

        assert_eq!(branch, None);
        assert_eq!(dirty, Some(false));
        assert_eq!(untracked, 0);
    }

    #[test]
    fn unreadable_git_reports_nothing_rather_than_zero() {
        let (branch, dirty, untracked) = parse_status(None);

        assert_eq!(branch, None);
        assert_eq!(dirty, None, "an unknown tree must not read as clean");
        assert_eq!(untracked, 0);
    }

    /// A branch in sync prints an empty track field, exactly like a branch with
    /// no upstream at all. Reading track alone marked every up-to-date
    /// repository as holding work that exists nowhere else.
    #[test]
    fn a_branch_in_sync_is_not_mistaken_for_one_without_a_remote() {
        let tracking = "refs/remotes/origin/main\u{1f}\n";

        let (ahead, without_upstream) = parse_tracking(Some(tracking));

        assert_eq!(ahead, 0);
        assert_eq!(without_upstream, 0);
    }

    #[test]
    fn tracking_counts_commits_ahead_and_branches_with_no_upstream() {
        let tracking = concat!(
            "refs/remotes/origin/main\u{1f}[ahead 3]\n",
            "\u{1f}\n",
            "refs/remotes/origin/topic\u{1f}[ahead 1, behind 2]\n",
            "refs/remotes/origin/old\u{1f}[behind 5]\n",
        );

        let (ahead, without_upstream) = parse_tracking(Some(tracking));

        assert_eq!(ahead, 4);
        assert_eq!(without_upstream, 1);
    }

    #[test]
    fn a_commit_subject_containing_separators_survives() {
        let (summary, at) = parse_log(Some("abc123\u{1f}1700000000\u{1f}fix: handle a|b\n"));

        assert_eq!(summary.as_deref(), Some("abc123 fix: handle a|b"));
        assert_eq!(at, Some(1_700_000_000));
    }
}
