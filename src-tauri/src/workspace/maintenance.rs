//! Which projects a maintenance policy is allowed to touch.
//!
//! This is the code that would authorise deleting something nobody watched
//! being deleted, so it lives here rather than in the interface, and it is
//! written to refuse rather than to include. Three rules from
//! WORKSPACE_REDESIGN sections 4 and 14 are structural, not configurable:
//!
//!   - only `Safe` is eligible. `Protect` holds work that exists nowhere else,
//!     and `Unknown` means the core could not read enough to judge — both stop
//!     automation rather than falling through to a default;
//!   - a project has to have been quiet for the configured age. Freshly built
//!     output belongs to work in progress;
//!   - nothing is selected without a measurement. A project whose footprint has
//!     not arrived yet is not "zero bytes", it is unknown.
//!
//! The policy chooses projects. It never chooses paths: what is removed inside
//! a selected project is still decided by the providers, and cleanup still
//! re-validates every target before touching it.

use super::verdict::Verdict;
use serde::{Deserialize, Serialize};

/// Days a project must have been idle before a policy may select it.
const DEFAULT_MIN_IDLE_DAYS: u32 = 90;

/// Below this a run would be noise rather than a reclaim.
const DEFAULT_MIN_BYTES: u64 = 500 * 1024 * 1024;

/// What the user gets to choose. Everything absent from here is absent on
/// purpose: the eligible verdict and the removal mode are safety properties,
/// and a safety property with a control beside it is a setting.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MaintenancePolicy {
    pub min_idle_days: u32,
    pub min_bytes: u64,
}

impl Default for MaintenancePolicy {
    fn default() -> Self {
        Self {
            min_idle_days: DEFAULT_MIN_IDLE_DAYS,
            min_bytes: DEFAULT_MIN_BYTES,
        }
    }
}

/// Why a project was not selected, in the order the rules are applied.
///
/// Returned rather than discarded because a policy that quietly matches nothing
/// is indistinguishable from a broken one, and the screen has to be able to say
/// which rule did the excluding.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum SkipReason {
    Verdict,
    Unmeasured,
    UnknownActivity,
    TooRecent,
    TooSmall,
}

