//! When an unattended maintenance run is due, and when it is refused.
//!
//! Separated from the thread that acts on it because "is it time?" is a
//! question about a clock and four stored facts, and a question of that shape
//! should be answerable without starting a scan, without a licence, and without
//! an `AppHandle`. The thread that runs on a timer is the hardest thing in this
//! codebase to observe; the decision it obeys is the easiest, and that is on
//! purpose.
//!
//! Every refusal is named. A schedule that quietly does nothing is
//! indistinguishable from a broken one — the same rule `maintenance::SkipReason`
//! exists for, applied one level up: there the question is why a project was not
//! selected, here it is why no selection was attempted at all.

use serde::{Deserialize, Serialize};

/// How often an enabled schedule runs, and the bounds it is held to.
///
/// The floor is a day because the thing being automated is measured in idle
/// *days*: running twice between two states a policy can distinguish is work
/// with no possible result. The ceiling is a month because beyond it the
/// interface would be promising maintenance the user would reasonably read as
/// broken before it ever fired.
pub const MIN_EVERY_HOURS: u32 = 24;
pub const MAX_EVERY_HOURS: u32 = 24 * 30;
const DEFAULT_EVERY_HOURS: u32 = 24 * 7;

/// Least time between two runs the low-space trigger starts. A disk that stays
/// full once everything eligible is gone would otherwise be rescanned on every
/// tick.
pub const LOW_DISK_GAP_HOURS: u32 = 6;

const BYTES_PER_GB: u64 = 1_000_000_000;

/// The schedule, which is the only part of maintenance that runs without a
/// person present.
///
/// Off by default, and deliberately not something a fresh install inherits: the
/// first unattended deletion on a machine has to be one the user turned on.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Schedule {
    pub enabled: bool,
    pub every_hours: u32,
    /// Also run when the workspace's disk has less than this many gigabytes
    /// free. `None` or `0` turns the trigger off.
    #[serde(default)]
    pub low_disk_gb: Option<u32>,
}

impl Default for Schedule {
    fn default() -> Self {
        Self {
            enabled: false,
            every_hours: DEFAULT_EVERY_HOURS,
            low_disk_gb: None,
        }
    }
}

impl Schedule {
    /// The interval, held to the bounds whatever the stored value says.
    ///
    /// A settings file is a file: it can be hand-edited, and a zero here would
    /// be a loop that scans the disk without pause. Clamping rather than
    /// rejecting keeps a damaged value from disabling maintenance silently.
    pub fn interval_hours(&self) -> u32 {
        self.every_hours.clamp(MIN_EVERY_HOURS, MAX_EVERY_HOURS)
    }

    /// The free-space threshold in bytes, `None` when the trigger is off.
    pub fn low_disk_bytes(&self) -> Option<u64> {
        self.low_disk_gb
            .filter(|gigabytes| *gigabytes > 0)
            .map(|gigabytes| u64::from(gigabytes) * BYTES_PER_GB)
    }
}

/// Why a run is not starting.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum Held {
    /// The schedule is off, which is the default and the common case.
    Disabled,
    /// Unattended maintenance is the capability Pro sells.
    NotLicensed,
    /// No folders chosen, so there is nothing to maintain.
    NoWorkspace,
    /// The interval since the last attempt has not elapsed.
    TooSoon,
    /// A scan is already running. Two scans over one folder register two target
    /// ids for the same directory, and both can be claimed for cleanup.
    ScanInProgress,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Due {
    Now,
    Held(Held),
}

/// What the scheduler knows when it wakes up.
#[derive(Debug, Clone, Copy)]
pub struct Conditions {
    pub schedule: Schedule,
    pub pro_enabled: bool,
    pub has_workspace: bool,
    pub scan_in_progress: bool,
    /// Unix seconds of the last attempt, whether or not it selected anything.
    ///
    /// The attempt is recorded rather than the last cleanup, because a run that
    /// correctly selected nothing is a run: keyed off the last deletion, a
    /// policy that matches nothing would rescan the whole workspace on every
    /// tick forever.
    pub last_run_at: Option<i64>,
    pub now: i64,
    /// Least free space across the volumes holding the workspace roots. `None`
    /// when no volume could be read.
    pub free_bytes: Option<u64>,
}

