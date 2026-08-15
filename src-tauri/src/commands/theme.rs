//! Themes the user wrote, read from beside their settings.
//!
//! The palette is twenty-one named colours and nothing else — every surface in
//! the app is one of them — so a theme is a file that renames some of those and
//! leaves the rest alone. Partial on purpose: a file that had to spell out all
//! twenty-one to change one is a file nobody writes twice, and it breaks on the
//! release that adds the twenty-second.
//!
//! Read from `<config>/themes/*.json`, which is the same per-user directory
//! `settings.json` lives in. Nothing here is installed, downloaded or shared;
//! a theme is a file the person put there.
//!
//! A colour is validated before it is offered. The frontend sets these through
//! `setProperty`, which cannot be escaped out of, so this is not a security
//! boundary — it is the difference between a typo that is reported and a typo
//! that silently paints one surface transparent.

use std::path::{Path, PathBuf};
use tauri::{AppHandle, Manager};

/// What the app can be told to repaint. Anything else in a file is ignored,
/// named, and left for the release that might mean something by it.
const TOKENS: &[&str] = &[
    "forest-950",
    "forest-900",
    "forest-850",
    "forest-800",
    "sage-300",
    "sage-400",
    "sage-500",
    "mist-100",
    "mist-300",
    "mist-500",
    "coral-300",
    "coral-surface",
    "pro-100",
    "pro-200",
    "pro-surface",
    "confidence-high",
    "confidence-high-surface",
    "confidence-medium",
    "confidence-medium-surface",
    "confidence-review",
    "confidence-review-surface",
];

/// The ones that ship. Compiled in rather than written to the user's folder on
/// first run: a theme the app provides is not the user's to lose, and one they
/// deleted would come back on the next launch looking like the app disagreeing
/// with them. Read through the same parser as a file, so a mistake in one of
/// these is caught by the tests that catch a mistake in theirs.
const BUILT_IN: &[(&str, &str)] = &[
    (
        "cleaning-lady",
        include_str!("../../themes/cleaning-lady.json"),
    ),
    ("janitor", include_str!("../../themes/janitor.json")),
    ("cached", include_str!("../../themes/cached.json")),
    ("dusty", include_str!("../../themes/dusty.json")),
    ("garbage-man", include_str!("../../themes/garbage-man.json")),
];

#[derive(Debug, Clone, PartialEq, Eq, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Theme {
    /// The file's own name, which is how it is chosen and stored.
    pub id: String,
    pub name: String,
    /// Which built-in it starts from, so a partial theme has a floor.
    pub base: String,
    /// Token name without the `--theme-` prefix, to a colour.
    pub colors: Vec<(String, String)>,
    /// Lines that named nothing, or named a colour that is not one.
    pub problems: Vec<String>,
    /// Shipped with the app rather than found in the folder.
    pub built_in: bool,
}

#[derive(serde::Deserialize)]
struct ThemeFile {
    name: Option<String>,
    base: Option<String>,
    #[serde(default)]
    colors: std::collections::HashMap<String, String>,
}

/// Reads one theme's text into what the app can paint with.
///
/// Never fails on content. A theme with a bad colour in it loses that colour
/// and says so; a theme that is not JSON at all is the only thing that is not a
/// theme, because there is nothing in it to keep.
pub fn parse_theme(id: &str, contents: &str) -> Result<Theme, String> {
    let file: ThemeFile = serde_json::from_str(contents)
        .map_err(|error| format!("{id}.json is not JSON: {error}"))?;

    let mut colors = Vec::new();
    let mut problems = Vec::new();

    for token in TOKENS {
        if let Some(value) = file.colors.get(*token) {
            if is_colour(value) {
                colors.push(((*token).to_string(), value.clone()));
            } else {
                problems.push(format!("{token}: \"{value}\" is not a colour"));
            }
        }
    }
    for name in file.colors.keys() {
        if !TOKENS.contains(&name.as_str()) {
            problems.push(format!("{name} is not one of this app's colours"));
        }
    }
    problems.sort();

    Ok(Theme {
        name: file.name.unwrap_or_else(|| id.to_string()),
        base: match file.base.as_deref() {
            Some("light") => "light".to_string(),
            _ => "dark".to_string(),
        },
        id: id.to_string(),
        colors,
        problems,
        built_in: false,
    })
}

