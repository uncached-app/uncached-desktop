//! What it costs to put back what a reclaim removes.
//!
//! The product's whole justification is that these directories are
//! regenerable, and until now it never said how they would be regenerated or
//! whether the result would be the same. Both halves matter, and the second one
//! more: a reinstall is only a restore when something pins the versions.
//!
//! **An install with no lockfile is the case worth naming.** `install_stale`
//! and `install_missing` both start by finding a lockfile, so a project holding
//! `node_modules` with nothing pinning it reads as perfectly healthy and is
//! offered for reclaim like any other. It is not the same as the others: the
//! resolved version of every transitive dependency exists on this disk and
//! nowhere else, and `npm install` afterwards resolves fresh ones. The bytes
//! come back; that particular working set does not.
//!
//! That is a smaller loss than uncommitted source, which is why it is reported
//! here rather than becoming a `Protect` verdict. `Protect` stops automation,
//! and stopping automation on every project whose lockfile is gitignored would
//! make the verdict mean something else.
//!
//! The command is a sentence, not a button. Running a package manager is a
//! different product from removing a directory — it writes to the project,
//! fetches from the network, and can fail in ways only the person who owns the
//! project can read.

use serde::Serialize;

/// How a project's dependencies come back.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Restore {
    /// The tool, as the user would say it.
    pub manager: String,
    /// What they would type.
    pub command: String,
    /// The file that fixes which versions come back, when there is one.
    ///
    /// `None` means a reinstall resolves whatever is current. The bytes return;
    /// the exact tree does not.
    pub pinned_by: Option<String>,
}

/// One way of recognising a project, in the order the evidence is trusted.
struct Recipe {
    /// The file whose presence identifies this manager.
    evidence: &'static str,
    /// Whether that file pins versions, or merely names the manager.
    pins: bool,
    manager: &'static str,
    /// What to type when this manager's own lockfile is the one present.
    command: &'static str,
    /// The same tool with nothing pinning it.
    ///
    /// Needed because a project can declare one manager while carrying
    /// another's lockfile — a migration half-done — and the frozen form of the
    /// declared tool would fail on a lockfile it cannot read.
    loose: &'static str,
}

/// Lockfiles first, within each ecosystem, then the bare manifest.
///
/// Order is the whole design. A repository can hold both `pnpm-lock.yaml` and a
/// stale `package-lock.json`, and the answer has to be the one its owner
/// actually uses — so every lockfile is asked before any manifest, and within
/// Node the less common managers are asked first, because nothing but pnpm
/// writes a `pnpm-lock.yaml` while `package-lock.json` accumulates by accident.
const RECIPES: &[Recipe] = &[
    Recipe {
        evidence: "pnpm-lock.yaml",
        pins: true,
        manager: "pnpm",
        command: "pnpm install --frozen-lockfile",
        loose: "pnpm install",
    },
    Recipe {
        evidence: "bun.lockb",
        pins: true,
        manager: "bun",
        command: "bun install --frozen-lockfile",
        loose: "bun install",
    },
    Recipe {
        evidence: "bun.lock",
        pins: true,
        manager: "bun",
        command: "bun install --frozen-lockfile",
        loose: "bun install",
    },
    Recipe {
        evidence: "yarn.lock",
        pins: true,
        manager: "yarn",
        command: "yarn install --immutable",
        loose: "yarn install",
    },
    Recipe {
        evidence: "package-lock.json",
        pins: true,
        manager: "npm",
        // `ci` rather than `install`: it is the one that honours the lockfile
        // exactly, which is the whole reason the lockfile is worth reporting.
        command: "npm ci",
        loose: "npm install",
    },
    Recipe {
        evidence: "uv.lock",
        pins: true,
        manager: "uv",
        command: "uv sync --frozen",
        loose: "uv sync",
    },
    Recipe {
        evidence: "poetry.lock",
        pins: true,
        manager: "Poetry",
        command: "poetry install --sync",
        loose: "poetry install",
    },
    Recipe {
        evidence: "Pipfile.lock",
        pins: true,
        manager: "Pipenv",
        command: "pipenv sync",
        loose: "pipenv install",
    },
    Recipe {
        evidence: "Cargo.lock",
        pins: true,
        manager: "Cargo",
        command: "cargo build",
        loose: "cargo build",
    },
    Recipe {
        evidence: "go.sum",
        pins: true,
        manager: "Go modules",
        command: "go mod download",
        loose: "go mod download",
    },
    Recipe {
        evidence: "composer.lock",
        pins: true,
        manager: "Composer",
        command: "composer install",
        loose: "composer install",
    },
    Recipe {
        evidence: "Gemfile.lock",
        pins: true,
        manager: "Bundler",
        command: "bundle install",
        loose: "bundle install",
    },
    // Manifests. Reached only when no lockfile beside them did.
    Recipe {
        evidence: "package.json",
        pins: false,
        manager: "npm",
        command: "npm install",
        loose: "npm install",
    },
    Recipe {
        evidence: "Cargo.toml",
        pins: false,
        manager: "Cargo",
        command: "cargo build",
        loose: "cargo build",
    },
    // `requirements.txt` may or may not pin — `==` on every line does, a bare
    // name does not, and the difference is a parse of a file whose format is a
    // convention rather than a spec. Reported as unpinned, which is the answer
    // that is never wrong in the direction that matters.
    Recipe {
        evidence: "requirements.txt",
        pins: false,
        manager: "pip",
        command: "pip install -r requirements.txt",
        loose: "pip install -r requirements.txt",
    },
    Recipe {
        evidence: "pyproject.toml",
        pins: false,
        manager: "pip",
        command: "pip install -e .",
        loose: "pip install -e .",
    },
    Recipe {
        evidence: "go.mod",
        pins: false,
        manager: "Go modules",
        command: "go mod download",
        loose: "go mod download",
    },
    Recipe {
        evidence: "pom.xml",
        pins: false,
        manager: "Maven",
        command: "mvn dependency:go-offline",
        loose: "mvn dependency:go-offline",
    },
];

