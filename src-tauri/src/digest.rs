//! The weekly notification: what was freed in the last seven days and what the
//! window last measured as reclaimable. Opt-in, Pro, and silent when there is
//! nothing worth saying.

use tauri::AppHandle;
use tauri_plugin_notification::NotificationExt;

const WEEK_SECONDS: i64 = 7 * 24 * 3_600;

/// Below this, "can be reclaimed" is not worth a notification on its own.
const RECLAIMABLE_WORTH_SAYING: u64 = 1_000_000_000;

#[derive(Debug, PartialEq, Eq)]
pub enum Due {
    No,
    /// Just turned on: start the week from now rather than notify at once.
    StartWeek,
    Now,
}

pub fn due(enabled: bool, pro_enabled: bool, last_at: Option<i64>, now: i64) -> Due {
    if !enabled || !pro_enabled {
        return Due::No;
    }
    match last_at {
        None => Due::StartWeek,
        Some(last) if last > now || now - last >= WEEK_SECONDS => Due::Now,
        Some(_) => Due::No,
    }
}

#[derive(Debug, PartialEq, Eq)]
pub enum Message {
    Both { freed: u64, reclaimable: u64 },
    Freed { freed: u64 },
    Reclaimable { reclaimable: u64 },
}

/// What the week earns: `None` when nothing was freed and too little is left.
pub fn message(freed: u64, reclaimable: Option<u64>) -> Option<Message> {
    let reclaimable = reclaimable.filter(|bytes| *bytes >= RECLAIMABLE_WORTH_SAYING);
    match (freed > 0, reclaimable) {
        (true, Some(reclaimable)) => Some(Message::Both { freed, reclaimable }),
        (true, None) => Some(Message::Freed { freed }),
        (false, Some(reclaimable)) => Some(Message::Reclaimable { reclaimable }),
        (false, None) => None,
    }
}

/// Called from the scheduler's tick. The week is stamped whether or not it
/// had anything to say, so a quiet week does not retry every fifteen minutes.
pub fn tick(app: &AppHandle, settings: &crate::settings::AppSettings, now: i64) {
    let pro_enabled = crate::commands::entitlements::current_status().pro_enabled;
    match due(
        settings.weekly_digest,
        pro_enabled,
        settings.weekly_digest_last_at,
        now,
    ) {
        Due::No => return,
        Due::StartWeek => {}
        Due::Now => send(app, now),
    }
    if let Err(error) = crate::settings::record_weekly_digest(app, now) {
        crate::logging::warn(
            "digest",
            &format!("could not stamp the week error=\"{error}\""),
        );
    }
}

fn send(app: &AppHandle, now: i64) {
    let since = chrono::DateTime::from_timestamp(now - WEEK_SECONDS, 0).unwrap_or_default();
    let freed = crate::commands::history::freed_since(app, since);
    let Some(message) = message(freed, crate::tray::reclaimable()) else {
        return;
    };

    let strings = crate::native_strings::current();
    let size = |bytes: u64| crate::native_strings::localized_size(bytes, &strings);
    let fill = |template: &str, values: &[(&str, &str)]| {
        crate::native_strings::fill(template, &strings.locale, values)
    };
    let body = match message {
        Message::Both { freed, reclaimable } => fill(
            &strings.digest_both,
            &[("freed", &size(freed)), ("size", &size(reclaimable))],
        ),
        Message::Freed { freed } => fill(&strings.digest_freed, &[("freed", &size(freed))]),
        Message::Reclaimable { reclaimable } => {
            fill(&strings.digest_reclaimable, &[("size", &size(reclaimable))])
        }
    };
    let _ = app
        .notification()
        .builder()
        .title(&strings.digest_title)
        .body(body)
        .show();
}

#[cfg(test)]
mod tests {
    use super::{due, message, Due, Message, WEEK_SECONDS};

    const GB: u64 = 1_000_000_000;

    #[test]
    fn off_or_free_never_sends() {
        assert_eq!(due(false, true, Some(0), WEEK_SECONDS * 3), Due::No);
        assert_eq!(due(true, false, Some(0), WEEK_SECONDS * 3), Due::No);
    }

    #[test]
    fn turning_it_on_starts_the_week_instead_of_sending() {
        assert_eq!(due(true, true, None, 1_000), Due::StartWeek);
    }

    #[test]
    fn it_sends_once_a_week() {
        let last = 10 * WEEK_SECONDS;
        assert_eq!(
            due(true, true, Some(last), last + WEEK_SECONDS - 1),
            Due::No
        );
        assert_eq!(due(true, true, Some(last), last + WEEK_SECONDS), Due::Now);
        assert_eq!(
            due(true, true, Some(last + 999), last),
            Due::Now,
            "a clock that moved back does not freeze it"
        );
    }

    #[test]
    fn a_week_with_nothing_to_say_stays_silent() {
        assert_eq!(message(0, None), None);
        assert_eq!(message(0, Some(GB - 1)), None);
    }

    #[test]
    fn the_message_says_only_what_happened() {
        assert_eq!(
            message(3 * GB, Some(8 * GB)),
            Some(Message::Both {
                freed: 3 * GB,
                reclaimable: 8 * GB
            })
        );
        assert_eq!(
            message(3 * GB, Some(10)),
            Some(Message::Freed { freed: 3 * GB })
        );
        assert_eq!(
            message(0, Some(8 * GB)),
            Some(Message::Reclaimable {
                reclaimable: 8 * GB
            })
        );
    }
}
