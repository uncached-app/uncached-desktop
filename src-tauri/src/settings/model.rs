//! What the user has chosen, and what a fresh install starts with.
//!
//! The shape of the settings file and nothing else: reading and writing it is
//! `store`, and what the app does when one changes is the commands' business.

use crate::models::action::CleanMode;
use serde::{Deserialize, Serialize};

/// Settings written by an older version are missing whatever was added since,
/// and refusing the whole file over an absent field means a released app stops
/// loading its own settings on upgrade — which is exactly what happened when
/// `keepRunningInBackground` was added.
///
/// `default` at the container level rather than on each field: the per-field
/// form works until someone forgets it once, and that once breaks every
/// existing install. Malformed JSON still fails, so a file that is damaged
/// rather than merely old is not silently replaced by defaults.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct AppSettings {
    pub open_at_startup: bool,
    /// Closing the window hides it to the tray instead of quitting.
    pub keep_running_in_background: bool,
    /// Whether the scan looks outside the chosen folders, and at what.
    ///
    /// These are the only detection switches left. Inside a workspace, an
    /// ignore rule already says "never touch anything called this, anywhere",
    /// covers every category rather than five of them, and wins against the
    /// provider, the confidence and a schedule. A toggle beside it would be a
    /// weaker duplicate.
    ///
    /// Outside the workspace there is no equivalent: these caches live under
    /// paths the user never chose, belong to tools rather than to projects, and
    /// each is a different decision — emptying a package manager store slows
    /// every future install, while an editor's index costs a reopen.
    pub detect_package_manager_caches: bool,
    pub detect_ai_tool_caches: bool,
    pub detect_editor_caches: bool,
    /// Xcode's own directories: DerivedData, device support, the simulator.
    ///
    /// Its own switch rather than folded into the editor caches, which is where
    /// it used to be described and never was. Turning those off left every
    /// Xcode row in place, including the two that can only ever be reported —
    /// a control that announced something it did not do.
    pub detect_xcode_data: bool,
    /// Unity's and Godot's own caches, outside any project.
    ///
    /// Defaulted rather than required, so a settings file written before this
    /// existed still loads.
    #[serde(default = "enabled")]
    pub detect_game_engine_caches: bool,
    /// The Android SDK's machine-wide downloads and its emulators.
    #[serde(default = "enabled")]
    pub detect_android_sdk: bool,
    /// Docker Desktop's disk image, which is reported and never removed here.
    #[serde(default = "enabled")]
    pub detect_container_storage: bool,
    pub remember_last_workspace: bool,
    pub check_for_updates: bool,
    pub default_clean_mode: CleanMode,
    /// Paths the user has told us to leave alone, one rule per line, in
    /// `.gitignore` syntax. Stored as the text they typed rather than as
    /// compiled rules: the list is theirs to read and edit, and a line that
    /// fails to compile has to survive a round trip so it can be fixed.
    #[serde(default)]
    pub ignore_rules: String,
    /// Folders the user last chose to scan, so the app opens on them.
    #[serde(default)]
    pub workspace_roots: Vec<String>,
    pub appearance: Appearance,
    /// The interface language, or the operating system's.
    #[serde(default)]
    pub language: Language,
    /// Whether the workspace's filter column is folded away.
    ///
    /// A view preference rather than a setting anyone goes looking for, and
    /// kept here because it is a decision made once, and a window that forgets
    /// it is a window that asks again every time.
    #[serde(default)]
    pub workspace_sidebar_hidden: bool,
    /// Which span the Insights report is read over, by grain id.
    ///
    /// A string rather than an enum: the grains are `report.mjs`'s, the set has
    /// grown before, and a value this side does not recognise is one the
    /// frontend falls back from — which is a better failure than refusing to
    /// load a settings file over a word.
    #[serde(default = "default_grain")]
    pub insights_grain: String,
    /// Keys the user bound differently, by action id.
    ///
    /// Overrides only. The shipped bindings live in `src/actions.ts`, so a key
    /// somebody changed survives an update that changes the default, and an
    /// entry for an action that no longer exists is dropped when it is read
    /// rather than kept as a line nothing can obey.
    #[serde(default)]
    pub shortcuts: std::collections::HashMap<String, String>,
    /// A theme file in `<config>/themes`, by its file name without `.json`.
    ///
    /// `None` is the palette the app ships with, which is what `appearance`
    /// alone decides. A theme names some of the same colours and leaves the
    /// rest; a theme whose file is gone falls back to the built-in rather than
    /// leaving the window half-painted.
    #[serde(default)]
    pub theme: Option<String>,
    /// The Dock or window icon variant, by id in `app_icon::VARIANTS`. `None`
    /// is the bundle's own icon. Applied only on Pro.
    #[serde(default)]
    pub app_icon: Option<String>,
    /// Which detected editor and terminal a project opens in.
    ///
    /// A launcher id, or `None` for "whichever detection ranks first". Stored
    /// rather than inferred because there is nothing to infer from: macOS has
    /// no default-terminal setting at all, and no platform has a default
    /// *editor* in any sense a directory-opening app could read. Picking from
    /// what was found is not the thing the original note warned against —
    /// that was asking someone to type the name of their editor.
    #[serde(default)]
    pub preferred_editor: Option<String>,
    #[serde(default)]
    pub preferred_terminal: Option<String>,
    #[serde(default)]
    pub last_cleanup: Option<LastCleanup>,
    /// The maintenance policy, which is the only thing on that screen the user
    /// chooses. Stored rather than held in the window because switching module
    /// unmounts the screen, and a threshold that resets when you look away is
    /// not a setting.
    #[serde(default)]
    pub maintenance: crate::workspace::maintenance::MaintenancePolicy,
    /// Whether that policy also runs with nobody present, and how often. Kept
    /// beside the policy rather than inside it because they answer different
    /// questions: the policy decides what may be removed, the schedule decides
    /// whether anyone has to be watching.
    #[serde(default)]
    pub maintenance_schedule: crate::workspace::schedule::Schedule,
    /// Unix seconds of the last unattended attempt, whether or not it selected
    /// anything.
    ///
    /// Recorded here rather than read back from the cleanup log because a run
    /// that correctly selected nothing writes no log line, and a schedule keyed
    /// off the last deletion would rescan the whole workspace on every tick for
    /// as long as the policy matched nothing.
    #[serde(default)]
    pub maintenance_last_run_at: Option<i64>,
    /// A weekly notification of what was freed and what is left. Off until the
    /// user turns it on; Pro.
    #[serde(default)]
    pub weekly_digest: bool,
    /// Unix seconds of the last digest, or of turning it on.
    #[serde(default)]
    pub weekly_digest_last_at: Option<i64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LastCleanup {
    pub removed: u64,
    pub freed_bytes: u64,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum Appearance {
    Dark,
    Light,
    System,
}

/// Serialized as the BCP 47 tag the interface uses for the same language.
#[derive(Debug, Clone, Copy, Default, Serialize, Deserialize, PartialEq, Eq)]
pub enum Language {
    #[default]
    #[serde(rename = "system")]
    System,
    #[serde(rename = "en")]
    English,
    #[serde(rename = "pt-BR")]
    PortugueseBrazil,
    #[serde(rename = "es")]
    Spanish,
    #[serde(rename = "de")]
    German,
    #[serde(rename = "ja")]
    Japanese,
    #[serde(rename = "ar")]
    Arabic,
}

fn enabled() -> bool {
    true
}

impl Default for AppSettings {
    fn default() -> Self {
        Self {
            // On by default, and honoured: the plugin registers a login item
            // that launches with `--minimized`, so the app is present without
            // putting a window in front of anyone. A background utility that
            // has to be remembered is a background utility nobody uses.
            open_at_startup: true,
            keep_running_in_background: true,
            detect_package_manager_caches: true,
            detect_ai_tool_caches: true,
            detect_editor_caches: true,
            detect_xcode_data: true,
            detect_game_engine_caches: true,
            detect_android_sdk: true,
            detect_container_storage: true,
            remember_last_workspace: true,
            check_for_updates: true,
            default_clean_mode: CleanMode::Trash,
            ignore_rules: String::new(),
            workspace_roots: Vec::new(),
            // Following the system, not a colour of our own choosing. A
            // first launch on a machine set to dark otherwise painted dark
            // from the pre-paint script, then turned white the instant these
            // settings arrived — and stayed white every launch after, because
            // the answer was written down. Nobody asked for light; it was the
            // default that had never been reconsidered.
            appearance: Appearance::System,
            language: Language::System,
            workspace_sidebar_hidden: false,
            insights_grain: default_grain(),
            shortcuts: std::collections::HashMap::new(),
            theme: None,
            app_icon: None,
            preferred_editor: None,
            preferred_terminal: None,
            last_cleanup: None,
            maintenance: crate::workspace::maintenance::MaintenancePolicy::default(),
            maintenance_schedule: crate::workspace::schedule::Schedule::default(),
            maintenance_last_run_at: None,
            weekly_digest: false,
            weekly_digest_last_at: None,
        }
    }
}

/// Months, which is the span a cleanup history is usually read over.
fn default_grain() -> String {
    "month".to_string()
}

#[cfg(test)]
mod tests {
    use super::{AppSettings, Appearance, Language};
    use crate::models::action::CleanMode;

    #[test]
    fn defaults_are_safe() {
        let settings = AppSettings::default();
        assert_eq!(settings.default_clean_mode, CleanMode::Trash);
        // Not a colour. A default of `Light` is a decision taken on behalf of
        // somebody whose machine already states a preference, and it announced
        // itself as a white flash over an app that had just painted dark.
        assert_eq!(settings.appearance, Appearance::System);
    }

    /// The two background defaults are on, and neither is destructive: one
    /// registers a login item that launches minimized, the other hides the
    /// window instead of quitting. Both are reversible from Settings, and the
    /// tray keeps a way out of both.
    #[test]
    fn the_app_is_present_in_the_background_by_default() {
        let settings = AppSettings::default();
        assert!(settings.open_at_startup);
        assert!(settings.keep_running_in_background);
    }

    #[test]
    fn serializes_settings_with_camel_case() {
        let value = serde_json::to_value(AppSettings::default()).unwrap();
        assert!(value.get("rememberLastWorkspace").is_some());
        assert!(value.get("defaultCleanMode").is_some());
        assert!(value.get("remember_last_workspace").is_none());
    }

    /// The upgrade path, and the regression this class of bug deserves: a file
    /// written before a field existed loads, keeps every value it stored, and
    /// takes the default only for what it predates.
    /// The wire form is the tag the interface resolves against, so the two
    /// sides cannot disagree about which language a stored value names.
    #[test]
    fn a_language_is_stored_as_its_interface_tag() {
        for (language, tag) in [
            (Language::System, "system"),
            (Language::English, "en"),
            (Language::PortugueseBrazil, "pt-BR"),
            (Language::Spanish, "es"),
            (Language::German, "de"),
            (Language::Japanese, "ja"),
            (Language::Arabic, "ar"),
        ] {
            assert_eq!(
                serde_json::to_value(language).unwrap(),
                serde_json::json!(tag)
            );
            assert_eq!(
                serde_json::from_value::<Language>(serde_json::json!(tag)).unwrap(),
                language
            );
        }
        assert!(serde_json::from_value::<Language>(serde_json::json!("fr")).is_err());
    }
}