/// What Corepack was told to use, if anything.
///
/// The `packageManager` field is the project stating its own answer, so it
/// outranks every lockfile — a repository mid-migration can hold the other
/// tool's lockfile while its manifest already says which one is real.
///
/// The version suffix is dropped: `pnpm@9.1.0` is a pin on the tool, not on the
/// dependencies, and printing it in a command the user is meant to type would
/// be noise.
fn declared_manager(declared: Option<&str>) -> Option<&'static Recipe> {
    let name = declared?.split('@').next()?.trim().to_lowercase();
    // Any recipe naming that tool will do: only `manager` and `loose` are read
    // from it, and every recipe for one tool agrees on both.
    RECIPES
        .iter()
        .find(|recipe| recipe.manager.eq_ignore_ascii_case(&name))
}

/// How this project's dependencies come back, from what is beside them.
///
/// `has_file` is injected so the rule is testable without a filesystem, the
/// same way `orphans::classify` and `hygiene::worktrees` take theirs.
///
/// `declared` is the `packageManager` field of a `package.json`, when it has
/// one. It names the manager but pins nothing, so a project declaring `pnpm`
/// with a `pnpm-lock.yaml` beside it still reports the lockfile as what pins it.
pub fn detect(has_file: &dyn Fn(&str) -> bool, declared: Option<&str>) -> Option<Restore> {
    let found = RECIPES.iter().find(|recipe| has_file(recipe.evidence));

    // A declaration renames the tool; it never invents one. Without any
    // evidence on disk there is no project here to restore.
    let recipe = found?;
    let named = declared_manager(declared).unwrap_or(recipe);

    Some(Restore {
        manager: named.manager.to_owned(),
        // The command follows the tool that was named, but only when that tool
        // is the one whose lockfile is present. A declared pnpm with a
        // `package-lock.json` is a migration half-done, and `pnpm install
        // --frozen-lockfile` would fail on a lockfile it cannot read.
        command: if named.manager == recipe.manager {
            recipe.command.to_owned()
        } else {
            named.loose.to_owned()
        },
        pinned_by: recipe.pins.then(|| recipe.evidence.to_owned()),
    })
}

#[cfg(test)]
mod tests {
    use super::detect;