/// `#rgb`, `#rrggbb`, `#rrggbbaa`. Deliberately narrow: a theme is a set of
/// flat colours, and anything else on screen is the app's own drawing.
fn is_colour(value: &str) -> bool {
    let value = value.trim();
    let Some(digits) = value.strip_prefix('#') else {
        return false;
    };
    matches!(digits.len(), 3 | 6 | 8) && digits.chars().all(|c| c.is_ascii_hexdigit())
}

pub fn themes_directory(app: &AppHandle) -> Result<PathBuf, String> {
    app.path()
        .app_config_dir()
        .map(|directory| directory.join("themes"))
        .map_err(|error| error.to_string())
}

fn built_in_themes() -> Vec<Theme> {
    BUILT_IN
        .iter()
        .filter_map(|(id, contents)| parse_theme(id, contents).ok())
        .map(|theme| Theme {
            built_in: true,
            ..theme
        })
        .collect()
}

/// The ones that ship and the ones in the folder, by name.
#[tauri::command]
pub fn list_themes(app: AppHandle) -> Result<Vec<Theme>, String> {
    let directory = themes_directory(&app)?;
    ensure_example(&directory);

    let Ok(entries) = std::fs::read_dir(&directory) else {
        // No folder is not no themes: the ones that ship are in the binary.
        return Ok(built_in_themes());
    };

    let mut themes = Vec::new();
    for (id, contents) in BUILT_IN {
        if let Ok(theme) = parse_theme(id, contents) {
            themes.push(Theme {
                built_in: true,
                ..theme
            });
        }
    }

    for entry in entries.flatten() {
        let path = entry.path();
        if path.extension().and_then(|value| value.to_str()) != Some("json") {
            continue;
        }
        let Some(id) = path.file_stem().and_then(|value| value.to_str()) else {
            continue;
        };
        let Ok(contents) = std::fs::read_to_string(&path) else {
            continue;
        };
        // A file that will not parse is dropped rather than failing the list:
        // one bad theme is not a reason to offer none of the others.
        if let Ok(theme) = parse_theme(id, &contents) {
            // A file wins over the built-in of the same name, which is what
            // makes "copy one of these and change a colour" a thing that works.
            themes.retain(|existing| existing.id != theme.id);
            themes.push(theme);
        }
    }

    themes.sort_by_key(|theme| theme.name.to_lowercase());
    Ok(themes)
}

/// Opens the folder these live in, which is also where `settings.json` is.
///
/// Revealing rather than opening, and revealing the `themes` folder rather than
/// the configuration folder: the file manager then shows the directory that
/// holds *both* files with one of them selected, which is the view somebody
/// asking this question wants either way.
///
/// Falls back to opening it. Revealing is a desktop-environment feature — a
/// D-Bus interface on Linux, Explorer's `/select` on Windows — and on a Linux
/// session with no file manager offering it, the plugin says so rather than
/// doing something. Opening the folder is worse and it is not nothing.
#[tauri::command]
pub fn reveal_config(app: AppHandle) -> Result<(), String> {
    let directory = themes_directory(&app)?;
    ensure_example(&directory);

    if tauri_plugin_opener::reveal_item_in_dir(&directory).is_ok() {
        return Ok(());
    }
    tauri_plugin_opener::open_path(&directory, None::<&str>).map_err(|error| error.to_string())
}

/// Writes one theme to copy from, once.
///
/// An empty folder is a format nobody can guess. This is the documentation
/// somebody will actually read, because it is the file they are already
/// looking at — and it is only ever written when it is absent, so an edited
/// copy is never overwritten.
fn ensure_example(directory: &Path) {
    if std::fs::create_dir_all(directory).is_err() {
        return;
    }
    let example = directory.join("example.json");
    if example.exists() {
        return;
    }
    let _ = std::fs::write(&example, EXAMPLE);
}

