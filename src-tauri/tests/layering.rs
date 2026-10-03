//! The command layer is an adapter, so nothing below it may depend on it.
//!
//! Seven modules once imported the settings model, the licence, the history and
//! the cleanup door from `commands::`, which made the part of the app that knows
//! what a setting is depend on the layer that exposes it to the window. They were
//! moved out; this keeps them out.

use std::fs;
use std::path::{Path, PathBuf};

fn rust_files(directory: &Path, found: &mut Vec<PathBuf>) {
    for entry in fs::read_dir(directory).expect("source directory should be readable") {
        let path = entry.expect("directory entry").path();
        if path.is_dir() {
            rust_files(&path, found);
        } else if path.extension().is_some_and(|extension| extension == "rs") {
            found.push(path);
        }
    }
}

/// Whether a line is code that names the command layer. Documentation may name a
/// command; only an import or a call is a dependency.
fn depends_on_commands(line: &str) -> bool {
    let code = line.trim_start();
    !code.starts_with("//") && code.contains("commands::")
}

#[test]
fn nothing_outside_the_command_layer_depends_on_it() {
    let source = Path::new(env!("CARGO_MANIFEST_DIR")).join("src");
    let commands = source.join("commands");
    let registration = source.join("lib.rs");

    let mut files = Vec::new();
    rust_files(&source, &mut files);

    let mut violations = Vec::new();
    for file in files {
        if file.starts_with(&commands) || file == registration {
            continue;
        }
        let text = fs::read_to_string(&file).expect("source file should be readable");
        for (number, line) in text.lines().enumerate() {
            if depends_on_commands(line) {
                violations.push(format!(
                    "{}:{}: {}",
                    file.strip_prefix(&source).unwrap().display(),
                    number + 1,
                    line.trim()
                ));
            }
        }
    }

    assert!(
        violations.is_empty(),
        "these depend on the command layer, which should only depend on them:\n{}",
        violations.join("\n")
    );
}

#[test]
fn an_import_counts_and_documentation_does_not() {
    assert!(depends_on_commands(
        "use crate::commands::settings::AppSettings;"
    ));
    assert!(depends_on_commands(
        "    let status = crate::commands::entitlements::current_status();"
    ));
    assert!(!depends_on_commands(
        "//! Removal is `commands::clean::perform_clean`."
    ));
    assert!(!depends_on_commands(
        "    // see commands::clean for the window's side"
    ));
}