/// Whether a run may start, or the first reason it may not.
///
/// The order is the point. Licensing is asked before the clock so that an
/// expired licence reads as unlicensed rather than as perpetually too soon, and
/// the interval is asked before the scan check so a wake-up that was never due
/// does not report someone else's scan as the reason it did nothing.
pub fn due(conditions: &Conditions) -> Due {
    if !conditions.schedule.enabled {
        return Due::Held(Held::Disabled);
    }
    if !conditions.pro_enabled {
        return Due::Held(Held::NotLicensed);
    }
    if !conditions.has_workspace {
        return Due::Held(Held::NoWorkspace);
    }
    if !elapsed(conditions) && !low_on_space(conditions) {
        return Due::Held(Held::TooSoon);
    }
    if conditions.scan_in_progress {
        return Due::Held(Held::ScanInProgress);
    }
    Due::Now
}

/// Whether the interval has passed since the last attempt.
///
/// A schedule that has never run is due immediately: the user turned it on, and
/// waiting a week to honour that would read as the switch not working.
///
/// A stored time in the future is treated as elapsed. It means the clock moved
/// backwards — a timezone change, a correction, a restored backup — and the
/// alternative is maintenance that stays frozen until real time catches up.
fn elapsed(conditions: &Conditions) -> bool {
    let Some(last) = conditions.last_run_at else {
        return true;
    };
    if last > conditions.now {
        return true;
    }
    let interval = i64::from(conditions.schedule.interval_hours()) * 3_600;
    conditions.now.saturating_sub(last) >= interval
}

/// Whether free space is under the threshold and the last run is at least
/// `LOW_DISK_GAP_HOURS` old. The same clock rules as `elapsed` apply.
pub fn low_on_space(conditions: &Conditions) -> bool {
    let (Some(threshold), Some(free)) =
        (conditions.schedule.low_disk_bytes(), conditions.free_bytes)
    else {
        return false;
    };
    if free >= threshold {
        return false;
    }
    match conditions.last_run_at {
        None => true,
        Some(last) if last > conditions.now => true,
        Some(last) => conditions.now.saturating_sub(last) >= i64::from(LOW_DISK_GAP_HOURS) * 3_600,
    }
}

/// Unix seconds of the next run, for the interface to name a date.
///
/// `None` when the schedule is off or has never run — neither has a next time
/// that is a fact rather than a guess about when the user will enable it.
pub fn next_run_at(schedule: &Schedule, last_run_at: Option<i64>) -> Option<i64> {
    if !schedule.enabled {
        return None;
    }
    let last = last_run_at?;
    Some(last.saturating_add(i64::from(schedule.interval_hours()) * 3_600))
}

#[cfg(test)]
mod tests {
    use super::{
        due, low_on_space, next_run_at, Conditions, Due, Held, Schedule, LOW_DISK_GAP_HOURS,
        MAX_EVERY_HOURS,
    };

    const HOUR: i64 = 3_600;
    const DAY: i64 = 24 * HOUR;

    fn ready() -> Conditions {
        Conditions {
            schedule: Schedule {
                enabled: true,
                every_hours: 24 * 7,
                low_disk_gb: None,
            },
            pro_enabled: true,
            has_workspace: true,
            scan_in_progress: false,
            last_run_at: None,
            now: 1_000 * DAY,
            free_bytes: None,
        }
    }

    const GB: u64 = 1_000_000_000;

    /// A week-long schedule that ran an hour ago, on a disk with `free` bytes
    /// left and a 20 GB threshold.
    fn low_disk(free: u64, last_run_ago: i64) -> Conditions {
        let base = ready();
        Conditions {
            schedule: Schedule {
                low_disk_gb: Some(20),
                ..base.schedule
            },
            last_run_at: Some(base.now - last_run_ago),
            free_bytes: Some(free),
            ..base
        }
    }

