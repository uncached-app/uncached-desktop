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
];

#[derive(Debug, Clone, PartialEq, Eq, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Theme {
    /// The file's own name, which is how it is chosen and stored.
    pub id: String,
    pub name: String,
    /// What it offers for each. A theme may carry one or both, and which it
    /// carries is what decides whether the appearance choice is still the
    /// user's — a file with only dark colours cannot honour a request for light.
    pub light: Option<Vec<(String, String)>>,
    pub dark: Option<Vec<(String, String)>>,
    /// Lines that named nothing, or named a colour that is not one.
    pub problems: Vec<String>,
    /// Shipped with the app rather than found in the folder.
    pub built_in: bool,
}

type Palette = std::collections::HashMap<String, String>;

/// Both shapes a theme file may be written in.
///
/// `light` and `dark` are the ones to write. `base` and `colors` came first and
/// still work: a file somebody wrote before this existed is not a file that
/// should stop working, and the older shape is exactly the newer one with a
/// single mode named at the top.
#[derive(serde::Deserialize)]
struct ThemeFile {
    name: Option<String>,
    base: Option<String>,
    #[serde(default)]
    colors: Palette,
    light: Option<Palette>,
    dark: Option<Palette>,
}

/// Reads one theme's text into what the app can paint with.
///
/// Never fails on content. A theme with a bad colour in it loses that colour
/// and says so; a theme that is not JSON at all is the only thing that is not a
/// theme, because there is nothing in it to keep.
pub fn parse_theme(id: &str, contents: &str) -> Result<Theme, String> {
    let file: ThemeFile = serde_json::from_str(contents)
        .map_err(|error| format!("{id}.json is not JSON: {error}"))?;

    let mut problems = Vec::new();

    // The older shape is the newer one with a single mode named at the top, so
    // it is turned into that and nothing below has to know which was written.
    let (mut light, mut dark) = (file.light, file.dark);
    if light.is_none() && dark.is_none() && !file.colors.is_empty() {
        match file.base.as_deref() {
            Some("light") => light = Some(file.colors),
            _ => dark = Some(file.colors),
        }
    }

    let light = light.map(|palette| read_palette("light", &palette, &mut problems));
    let dark = dark.map(|palette| read_palette("dark", &palette, &mut problems));

    if light.is_none() && dark.is_none() {
        problems.push("names no colours, for either light or dark".to_string());
    }
    problems.sort();

    Ok(Theme {
        name: file.name.unwrap_or_else(|| id.to_string()),
        id: id.to_string(),
        light,
        dark,
        problems,
        built_in: false,
    })
}

/// One mode's colours, keeping what is a colour and naming what is not.
fn read_palette(
    mode: &str,
    palette: &Palette,
    problems: &mut Vec<String>,
) -> Vec<(String, String)> {
    let mut colors = Vec::new();

    for token in TOKENS {
        if let Some(value) = palette.get(*token) {
            if is_colour(value) {
                colors.push(((*token).to_string(), value.clone()));
            } else {
                problems.push(format!("{mode} {token}: \"{value}\" is not a colour"));
            }
        }
    }
    for name in palette.keys() {
        if !TOKENS.contains(&name.as_str()) {
            problems.push(format!("{mode} {name} is not one of this app's colours"));
        }
    }

    colors
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
///
/// It carries both modes and neither is the built-in palette. It was both, and
/// both were copies, which meant selecting it changed nothing on screen in
/// either — an example that demonstrates the format and none of the effect,
/// leaving somebody to wonder whether the theme took at all.
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
  "note": "Carry \"light\", \"dark\", or both. With one, the appearance choice follows it; with both it stays yours. Name only the colours you are changing. This one is a slate cast of the built-in palette, visibly different in either mode so that choosing it proves it took.",

  "dark": {
    "forest-950": "#101418",
    "forest-900": "#161b21",
    "forest-850": "#1d232a",
    "forest-800": "#2a323b",

    "mist-100": "#e8edf2",
    "mist-300": "#c2cbd4",
    "mist-500": "#96a2ad",

    "sage-300": "#9fd6b4",
    "sage-400": "#7cc79a",
    "sage-500": "#5aa87c",

    "coral-300": "#ff9d9d",
    "coral-surface": "#2c1c1e",

    "pro-100": "#ded0ff",
    "pro-200": "#b9a0ff",
    "pro-surface": "#221d33",

    "confidence-high": "#7cc79a",
    "confidence-high-surface": "#16261d",
    "confidence-medium": "#f0c987",
    "confidence-medium-surface": "#2a2418",
    "confidence-review": "#94c4e8",
    "confidence-review-surface": "#14222e"
  },

  "light": {
    "forest-950": "#f5f7f9",
    "forest-900": "#ffffff",
    "forest-850": "#e9edf1",
    "forest-800": "#d5dce3",

    "mist-100": "#14191f",
    "mist-300": "#384350",
    "mist-500": "#5f6b78",

    "sage-300": "#1d5c41",
    "sage-400": "#22694b",
    "sage-500": "#1d5c41",

    "coral-300": "#a83636",
    "coral-surface": "#fae5e5",

    "pro-100": "#4a2f78",
    "pro-200": "#6a4aa8",
    "pro-surface": "#efe9f9",

    "confidence-high": "#1f6b4a",
    "confidence-high-surface": "#dcefe4",
    "confidence-medium": "#7d5514",
    "confidence-medium-surface": "#f8eed6",
    "confidence-review": "#21597d",
    "confidence-review-surface": "#dfeaf3"
  }
}
"##;