/// One project, reduced to the four facts the policy reads.
///
/// Every one of them was produced by Rust — the verdict by `verdict::assess`,
/// the weight by `measure_project_footprint`, the idle days by the index. The
/// interface carries them back rather than re-deriving any of them.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Candidate {
    pub path: String,
    pub name: String,
    pub verdict: Verdict,
    /// `None` when activity could not be read. Never treated as zero.
    pub idle_days: Option<u32>,
    /// `None` while the footprint is still being measured.
    pub reclaimable_bytes: Option<u64>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Selected {
    pub path: String,
    pub name: String,
    pub bytes: u64,
    pub idle_days: u32,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Skipped {
    pub path: String,
    pub name: String,
    pub reason: SkipReason,
    pub verdict: Verdict,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct Preview {
    pub selected: Vec<Selected>,
    pub skipped: Vec<Skipped>,
    pub bytes: u64,
    /// Counted separately because it is the one exclusion that is a finding in
    /// itself: a policy is silently doing nothing while work sits unprotected.
    pub protected_count: usize,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Outcome {
    Eligible { bytes: u64, idle_days: u32 },
    Skipped(SkipReason),
}

/// Applies the rules to one project, in the order that decides the reason.
pub fn evaluate(candidate: &Candidate, policy: &MaintenancePolicy) -> Outcome {
    if !candidate.verdict.allows_automation() {
        return Outcome::Skipped(SkipReason::Verdict);
    }
    let Some(bytes) = candidate.reclaimable_bytes else {
        return Outcome::Skipped(SkipReason::Unmeasured);
    };
    let Some(idle_days) = candidate.idle_days else {
        return Outcome::Skipped(SkipReason::UnknownActivity);
    };
    if idle_days < policy.min_idle_days {
        return Outcome::Skipped(SkipReason::TooRecent);
    }
    if bytes < policy.min_bytes {
        return Outcome::Skipped(SkipReason::TooSmall);
    }
    Outcome::Eligible { bytes, idle_days }
}

/// What this policy would do right now, and what it left out.
pub fn select(candidates: &[Candidate], policy: &MaintenancePolicy) -> Preview {
    let mut selected = Vec::new();
    let mut skipped = Vec::new();

    for candidate in candidates {
        match evaluate(candidate, policy) {
            Outcome::Eligible { bytes, idle_days } => selected.push(Selected {
                path: candidate.path.clone(),
                name: candidate.name.clone(),
                bytes,
                idle_days,
            }),
            Outcome::Skipped(reason) => skipped.push(Skipped {
                path: candidate.path.clone(),
                name: candidate.name.clone(),
                reason,
                verdict: candidate.verdict,
            }),
        }
    }

    // Heaviest first, so a preview reads top down. Stable, so equal weights keep
    // the order the index discovered them in rather than an arbitrary one.
    selected.sort_by_key(|entry| std::cmp::Reverse(entry.bytes));

    Preview {
        bytes: selected
            .iter()
            .fold(0u64, |total, entry| total.saturating_add(entry.bytes)),
        protected_count: skipped
            .iter()
            .filter(|entry| entry.verdict == Verdict::Protect)
            .count(),
        selected,
        skipped,
    }
}

#[cfg(test)]
mod tests {
    use super::{evaluate, select, Candidate, MaintenancePolicy, Outcome, SkipReason};
    use crate::workspace::verdict::Verdict;

    const GB: u64 = 1024 * 1024 * 1024;

    fn candidate(name: &str, verdict: Verdict, idle_days: u32, bytes: u64) -> Candidate {
        Candidate {
            path: format!("/w/{name}"),
            name: name.to_owned(),
            verdict,
            idle_days: Some(idle_days),
            reclaimable_bytes: Some(bytes),
        }
    }

    fn reason(candidate: &Candidate, policy: &MaintenancePolicy) -> Option<SkipReason> {
        match evaluate(candidate, policy) {
            Outcome::Skipped(reason) => Some(reason),
            Outcome::Eligible { .. } => None,
        }
    }

    /// Widening this is a safety decision, not a setting.
    #[test]
    fn only_the_safe_verdict_is_ever_eligible() {
        let policy = MaintenancePolicy::default();
        for verdict in [
            Verdict::Protect,
            Verdict::Unknown,
            Verdict::TradeOff,
            Verdict::Broken,
            Verdict::StaleDeps,
            Verdict::Archivable,
        ] {
            let preview = select(&[candidate("x", verdict, 500, 40 * GB)], &policy);
            assert!(
                preview.selected.is_empty(),
                "{verdict:?} must not be automated"
            );
            assert_eq!(preview.skipped[0].reason, SkipReason::Verdict);
        }
        assert_eq!(
            select(&[candidate("x", Verdict::Safe, 500, 40 * GB)], &policy)
                .selected
                .len(),
            1
        );
    }

    #[test]
    fn a_cold_project_with_everything_on_a_remote_is_selected() {
        let preview = select(
            &[candidate("old-dashboard", Verdict::Safe, 218, 22 * GB)],
            &MaintenancePolicy::default(),
        );

        assert_eq!(preview.selected.len(), 1);
        assert_eq!(preview.bytes, 22 * GB);
        assert_eq!(preview.selected[0].idle_days, 218);
    }

    #[test]
    fn work_that_exists_only_on_this_disk_is_never_selected_however_cold() {
        let preview = select(
            &[candidate("unpushed", Verdict::Protect, 900, 50 * GB)],
            &MaintenancePolicy::default(),
        );

        assert!(preview.selected.is_empty());
        assert_eq!(preview.protected_count, 1);
        assert_eq!(preview.skipped[0].reason, SkipReason::Verdict);
    }

    /// Not "zero bytes": a project whose weight has not arrived is unknown, and
    /// selecting it would be selecting on a number nothing measured.
    #[test]
    fn a_project_with_no_measurement_yet_is_unknown_rather_than_empty() {
        let pending = Candidate {
            reclaimable_bytes: None,
            ..candidate("pending", Verdict::Safe, 400, 0)
        };

        assert_eq!(
            reason(&pending, &MaintenancePolicy::default()),
            Some(SkipReason::Unmeasured)
        );
    }

    #[test]
    fn a_project_whose_activity_cannot_be_read_is_never_selected() {
        let mystery = Candidate {
            idle_days: None,
            ..candidate("mystery", Verdict::Safe, 0, 9 * GB)
        };

        assert_eq!(
            reason(&mystery, &MaintenancePolicy::default()),
            Some(SkipReason::UnknownActivity)
        );
    }

    #[test]
    fn recent_work_is_left_alone_and_the_reason_says_so() {
        assert_eq!(
            reason(
                &candidate("api", Verdict::Safe, 12, 30 * GB),
                &MaintenancePolicy::default()
            ),
            Some(SkipReason::TooRecent)
        );
    }

    #[test]
    fn a_run_is_never_noise() {
        assert_eq!(
            reason(
                &candidate("tiny", Verdict::Safe, 400, 2 * 1024 * 1024),
                &MaintenancePolicy::default()
            ),
            Some(SkipReason::TooSmall)
        );
    }

    #[test]
    fn the_age_threshold_is_the_users_and_it_is_honoured() {
        let projects = [
            candidate("a", Verdict::Safe, 45, 5 * GB),
            candidate("b", Verdict::Safe, 120, 5 * GB),
        ];

        let strict = select(
            &projects,
            &MaintenancePolicy {
                min_idle_days: 90,
                ..Default::default()
            },
        );
        assert_eq!(
            strict
                .selected
                .iter()
                .map(|entry| entry.name.as_str())
                .collect::<Vec<_>>(),
            vec!["b"]
        );

        let relaxed = select(
            &projects,
            &MaintenancePolicy {
                min_idle_days: 30,
                ..Default::default()
            },
        );
        assert_eq!(relaxed.selected.len(), 2);
    }

    #[test]
    fn the_size_floor_is_the_users_too() {
        let tiny = [candidate("tiny", Verdict::Safe, 400, 100 * 1024 * 1024)];

        assert!(select(&tiny, &MaintenancePolicy::default())
            .selected
            .is_empty());
        assert_eq!(
            select(
                &tiny,
                &MaintenancePolicy {
                    min_bytes: 50 * 1024 * 1024,
                    ..Default::default()
                }
            )
            .selected
            .len(),
            1
        );
    }

    #[test]
    fn the_heaviest_selection_leads_so_a_preview_reads_top_down() {
        let preview = select(
            &[
                candidate("small", Verdict::Safe, 400, GB),
                candidate("large", Verdict::Safe, 400, 30 * GB),
            ],
            &MaintenancePolicy::default(),
        );

        assert_eq!(
            preview
                .selected
                .iter()
                .map(|entry| entry.name.as_str())
                .collect::<Vec<_>>(),
            vec!["large", "small"]
        );
        assert_eq!(preview.bytes, 31 * GB);
    }

    /// Silence is indistinguishable from a broken policy.
    #[test]
    fn a_policy_that_matches_nothing_still_explains_itself() {
        let preview = select(
            &[
                candidate("api", Verdict::Safe, 3, 9 * GB),
                candidate("secret", Verdict::Protect, 400, 9 * GB),
            ],
            &MaintenancePolicy::default(),
        );

        assert!(preview.selected.is_empty());
        assert_eq!(preview.skipped.len(), 2);
        let mut reasons: Vec<SkipReason> =
            preview.skipped.iter().map(|entry| entry.reason).collect();
        reasons.sort_by_key(|reason| format!("{reason:?}"));
        assert_eq!(reasons, vec![SkipReason::TooRecent, SkipReason::Verdict]);
    }

    #[test]
    fn the_default_policy_is_ninety_days_and_half_a_gigabyte() {
        let policy = MaintenancePolicy::default();
        assert_eq!(policy.min_idle_days, 90);
        assert_eq!(policy.min_bytes, 500 * 1024 * 1024);
    }

    /// The wire names the interface reads. Renaming one of these silently is how
    /// a skip reason stops being explained on screen.
    #[test]
    fn reasons_cross_the_boundary_in_camel_case() {
        let names: Vec<String> = [
            SkipReason::Verdict,
            SkipReason::Unmeasured,
            SkipReason::UnknownActivity,
            SkipReason::TooRecent,
            SkipReason::TooSmall,
        ]
        .iter()
        .map(|reason| {
            serde_json::to_value(reason)
                .unwrap()
                .as_str()
                .unwrap()
                .to_owned()
        })
        .collect();

        assert_eq!(
            names,
            vec![
                "verdict",
                "unmeasured",
                "unknownActivity",
                "tooRecent",
                "tooSmall"
            ]
        );
    }

    #[test]
    fn a_policy_crosses_the_boundary_in_camel_case() {
        let value = serde_json::to_value(MaintenancePolicy::default()).unwrap();

        assert_eq!(value["minIdleDays"], 90);
        assert_eq!(value["minBytes"], 500 * 1024 * 1024);
    }
}
