//! The few sentences the native side says on its own: the tray menu and the
//! notifications sent while the window is hidden.
//!
//! They are not translated here. The interface owns every string in one
//! catalogue and hands these over whenever its language changes, with their
//! placeholders still in them; this module only picks a plural form and fills
//! the numbers in. Until the interface has spoken — the tray is built before
//! the window loads — the English below is what shows.

use serde::Deserialize;
use std::collections::HashMap;
use std::sync::RwLock;

/// One message, as `{ "<CLDR category>": "<template>" }`. Singular strings
/// arrive as a map holding only `other`.
pub type Forms = HashMap<String, String>;

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NativeStrings {
    /// BCP 47 tag the templates are written in.
    pub locale: String,
    /// What the locale writes between the whole and fractional part of a size.
    pub decimal_separator: String,
    pub tray_open: String,
    pub tray_scan: String,
    pub tray_quit: String,
    /// Placeholders: `{{count}}` targets, `{{size}}`.
    pub scan_finished: Forms,
    pub maintenance_title: String,
    /// Placeholders: `{{count}}` projects, `{{size}}`.
    pub maintenance_body: Forms,
}

impl Default for NativeStrings {
    fn default() -> Self {
        let forms = |one: &str, other: &str| {
            Forms::from([
                ("one".to_owned(), one.to_owned()),
                ("other".to_owned(), other.to_owned()),
            ])
        };
        Self {
            locale: "en".to_owned(),
            decimal_separator: ".".to_owned(),
            tray_open: "Open Uncached".to_owned(),
            tray_scan: "Scan workspace".to_owned(),
            tray_quit: "Quit Uncached".to_owned(),
            scan_finished: forms(
                "{{count}} target found, {{size}} reclaimable.",
                "{{count}} targets found, {{size}} reclaimable.",
            ),
            maintenance_title: "Uncached maintenance".to_owned(),
            maintenance_body: forms(
                "{{size}} reclaimed from {{count}} idle project. Everything went to the Trash.",
                "{{size}} reclaimed from {{count}} idle projects. Everything went to the Trash.",
            ),
        }
    }
}

static CURRENT: RwLock<Option<NativeStrings>> = RwLock::new(None);

pub fn current() -> NativeStrings {
    CURRENT
        .read()
        .ok()
        .and_then(|guard| guard.clone())
        .unwrap_or_default()
}

pub fn replace(strings: NativeStrings) {
    if let Ok(mut guard) = CURRENT.write() {
        *guard = Some(strings);
    }
}

/// CLDR cardinal category for a whole number, for the locales the interface
/// ships. Mirrors `Intl.PluralRules(locale).select(n)`; the test below pins the
/// table it was checked against.
pub fn plural_category(locale: &str, count: u64) -> &'static str {
    match locale {
        "ja" => "other",
        "ar" => match count {
            0 => "zero",
            1 => "one",
            2 => "two",
            _ => match count % 100 {
                3..=10 => "few",
                11..=99 => "many",
                _ => "other",
            },
        },
        // Portuguese counts zero as singular: "0 alvo encontrado".
        "pt-BR" if count <= 1 => "one",
        _ if count == 1 => "one",
        _ => "other",
    }
}

/// Picks the form for `count` and fills `{{count}}` and `{{size}}`.
///
/// Falls back to `other`, then to the first form present, so a bundle missing
/// a category still says something rather than nothing. In a right-to-left
/// language each value is wrapped in Unicode isolates (U+2068…U+2069), as the
/// interface does, so `2.10 GB` keeps its own direction inside Arabic text.
pub fn render(forms: &Forms, locale: &str, count: u64, size: &str) -> String {
    let template = forms
        .get(plural_category(locale, count))
        .or_else(|| forms.get("other"))
        .or_else(|| forms.values().next())
        .map(String::as_str)
        .unwrap_or_default();
    let (open, close) = if locale == "ar" {
        ("\u{2068}", "\u{2069}")
    } else {
        ("", "")
    };
    template
        .replace("{{count}}", &format!("{open}{count}{close}"))
        .replace("{{size}}", &format!("{open}{size}{close}"))
}

/// A size the way the locale writes it. Only the decimal separator changes;
/// the unit symbols are the same everywhere, as in the interface.
pub fn localized_size(bytes: u64, strings: &NativeStrings) -> String {
    crate::models::target::format_size(bytes).replacen('.', &strings.decimal_separator, 1)
}

/// Replaces the strings and rebuilds what already displayed the old ones.
#[tauri::command]
pub fn set_native_strings(app: tauri::AppHandle, strings: NativeStrings) {
    replace(strings);
    crate::tray::relabel(&app);
}

#[cfg(test)]
mod tests {
    use super::{plural_category, render, Forms};

    /// Produced by `Intl.PluralRules(locale).select(n)` in Node 26.
    #[test]
    fn plural_categories_match_the_interface() {
        let counts = [0, 1, 2, 3, 10, 11, 99, 100, 101, 102, 103, 111, 1000];
        let expected: [(&str, [&str; 13]); 6] = [
            (
                "en",
                [
                    "other", "one", "other", "other", "other", "other", "other", "other", "other",
                    "other", "other", "other", "other",
                ],
            ),
            (
                "pt-BR",
                [
                    "one", "one", "other", "other", "other", "other", "other", "other", "other",
                    "other", "other", "other", "other",
                ],
            ),
            (
                "es",
                [
                    "other", "one", "other", "other", "other", "other", "other", "other", "other",
                    "other", "other", "other", "other",
                ],
            ),
            (
                "de",
                [
                    "other", "one", "other", "other", "other", "other", "other", "other", "other",
                    "other", "other", "other", "other",
                ],
            ),
            ("ja", ["other"; 13]),
            (
                "ar",
                [
                    "zero", "one", "two", "few", "few", "many", "many", "other", "other", "other",
                    "few", "many", "other",
                ],
            ),
        ];
        for (locale, categories) in expected {
            for (count, category) in counts.iter().zip(categories) {
                assert_eq!(
                    plural_category(locale, *count),
                    category,
                    "{locale} {count}"
                );
            }
        }
    }

    #[test]
    fn values_in_arabic_text_are_isolated() {
        let forms = Forms::from([("few".to_owned(), "{{count}} و {{size}}".to_owned())]);
        assert_eq!(
            render(&forms, "ar", 3, "2.10 GB"),
            "\u{2068}3\u{2069} و \u{2068}2.10 GB\u{2069}"
        );
    }

    #[test]
    fn a_missing_form_falls_back_to_other() {
        let forms = Forms::from([("other".to_owned(), "{{count}} x {{size}}".to_owned())]);
        assert_eq!(
            render(&forms, "ar", 2, "1 GB"),
            "\u{2068}2\u{2069} x \u{2068}1 GB\u{2069}"
        );
    }

    #[test]
    fn the_english_default_reads_as_before() {
        let strings = super::NativeStrings::default();
        assert_eq!(
            render(&strings.scan_finished, &strings.locale, 1, "4.00 GB"),
            "1 target found, 4.00 GB reclaimable."
        );
        assert_eq!(
            render(&strings.maintenance_body, &strings.locale, 3, "4.00 GB"),
            "4.00 GB reclaimed from 3 idle projects. Everything went to the Trash."
        );
    }
}
