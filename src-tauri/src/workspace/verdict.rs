//! What the work around a project needs, decided from signals alone.
//!
//! Pure: no filesystem, no Git, no clock. This is the code that decides whether
//! a project may ever be cleaned automatically, so it has to be testable
//! exhaustively and it has to change on its own when the world changes — a
//! `git push` turns `Protect` into `Safe` with no other edit.
//!
//! This answers "is the work around it safe?". Whether a given directory is
//! disposable is the separate question the core's confidence engine answers.
//! Automation requires both.

use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum RecoverabilityLevel {
    /// Every commit is on a remote and nothing is uncommitted.
    FullyRemote,
    /// Something exists only on this disk.
    LocalOnlyWork,
    /// A repository with no remote at all.
    NoRemote,
    /// Not a repository, or Git could not be read.
    Unknown,
}

#[derive(Debug, Clone, Copy, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum ActivityState {
    Active,
    Idle,
    Cold,
    #[default]
    Unknown,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum Verdict {
    /// Everything is on a remote and the project is cold. The only state
    /// automation may ever act on.
    Safe,
    /// Worth reclaiming, but the project is in use and will pay to reinstall.
    TradeOff,
    /// Something here exists only on this disk.
    Protect,
    /// Cold and entirely on a remote, with nothing left to reclaim. An
    /// observation, not an action: the user decides about the local copy.
    Archivable,
    /// A lockfile with no installation behind it. Needs installing, not cleaning.
    Broken,
    /// The lockfile is newer than the installation, so the install is stale.
    StaleDeps,
    /// Not enough was readable to say. Never eligible for automation.
    Unknown,
}

/// Signals the verdict is derived from. Facts only, never conclusions.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Default)]
pub struct VerdictInput {
    pub recoverability: Option<RecoverabilityLevel>,
    pub activity: ActivityState,
    pub reclaimable_bytes: u64,
    /// A lockfile exists but its installation directory does not.
    pub install_missing: bool,
    /// The lockfile has been written since the installation was made.
    pub install_stale: bool,
}

/// Weighs the signals into the decision the module offers.
///
/// Order is the safety property. `Protect` is answered before anything else,
/// because a project holding work that exists nowhere else must not be
/// described by whatever else happens to be true about it.
pub fn assess(input: VerdictInput) -> Verdict {
    match input.recoverability {
        Some(RecoverabilityLevel::LocalOnlyWork) | Some(RecoverabilityLevel::NoRemote) => {
            return Verdict::Protect
        }
        None | Some(RecoverabilityLevel::Unknown) => return Verdict::Unknown,
        Some(RecoverabilityLevel::FullyRemote) => {}
    }

    // Broken and stale describe the installation, and both are reported before
    // any offer to reclaim: cleaning an installation that is already missing or
    // already invalid recovers space the user is about to spend again anyway.
    if input.install_missing {
        return Verdict::Broken;
    }
    if input.install_stale {
        return Verdict::StaleDeps;
    }

    match input.activity {
        ActivityState::Unknown => Verdict::Unknown,
        ActivityState::Cold if input.reclaimable_bytes == 0 => Verdict::Archivable,
        ActivityState::Cold => Verdict::Safe,
        // Idle counts as in use. Being three weeks from the last commit is not
        // evidence a project is finished, and the cost of being wrong is a
        // reinstall the user did not ask for.
        ActivityState::Active | ActivityState::Idle => {
            if input.reclaimable_bytes == 0 {
                Verdict::Archivable
            } else {
                Verdict::TradeOff
            }
        }
    }
}

impl Verdict {
    /// Whether automation may act on this project without asking.
    pub fn allows_automation(&self) -> bool {
        matches!(self, Self::Safe)
    }
}

/// Days since last activity, mapped to a state.
///
/// Cold is where cleaning stops being a trade-off, so it is deliberately far
/// out: two months without a commit or a source edit.
pub fn activity_state(idle_days: Option<u32>) -> ActivityState {
    match idle_days {
        None => ActivityState::Unknown,
        Some(days) if days <= 14 => ActivityState::Active,
        Some(days) if days <= 60 => ActivityState::Idle,
        Some(_) => ActivityState::Cold,
    }
}

/// Level implied by what Git reported. `None` when Git could not be read.
pub fn recoverability_level(
    unpushed_commits: u32,
    branches_without_upstream: u32,
    stash_entries: u32,
    untracked_files: u32,
    has_remote: bool,
) -> RecoverabilityLevel {
    if !has_remote {
        return RecoverabilityLevel::NoRemote;
    }
    if unpushed_commits > 0
        || branches_without_upstream > 0
        || stash_entries > 0
        || untracked_files > 0
    {
        return RecoverabilityLevel::LocalOnlyWork;
    }
    RecoverabilityLevel::FullyRemote
}

#[cfg(test)]
mod tests {
    use super::{
        activity_state, assess, recoverability_level, ActivityState, RecoverabilityLevel, Verdict,
        VerdictInput,
    };