    #[test]
    fn a_disk_below_the_threshold_runs_before_the_interval() {
        assert_eq!(due(&low_disk(5 * GB, 7 * HOUR)), Due::Now);
    }

    #[test]
    fn a_disk_above_the_threshold_waits_for_the_interval() {
        assert_eq!(due(&low_disk(50 * GB, 7 * HOUR)), Due::Held(Held::TooSoon));
    }

    /// Once nothing eligible is left, the disk stays full; the gap is what stops
    /// a rescan every fifteen minutes.
    #[test]
    fn low_space_waits_for_its_gap_after_a_run() {
        let gap = i64::from(LOW_DISK_GAP_HOURS) * HOUR;
        assert_eq!(due(&low_disk(5 * GB, gap - HOUR)), Due::Held(Held::TooSoon));
        assert_eq!(due(&low_disk(5 * GB, gap)), Due::Now);
    }

    #[test]
    fn low_space_never_overrides_the_switch_or_the_licence() {
        let off = Conditions {
            schedule: Schedule {
                enabled: false,
                ..low_disk(GB, DAY).schedule
            },
            ..low_disk(GB, DAY)
        };
        assert_eq!(due(&off), Due::Held(Held::Disabled));

        let free_plan = Conditions {
            pro_enabled: false,
            ..low_disk(GB, DAY)
        };
        assert_eq!(due(&free_plan), Due::Held(Held::NotLicensed));
    }

    #[test]
    fn no_threshold_or_no_reading_is_never_low() {
        let unset = Conditions {
            schedule: Schedule {
                low_disk_gb: None,
                ..low_disk(GB, DAY).schedule
            },
            ..low_disk(GB, DAY)
        };
        assert!(!low_on_space(&unset));

        let zero = Conditions {
            schedule: Schedule {
                low_disk_gb: Some(0),
                ..low_disk(GB, DAY).schedule
            },
            ..low_disk(GB, DAY)
        };
        assert!(!low_on_space(&zero));

        let unread = Conditions {
            free_bytes: None,
            ..low_disk(GB, DAY)
        };
        assert!(!low_on_space(&unread));
    }