const EXAMPLE: &str = r##"{
  "name": "Example",
  "base": "dark",

  "colors": {
    "forest-950": "#0e120f",
    "forest-900": "#141a15",
    "forest-850": "#1b231d",
    "forest-800": "#253127",

    "mist-100": "#f2f5f1",
    "mist-300": "#cfd8cc",
    "mist-500": "#93a092",

    "sage-300": "#b4e590",
    "sage-400": "#9dd47a",
    "sage-500": "#86bd63",

    "coral-300": "#ff9b94",
    "coral-surface": "#281a19",

    "pro-100": "#eee0ff",
    "pro-200": "#d9b8ff",
    "pro-surface": "#211b2b",

    "confidence-high": "#b4e590",
    "confidence-high-surface": "#1b241a",
    "confidence-medium": "#f2cd94",
    "confidence-medium-surface": "#262017",
    "confidence-review": "#a6cde6",
    "confidence-review-surface": "#16212a"
  }
}
"##;

#[cfg(test)]
mod tests {
    use super::{is_colour, parse_theme};

    #[test]
    fn a_theme_names_only_what_it_changes() {
        // The point of the format: one colour, and the other twenty stay.
        let theme = parse_theme(
            "mine",
            r##"{"name":"Mine","colors":{"sage-400":"#ff0000"}}"##,
        )
        .unwrap();

        assert_eq!(theme.name, "Mine");
        assert_eq!(theme.colors, vec![("sage-400".into(), "#ff0000".into())]);
        assert!(theme.problems.is_empty());
    }

    #[test]
    fn a_theme_with_no_name_is_called_after_its_file() {
        let theme = parse_theme("nord", r#"{"colors":{}}"#).unwrap();
        assert_eq!(theme.name, "nord");
    }

    #[test]
    fn dark_is_the_base_unless_the_file_says_light() {
        assert_eq!(
            parse_theme("a", r#"{"base":"light"}"#).unwrap().base,
            "light"
        );
        assert_eq!(parse_theme("a", r#"{"base":"dark"}"#).unwrap().base, "dark");
        assert_eq!(
            parse_theme("a", r#"{}"#).unwrap().base,
            "dark",
            "a partial theme has to start from something"
        );
    }

    #[test]
    fn a_value_that_is_not_a_colour_is_dropped_and_named() {
        // Silently painting one surface transparent is the failure here. The
        // rest of the theme still applies.
        let theme = parse_theme(
            "mine",
            r##"{"colors":{"sage-400":"not a colour","mist-100":"#fff"}}"##,
        )
        .unwrap();

        assert_eq!(theme.colors, vec![("mist-100".into(), "#fff".into())]);
        assert_eq!(theme.problems.len(), 1);
        assert!(theme.problems[0].contains("sage-400"));
    }

    #[test]
    fn a_token_this_app_does_not_have_is_named_rather_than_applied() {
        let theme = parse_theme("mine", r##"{"colors":{"background":"#fff"}}"##).unwrap();

        assert!(theme.colors.is_empty());
        assert_eq!(theme.problems.len(), 1);
        assert!(theme.problems[0].contains("background"));
    }

    #[test]
    fn a_file_that_is_not_json_is_the_only_thing_that_is_not_a_theme() {
        assert!(parse_theme("mine", "half a file").is_err());
    }

    #[test]
    fn a_colour_is_a_hex_colour() {
        for value in ["#fff", "#FFFFFF", "#00000080", " #abc "] {
            assert!(is_colour(value), "{value}");
        }
        for value in ["fff", "#ffff", "#gggggg", "red", "var(--x)", "", "#"] {
            assert!(!is_colour(value), "{value}");
        }
    }

    #[test]
    fn every_theme_that_ships_is_one() {
        // Written by hand, so read by the same parser that reads a user's — a
        // typo in one of these would otherwise reach a release as a surface
        // that quietly did not repaint.
        for (id, contents) in super::BUILT_IN {
            let theme = parse_theme(id, contents)
                .unwrap_or_else(|error| panic!("{id} does not parse: {error}"));
            assert!(
                theme.problems.is_empty(),
                "{id}: {}",
                theme.problems.join(", ")
            );
            assert_eq!(
                theme.colors.len(),
                21,
                "{id} leaves a colour to the built-in palette; the ones that ship name all of them"
            );
        }
    }

    #[test]
    fn the_ones_that_ship_have_distinct_names() {
        let mut names: Vec<String> = super::built_in_themes()
            .into_iter()
            .map(|theme| theme.name)
            .collect();
        names.sort();
        let count = names.len();
        names.dedup();
        assert_eq!(names.len(), count);
    }
}