    fn input(recoverability: RecoverabilityLevel, activity: ActivityState) -> VerdictInput {
        VerdictInput {
            recoverability: Some(recoverability),
            activity,
            reclaimable_bytes: 1_000,
            install_missing: false,
            install_stale: false,
        }
    }

    #[test]
    fn every_combination_of_recoverability_and_activity_has_a_verdict() {
        use ActivityState::*;
        use RecoverabilityLevel::*;

        let cases = [
            (FullyRemote, Cold, Verdict::Safe),
            (FullyRemote, Idle, Verdict::TradeOff),
            (FullyRemote, Active, Verdict::TradeOff),
            (FullyRemote, ActivityState::Unknown, Verdict::Unknown),
            (LocalOnlyWork, Cold, Verdict::Protect),
            (LocalOnlyWork, Active, Verdict::Protect),
            (LocalOnlyWork, ActivityState::Unknown, Verdict::Protect),
            (NoRemote, Cold, Verdict::Protect),
            (NoRemote, Active, Verdict::Protect),
            (RecoverabilityLevel::Unknown, Cold, Verdict::Unknown),
            (RecoverabilityLevel::Unknown, Active, Verdict::Unknown),
        ];

        for (recoverability, activity, expected) in cases {
            assert_eq!(
                assess(input(recoverability, activity)),
                expected,
                "{recoverability:?} + {activity:?}"
            );
        }
    }

    /// The property the whole module exists for: work that exists only here is
    /// never described as anything else, however cold or broken it also is.
    #[test]
    fn local_only_work_outranks_every_other_signal() {
        let vulnerable = VerdictInput {
            recoverability: Some(RecoverabilityLevel::LocalOnlyWork),
            activity: ActivityState::Cold,
            reclaimable_bytes: 40_000_000_000,
            install_missing: true,
            install_stale: true,
        };

        assert_eq!(assess(vulnerable), Verdict::Protect);
    }

    #[test]
    fn a_missing_or_stale_installation_is_reported_before_any_offer_to_clean() {
        let broken = VerdictInput {
            install_missing: true,
            ..input(RecoverabilityLevel::FullyRemote, ActivityState::Cold)
        };
        let stale = VerdictInput {
            install_stale: true,
            ..input(RecoverabilityLevel::FullyRemote, ActivityState::Cold)
        };

        assert_eq!(assess(broken), Verdict::Broken);
        assert_eq!(assess(stale), Verdict::StaleDeps);
    }

    #[test]
    fn nothing_left_to_reclaim_is_an_observation_rather_than_an_offer() {
        let cold = VerdictInput {
            reclaimable_bytes: 0,
            ..input(RecoverabilityLevel::FullyRemote, ActivityState::Cold)
        };
        let active = VerdictInput {
            reclaimable_bytes: 0,
            ..input(RecoverabilityLevel::FullyRemote, ActivityState::Active)
        };

        assert_eq!(assess(cold), Verdict::Archivable);
        assert_eq!(assess(active), Verdict::Archivable);
    }

    #[test]
    fn only_safe_may_ever_be_automated() {
        for verdict in [
            Verdict::TradeOff,
            Verdict::Protect,
            Verdict::Archivable,
            Verdict::Broken,
            Verdict::StaleDeps,
            Verdict::Unknown,
        ] {
            assert!(!verdict.allows_automation(), "{verdict:?}");
        }
        assert!(Verdict::Safe.allows_automation());
    }

    /// A push is the only edit needed to change the answer.
    #[test]
    fn pushing_the_work_turns_protect_into_safe() {
        let before = VerdictInput {
            recoverability: Some(recoverability_level(2, 0, 0, 0, true)),
            ..input(RecoverabilityLevel::FullyRemote, ActivityState::Cold)
        };
        let after = VerdictInput {
            recoverability: Some(recoverability_level(0, 0, 0, 0, true)),
            ..before
        };

        assert_eq!(assess(before), Verdict::Protect);
        assert_eq!(assess(after), Verdict::Safe);
    }

    #[test]
    fn any_local_only_signal_is_enough_to_protect() {
        for (unpushed, no_upstream, stash, untracked) in
            [(1, 0, 0, 0), (0, 1, 0, 0), (0, 0, 1, 0), (0, 0, 0, 1)]
        {
            assert_eq!(
                recoverability_level(unpushed, no_upstream, stash, untracked, true),
                RecoverabilityLevel::LocalOnlyWork
            );
        }
        assert_eq!(
            recoverability_level(0, 0, 0, 0, true),
            RecoverabilityLevel::FullyRemote
        );
        assert_eq!(
            recoverability_level(0, 0, 0, 0, false),
            RecoverabilityLevel::NoRemote
        );
    }

    #[test]
    fn activity_bands_are_inclusive_at_their_edges() {
        assert_eq!(activity_state(None), ActivityState::Unknown);
        assert_eq!(activity_state(Some(0)), ActivityState::Active);
        assert_eq!(activity_state(Some(14)), ActivityState::Active);
        assert_eq!(activity_state(Some(15)), ActivityState::Idle);
        assert_eq!(activity_state(Some(60)), ActivityState::Idle);
        assert_eq!(activity_state(Some(61)), ActivityState::Cold);
    }
}