    /// Settings written before the trigger existed have no `lowDiskGb`.
    #[test]
    fn a_schedule_saved_before_the_trigger_still_loads() {
        let schedule: Schedule =
            serde_json::from_str(r#"{"enabled":true,"everyHours":168}"#).unwrap();
        assert_eq!(schedule.low_disk_gb, None);
    }

    /// The default has to be off. The first unattended deletion on a machine is
    /// one the user turned on, never one an install inherited.
    #[test]
    fn a_fresh_install_does_not_run_maintenance_by_itself() {
        assert!(!Schedule::default().enabled);

        let conditions = Conditions {
            schedule: Schedule::default(),
            ..ready()
        };
        assert_eq!(due(&conditions), Due::Held(Held::Disabled));
    }

    #[test]
    fn a_schedule_turned_on_and_never_run_is_due_at_once() {
        assert_eq!(due(&ready()), Due::Now);
    }

    #[test]
    fn the_interval_is_respected_and_then_it_is_due() {
        let base = ready();
        let week = 7 * DAY;

        for (elapsed, expected) in [
            (0, Due::Held(Held::TooSoon)),
            (week - HOUR, Due::Held(Held::TooSoon)),
            (week, Due::Now),
            (week + DAY, Due::Now),
        ] {
            let conditions = Conditions {
                last_run_at: Some(base.now - elapsed),
                ..base
            };
            assert_eq!(due(&conditions), expected, "{elapsed} seconds after a run");
        }
    }

    /// Unattended maintenance is what Pro sells, and this is the second of the
    /// two gates that says so — the run itself checks the entitlement again
    /// before it removes anything.
    #[test]
    fn a_free_install_never_runs_unattended() {
        let conditions = Conditions {
            pro_enabled: false,
            ..ready()
        };
        assert_eq!(due(&conditions), Due::Held(Held::NotLicensed));
    }

    /// Asked before the clock, so an expired licence reads as unlicensed rather
    /// than as a run that is perpetually not due yet.
    #[test]
    fn losing_the_licence_is_reported_as_the_licence_and_not_as_the_clock() {
        let conditions = Conditions {
            pro_enabled: false,
            last_run_at: Some(1_000 * DAY),
            ..ready()
        };
        assert_eq!(due(&conditions), Due::Held(Held::NotLicensed));
    }

    #[test]
    fn there_is_nothing_to_maintain_without_a_chosen_folder() {
        let conditions = Conditions {
            has_workspace: false,
            ..ready()
        };
        assert_eq!(due(&conditions), Due::Held(Held::NoWorkspace));
    }

    /// Two scans over one folder register two target ids for the same
    /// directory, and both can be claimed for cleanup independently.
    #[test]
    fn a_run_waits_for_a_scan_that_is_already_going() {
        let conditions = Conditions {
            scan_in_progress: true,
            ..ready()
        };
        assert_eq!(due(&conditions), Due::Held(Held::ScanInProgress));
    }

    /// A wake-up that was never due should not report someone else's scan as
    /// the reason it did nothing.
    #[test]
    fn a_scan_is_not_blamed_for_a_wake_up_that_was_not_due() {
        let conditions = Conditions {
            scan_in_progress: true,
            last_run_at: Some(1_000 * DAY - HOUR),
            ..ready()
        };
        assert_eq!(due(&conditions), Due::Held(Held::TooSoon));
    }

    /// A settings file can be hand-edited, and zero would be a scan of the disk
    /// with no pause between runs.
    #[test]
    fn an_interval_below_the_floor_is_raised_to_it() {
        let schedule = Schedule {
            enabled: true,
            every_hours: 0,
            low_disk_gb: None,
        };
        assert_eq!(schedule.interval_hours(), super::MIN_EVERY_HOURS);

        let conditions = Conditions {
            schedule,
            last_run_at: Some(1_000 * DAY - HOUR),
            ..ready()
        };
        assert_eq!(
            due(&conditions),
            Due::Held(Held::TooSoon),
            "an hour after a run is never due"
        );
    }

    #[test]
    fn an_interval_above_the_ceiling_is_lowered_to_it() {
        let schedule = Schedule {
            enabled: true,
            every_hours: u32::MAX,
            low_disk_gb: None,
        };
        assert_eq!(schedule.interval_hours(), MAX_EVERY_HOURS);
    }

    /// A clock that moved backwards — a correction, a timezone change, a
    /// restored backup — must not freeze maintenance until real time catches up.
    #[test]
    fn a_last_run_in_the_future_does_not_freeze_the_schedule() {
        let base = ready();
        let conditions = Conditions {
            last_run_at: Some(base.now + 400 * DAY),
            ..base
        };
        assert_eq!(due(&conditions), Due::Now);
    }

    #[test]
    fn the_next_run_is_a_fact_only_once_there_has_been_one() {
        let schedule = Schedule {
            enabled: true,
            every_hours: 48,
            low_disk_gb: None,
        };
        assert_eq!(next_run_at(&schedule, None), None);
        assert_eq!(next_run_at(&schedule, Some(1_000)), Some(1_000 + 48 * HOUR));

        let off = Schedule {
            enabled: false,
            ..schedule
        };
        assert_eq!(
            next_run_at(&off, Some(1_000)),
            None,
            "a schedule that is off has no next run"
        );
    }

    #[test]
    fn the_schedule_crosses_the_boundary_in_camel_case() {
        let value = serde_json::to_value(Schedule::default()).unwrap();

        assert_eq!(value["enabled"], false);
        assert!(value["everyHours"].is_number());
    }
}