#[cfg(test)]
mod tests {
    use super::{is_colour, parse_theme};

    #[test]
    fn a_theme_names_only_what_it_changes() {
        // The point of the format: one colour, and the other twenty stay.
        let theme =
            parse_theme("mine", r##"{"name":"Mine","dark":{"sage-400":"#ff0000"}}"##).unwrap();

        assert_eq!(theme.name, "Mine");
        assert_eq!(
            theme.dark,
            Some(vec![("sage-400".into(), "#ff0000".into())])
        );
        assert_eq!(theme.light, None);
        assert!(theme.problems.is_empty());
    }

    #[test]
    fn a_theme_may_carry_both_modes() {
        let theme = parse_theme(
            "both",
            r##"{"light":{"mist-100":"#000000"},"dark":{"mist-100":"#ffffff"}}"##,
        )
        .unwrap();

        assert_eq!(
            theme.light,
            Some(vec![("mist-100".into(), "#000000".into())])
        );
        assert_eq!(
            theme.dark,
            Some(vec![("mist-100".into(), "#ffffff".into())])
        );
    }

    #[test]
    fn the_shape_that_came_first_still_works() {
        // A file written before two modes existed is not a file that should
        // stop working: `base` plus `colors` is the newer shape with the mode
        // named at the top.
        let older = parse_theme(
            "old",
            r##"{"base":"light","colors":{"mist-100":"#111111"}}"##,
        )
        .unwrap();
        assert_eq!(
            older.light,
            Some(vec![("mist-100".into(), "#111111".into())])
        );
        assert_eq!(older.dark, None);

        let defaulted = parse_theme("old", r##"{"colors":{"mist-100":"#111111"}}"##).unwrap();
        assert!(
            defaulted.dark.is_some(),
            "no base named means dark, as it always did"
        );
    }

    #[test]
    fn a_theme_with_no_name_is_called_after_its_file() {
        let theme = parse_theme("nord", r##"{"dark":{}}"##).unwrap();
        assert_eq!(theme.name, "nord");
    }

    #[test]
    fn a_theme_with_no_colours_at_all_says_so() {
        let theme = parse_theme("empty", r##"{"name":"Empty"}"##).unwrap();

        assert_eq!(theme.light, None);
        assert_eq!(theme.dark, None);
        assert_eq!(theme.problems.len(), 1);
    }

    #[test]
    fn a_value_that_is_not_a_colour_is_dropped_and_named_with_its_mode() {
        // Silently painting one surface transparent is the failure here, and
        // which mode it was in is half of finding the line.
        let theme = parse_theme(
            "mine",
            r##"{"dark":{"sage-400":"not a colour","mist-100":"#fff"}}"##,
        )
        .unwrap();

        assert_eq!(theme.dark, Some(vec![("mist-100".into(), "#fff".into())]));
        assert_eq!(theme.problems.len(), 1);
        assert!(theme.problems[0].starts_with("dark sage-400"));
    }

    #[test]
    fn a_token_this_app_does_not_have_is_named_rather_than_applied() {
        let theme = parse_theme("mine", r##"{"dark":{"background":"#fff"}}"##).unwrap();

        assert_eq!(theme.dark, Some(Vec::new()));
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
    fn the_example_is_a_theme() {
        // It is written into the user's folder as the thing to copy, and JSON
        // has no comments — a line of guidance in the wrong syntax makes the
        // one file somebody starts from the one file that does not load.
        let theme = parse_theme("example", super::EXAMPLE)
            .unwrap_or_else(|error| panic!("the example does not parse: {error}"));

        assert!(theme.problems.is_empty(), "{}", theme.problems.join(", "));
        assert_eq!(theme.light.map(|colors| colors.len()), Some(21));
        assert_eq!(theme.dark.map(|colors| colors.len()), Some(21));
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
            let named = theme.light.or(theme.dark).unwrap_or_default();
            assert_eq!(
                named.len(),
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