    fn files<'a>(present: &'a [&'a str]) -> impl Fn(&str) -> bool + 'a {
        move |name: &str| present.contains(&name)
    }

    #[test]
    fn a_project_with_nothing_to_restore_reports_nothing() {
        assert_eq!(detect(&files(&[]), None), None);
        assert_eq!(detect(&files(&["README.md"]), None), None);
    }

    #[test]
    fn the_lockfile_names_the_manager_and_the_command_honours_it() {
        for (lockfile, manager, command) in [
            ("pnpm-lock.yaml", "pnpm", "pnpm install --frozen-lockfile"),
            ("yarn.lock", "yarn", "yarn install --immutable"),
            ("package-lock.json", "npm", "npm ci"),
            ("Cargo.lock", "Cargo", "cargo build"),
            ("uv.lock", "uv", "uv sync --frozen"),
        ] {
            let found = detect(&files(&[lockfile, "package.json"]), None)
                .unwrap_or_else(|| panic!("{lockfile} identifies a project"));

            assert_eq!(found.manager, manager);
            assert_eq!(found.command, command);
            assert_eq!(found.pinned_by.as_deref(), Some(lockfile));
        }
    }

    /// The finding this module exists for. Nothing else in the product
    /// distinguishes it: `install_missing` and `install_stale` both begin by
    /// finding a lockfile, so this project reads as perfectly healthy.
    #[test]
    fn a_manifest_with_no_lockfile_restores_but_does_not_reproduce() {
        let found = detect(&files(&["package.json"]), None).expect("npm can install this");

        assert_eq!(found.command, "npm install");
        assert_eq!(
            found.pinned_by, None,
            "nothing here fixes which versions come back"
        );
    }

    /// A repository can carry a stale `package-lock.json` long after moving to
    /// pnpm. Asking every lockfile before any manifest, and the less common
    /// managers first, is what keeps the answer the one its owner uses.
    #[test]
    fn a_leftover_lockfile_does_not_outrank_the_one_in_use() {
        let found = detect(
            &files(&["pnpm-lock.yaml", "package-lock.json", "package.json"]),
            None,
        )
        .expect("a Node project");

        assert_eq!(found.manager, "pnpm");
        assert_eq!(found.pinned_by.as_deref(), Some("pnpm-lock.yaml"));
    }

    /// Corepack's field is the project stating its own answer.
    #[test]
    fn the_declared_manager_outranks_a_lockfile_from_the_other_tool() {
        let found = detect(
            &files(&["package-lock.json", "package.json"]),
            Some("pnpm@9.1.0"),
        )
        .expect("a Node project");

        assert_eq!(found.manager, "pnpm");
        assert_eq!(
            found.command, "pnpm install",
            "the present lockfile belongs to npm, so the frozen form would fail on it"
        );
    }

    #[test]
    fn a_declaration_matching_the_lockfile_keeps_the_frozen_command() {
        let found = detect(
            &files(&["pnpm-lock.yaml", "package.json"]),
            Some("pnpm@9.1.0"),
        )
        .expect("a Node project");

        assert_eq!(found.command, "pnpm install --frozen-lockfile");
        assert_eq!(found.pinned_by.as_deref(), Some("pnpm-lock.yaml"));
    }

    /// A declaration is not evidence that a project exists.
    #[test]
    fn a_declaration_alone_restores_nothing() {
        assert_eq!(detect(&files(&[]), Some("pnpm@9.1.0")), None);
    }

    /// Stated as unpinned because deciding otherwise means parsing a format
    /// that is a convention rather than a spec, and being wrong the other way
    /// would promise reproducibility this cannot check.
    #[test]
    fn a_requirements_file_is_not_treated_as_a_lockfile() {
        let found = detect(&files(&["requirements.txt"]), None).expect("a Python project");

        assert_eq!(found.manager, "pip");
        assert_eq!(found.pinned_by, None);
    }

    #[test]
    fn the_restore_crosses_the_boundary_in_camel_case() {
        let found = detect(&files(&["package.json"]), None).unwrap();
        let value = serde_json::to_value(&found).unwrap();

        assert_eq!(value["command"], "npm install");
        assert!(value["pinnedBy"].is_null());
    }
}
