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
    /// As Git reported it, because this is what the user is shown. Normalising
    /// it here once meant the interface displayed a lowercased, `.git`-stripped
    /// string that was no longer anything anybody had typed.
    pub remote: Option<String>,
    /// The same remote, reduced to what makes two clones the same repository.
    /// Never crosses the wire: comparing clones is a decision made in here.
    #[serde(skip)]
    pub remote_key: Option<String>,
    /// A remote that does not leave this machine — a sibling directory, a bare
    /// repository on the same disk, `file://`. It is a backup of the working
    /// copy and it is not somewhere else, which is the distinction every
    /// sentence about recoverability in this product depends on.
    pub remote_is_local: bool,
    /// Commits the current branch's upstream has and it does not.
    ///
    /// `None` when there is no upstream to be behind, and worth only as much as
    /// the fetch below it: this is read from a remote-tracking ref, which is a
    /// record of the last conversation with the remote rather than of the remote.
    /// A repository nobody has fetched in a month is not `0 behind`, it is
    /// unchecked, and the interface has to say the second thing.
    pub behind: Option<u32>,
    /// When this repository last spoke to its remote, from `.git/FETCH_HEAD`.
    /// `None` means it never has.
    pub last_fetch_at: Option<i64>,
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
    let remote = run(path, &["config", "--get", "remote.origin.url"])
        .map(|url| url.trim().to_owned())
        .filter(|url| !url.is_empty());
    let remote_key = remote.as_deref().map(normalise_remote);
    let off_machine = remote.as_deref().is_some_and(remote_leaves_the_machine);

    let (branch, dirty, untracked_files) = parse_status(status.as_deref());
    let tracking = parse_tracking(tracking.as_deref());
    let Tracking {
        ahead: unpushed_commits,
        branches_without_upstream,
        ..
    } = tracking;
    let stash_entries = stash.map_or(0, |list| {
        list.lines().filter(|line| !line.is_empty()).count() as u32
    });
    let (last_commit_summary, last_commit_at) = parse_log(log.as_deref());

    // `off_machine`, not `remote.is_some()`. "Everything is on a remote" is the
    // sentence that lets an unattended cleanup touch a project, and a bare
    // repository in a sibling folder does not make it true: one disk failure
    // takes the working copy and the backup together.
    let level = recoverability_level(
        unpushed_commits,
        branches_without_upstream,
        stash_entries,
        untracked_files,
        off_machine,
    );

    GitContext {
        branch,
        last_commit_summary,
        last_commit_at,
        dirty,
        remote_is_local: remote.is_some() && !off_machine,
        behind: tracking.behind,
        last_fetch_at: last_fetch_at(path),
        remote,
        remote_key,
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

/// What every local branch's upstream says about it.
#[derive(Debug, Default, PartialEq, Eq)]
struct Tracking {
    /// Summed across branches: this is the recoverability question, and work
    /// unpushed on any branch is work that exists only on this disk.
    ahead: u32,
    branches_without_upstream: u32,
    /// Not summed: being behind is a fact about one branch, and adding up how
    /// far five branches have fallen behind produces a number about nothing.
    /// `None` when no branch reported an upstream to be behind.
    behind: Option<u32>,
}

/// Reads `%(upstream)` and `%(upstream:track)` for every local branch.
///
/// Both fields are needed. `%(upstream:track)` is empty for a branch with no
/// upstream *and* for one that is perfectly in sync, so reading it alone marks
/// every up-to-date repository as holding work that exists nowhere else.
/// `%(upstream)` is what tells the two apart.
///
/// Behind never reaches recoverability. It says something exists elsewhere, not
/// that something here is at risk, and letting it decide whether a project may
/// be cleaned unattended would make a `git fetch` change what can be deleted.
fn parse_tracking(tracking: Option<&str>) -> Tracking {
    let Some(tracking) = tracking else {
        return Tracking::default();
    };
    let mut result = Tracking::default();

    for line in tracking.lines() {
        let mut fields = line.split('\u{1f}');
        let upstream = fields.next().unwrap_or_default().trim();
        let track = fields.next().unwrap_or_default().trim();

        if upstream.is_empty() {
            result.branches_without_upstream += 1;
            continue;
        }
        result.ahead += count_after(track, "ahead ").unwrap_or(0);
        // Max rather than sum, and only over branches that have an upstream: the
        // figure the interface shows is "this branch is N behind", and the worst
        // one is the honest headline.
        if let Some(behind) = count_after(track, "behind ") {
            result.behind = Some(result.behind.map_or(behind, |current| current.max(behind)));
        } else if !track.contains("gone") {
            result.behind = Some(result.behind.unwrap_or(0));
        }
    }

    result
}

fn count_after(track: &str, marker: &str) -> Option<u32> {
    let rest = track.split(marker).nth(1)?;
    let digits: String = rest.chars().take_while(char::is_ascii_digit).collect();
    digits.parse().ok()
}

/// When the repository last spoke to its remote.
///
/// `.git/FETCH_HEAD` is rewritten by every fetch and pull and by nothing else,
/// so its modification time is the one record of that conversation that does not
/// require asking the network what the network already said.
fn last_fetch_at(path: &Path) -> Option<i64> {
    let modified = std::fs::metadata(path.join(".git").join("FETCH_HEAD"))
        .ok()?
        .modified()
        .ok()?;
    modified
        .duration_since(std::time::UNIX_EPOCH)
        .ok()
        .map(|elapsed| elapsed.as_secs() as i64)
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

/// Whether a remote is somewhere other than this machine.
///
/// The question is not whether Git can push to it — Git is happy to push into
/// the folder next door. It is whether a second copy of the work exists
/// anywhere the disk cannot take with it.
///
/// Deliberately strict: a host with no dot in it, the kind a LAN server has, is
/// read as local. Erring that way costs a project the `safe` verdict and keeps
/// it out of automation, which is the direction to be wrong in.
pub fn remote_leaves_the_machine(url: &str) -> bool {
    let url = url.trim();
    if url.is_empty() {
        return false;
    }
    if let Some((scheme, rest)) = url.split_once("://") {
        // `file://` is the explicit spelling of "a path on this machine".
        if scheme.eq_ignore_ascii_case("file") {
            return false;
        }
        return rest.split('/').next().is_some_and(off_machine_host);
    }
    // scp-style, `user@host:path`. A Windows drive letter wears the same
    // punctuation and is not a host.
    if let Some((head, tail)) = url.split_once(':') {
        return !tail.is_empty() && off_machine_host(head);
    }
    false
}

fn off_machine_host(authority: &str) -> bool {
    let host = authority.rsplit('@').next().unwrap_or(authority);
    let host = host.split(':').next().unwrap_or(host);
    if host.is_empty() || host.eq_ignore_ascii_case("localhost") {
        return false;
    }
    host.contains('.')
        && host
            .chars()
            .all(|character| character.is_ascii_alphanumeric() || matches!(character, '.' | '-'))
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
    use super::{
        normalise_remote, parse_log, parse_status, parse_tracking, remote_leaves_the_machine,
    };

    /// The distinction the `safe` verdict rests on. Everything below is a
    /// remote Git will happily push to; only some of them are somewhere else.
    #[test]
    fn a_remote_on_a_server_is_somewhere_else() {
        for url in [
            "git@github.com:acme/app.git",
            "https://github.com/acme/app",
            "http://gitlab.example.com/acme/app.git",
            "ssh://git@git.company.dev:2222/team/app.git",
            "git://git.kernel.org/pub/scm/linux.git",
            "github.com:acme/app.git",
        ] {
            assert!(remote_leaves_the_machine(url), "{url}");
        }
    }

    /// The one that started this: a bare repository beside the working copy.
    /// Git calls it a remote; one disk failure takes both.
    #[test]
    fn a_remote_on_this_disk_is_not_somewhere_else() {
        for url in [
            "/Users/natan/documents/workspace/.bench-remotes/blog-engine",
            "../mirrors/app.git",
            "./app.git",
            "~/backups/app.git",
            "file:///Users/natan/backups/app.git",
            "C:\\Users\\natan\\mirrors\\app.git",
            "ssh://localhost/srv/git/app.git",
            "localhost:app.git",
            "",
            "   ",
        ] {
            assert!(!remote_leaves_the_machine(url), "{url}");
        }
    }

    /// A LAN host has no dot and reads as local. That costs the project its
    /// `safe` verdict and keeps it away from automation, which is the
    /// direction to be wrong in.
    #[test]
    fn a_host_that_cannot_be_told_apart_from_a_path_is_treated_as_local() {
        assert!(!remote_leaves_the_machine("gitserver:team/app.git"));
    }

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
        let tracking = parse_tracking(Some("refs/remotes/origin/main\u{1f}\n"));

        assert_eq!(tracking.ahead, 0);
        assert_eq!(tracking.branches_without_upstream, 0);
        assert_eq!(
            tracking.behind,
            Some(0),
            "in sync is a reading, not a silence"
        );
    }

    #[test]
    fn tracking_counts_commits_ahead_and_branches_with_no_upstream() {
        let tracking = parse_tracking(Some(concat!(
            "refs/remotes/origin/main\u{1f}[ahead 3]\n",
            "\u{1f}\n",
            "refs/remotes/origin/topic\u{1f}[ahead 1, behind 2]\n",
            "refs/remotes/origin/old\u{1f}[behind 5]\n",
        )));

        assert_eq!(tracking.ahead, 4);
        assert_eq!(tracking.branches_without_upstream, 1);
    }

    /// Summed, five branches one commit behind would read as five commits
    /// behind, which describes no branch that exists.
    #[test]
    fn behind_is_the_worst_branch_rather_than_the_total() {
        let tracking = parse_tracking(Some(concat!(
            "refs/remotes/origin/main\u{1f}[behind 2]\n",
            "refs/remotes/origin/topic\u{1f}[ahead 1, behind 7]\n",
            "refs/remotes/origin/other\u{1f}[behind 3]\n",
        )));

        assert_eq!(tracking.behind, Some(7));
    }

    /// A repository with nothing to be behind of has no number, and the
    /// interface has to say that rather than print a zero it invented.
    #[test]
    fn a_repository_with_no_upstream_anywhere_is_not_behind_by_zero() {
        let tracking = parse_tracking(Some("\u{1f}\n\u{1f}\n"));

        assert_eq!(tracking.behind, None);
        assert_eq!(tracking.branches_without_upstream, 2);
        assert_eq!(parse_tracking(None).behind, None);
    }

    /// A branch whose upstream was deleted is not in sync with it. Counting it
    /// as `behind 0` would say the remote agrees, when the remote is gone.
    #[test]
    fn a_branch_whose_upstream_is_gone_reports_no_distance() {
        let tracking = parse_tracking(Some("refs/remotes/origin/dead\u{1f}[gone]\n"));

        assert_eq!(tracking.behind, None);
        assert_eq!(tracking.ahead, 0);
    }

    #[test]
    fn a_commit_subject_containing_separators_survives() {
        let (summary, at) = parse_log(Some("abc123\u{1f}1700000000\u{1f}fix: handle a|b\n"));

        assert_eq!(summary.as_deref(), Some("abc123 fix: handle a|b"));
        assert_eq!(at, Some(1_700_000_000));
    }
}
