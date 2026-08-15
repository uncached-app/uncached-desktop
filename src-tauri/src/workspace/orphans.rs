//! Regenerable directories that no project owns any more.
//!
//! The blind spot this closes is a real one. Every scanner in `uncached-core`
//! confirms an artifact by the manifest sitting beside it — `node_modules` is
//! only a target when there is a `package.json` next to it — which is the
//! property that keeps cleanup from deleting a directory it merely recognised
//! by name. It also means the leftovers of a project that was deleted are
//! invisible to the product: no manifest, so no confirmation, so no target. The
//! workspace index cannot see them either, because discovery prunes these names
//! before it ever looks inside.
//!
//! So the one case where removal is least ambiguous — bytes that nothing uses
//! and nothing will rebuild — was the one case nothing reported.
//!
//! **This is read-only, and not as a first stage.** Cleanup validates every
//! target against the providers, and the providers refuse exactly this: no
//! marker, no confirmation. Reporting an orphan and offering a button that the
//! backend would decline is worse than not offering one, and relaxing that
//! confirmation to make the button work would trade the product's central
//! safety property for a convenience. The finding names the path; removing it
//! is the user's, in their own file manager.
//!
//! The rule is deliberately narrower than it could be. A directory is an orphan
//! only when its own parent has no owning manifest **and** no ancestor up to the
//! scanned root has one either. A workspace member whose `package.json` is
//! momentarily missing still sits under the repository's own manifest, and that
//! is a project mid-edit rather than an orphan.

use serde::Serialize;
use std::path::Path;

/// A directory that only ever means one thing, and the manifest that owns it.
///
/// Being wrong here means telling someone that a directory they care about
/// belongs to nobody, so an entry qualifies in one of two ways: a name nothing
/// else uses, or an ambiguous name plus a file inside it that only one tool
/// writes. `dist`, `build` and `vendor` have neither and are absent.
struct Owned {
    directory: &'static str,
    /// A file that must sit **inside** the directory for it to count.
    ///
    /// This is what lets a name every project uses onto the list. `target`
    /// belongs to Cargo and to every Makefile ever written; `target` holding a
    /// `CACHEDIR.TAG` is a build cache by the tag's own specification, whoever
    /// wrote it.
    confirmed_by: Option<&'static str>,
    /// Any one of these beside it means a project claims it.
    markers: &'static [&'static str],
    /// What the finding calls it.
    label: &'static str,
    /// Whether the tool could rebuild this if its project came back.
    ///
    /// False for a virtual environment, and the distinction is the honest part:
    /// everything else here is disposable because a command reproduces it, while
    /// a `.venv` whose project is gone cannot be reproduced by anything. It is
    /// dead weight for the opposite reason — not because rebuilding is cheap,
    /// but because nothing is left that could use it.
    regenerable: bool,
}

const NODE: &[&str] = &["package.json"];

const OWNED: &[Owned] = &[
    Owned {
        directory: "node_modules",
        confirmed_by: None,
        markers: NODE,
        label: "Node modules",
        regenerable: true,
    },
    Owned {
        directory: ".next",
        confirmed_by: None,
        markers: NODE,
        label: "Next.js build cache",
        regenerable: true,
    },
    Owned {
        directory: ".turbo",
        confirmed_by: None,
        markers: NODE,
        label: "Turborepo cache",
        regenerable: true,
    },
    Owned {
        directory: ".angular",
        confirmed_by: None,
        markers: NODE,
        label: "Angular cache",
        regenerable: true,
    },
    Owned {
        directory: ".nuxt",
        confirmed_by: None,
        markers: NODE,
        label: "Nuxt build cache",
        regenerable: true,
    },
    Owned {
        directory: ".svelte-kit",
        confirmed_by: None,
        markers: NODE,
        label: "SvelteKit build cache",
        regenerable: true,
    },
    // Ambiguous names, admitted by what is inside them.
    Owned {
        directory: "target",
        confirmed_by: Some("CACHEDIR.TAG"),
        markers: &["Cargo.toml"],
        label: "Build cache",
        regenerable: true,
    },
    // Python's stdlib `venv` writes `pyvenv.cfg` at the root of every
    // environment it creates, and nothing else does.
    Owned {
        directory: ".venv",
        confirmed_by: Some("pyvenv.cfg"),
        markers: PYTHON,
        label: "Python virtual environment",
        regenerable: false,
    },
    Owned {
        directory: "venv",
        confirmed_by: Some("pyvenv.cfg"),
        markers: PYTHON,
        label: "Python virtual environment",
        regenerable: false,
    },
    Owned {
        directory: "env",
        confirmed_by: Some("pyvenv.cfg"),
        markers: PYTHON,
        label: "Python virtual environment",
        regenerable: false,
    },
];

/// Anything that would make a directory of Python dependencies somebody's.
///
/// Longer than the Node list because Python never settled on one file, and
/// missing any of them would report a live project's environment as abandoned.
const PYTHON: &[&str] = &[
    "pyproject.toml",
    "requirements.txt",
    "Pipfile",
    "setup.py",
    "setup.cfg",
    "environment.yml",
];

/// One directory nothing owns.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Orphan {
    pub path: String,
    /// The directory it sits in, which is the one with no manifest in it.
    pub parent: String,
    pub label: String,
    /// `None` until the caller has weighed it.
    pub bytes: Option<u64>,
    /// Whether a command could rebuild this if its project came back.
    ///
    /// False for a virtual environment. It is still dead weight, for the
    /// opposite reason to everything else here: not because rebuilding is
    /// cheap, but because nothing is left that could use it.
    pub regenerable: bool,
}

#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct OrphanReport {
    /// Heaviest first, once weighed.
    pub orphans: Vec<Orphan>,
    pub bytes: u64,
    /// Directories the walk looked at, so an empty report can say it looked.
    pub examined: usize,
}

/// Whether a directory of this name is claimed by nothing.
///
/// `has_marker` is injected so the rule can be tested without a filesystem, the
/// same way `hygiene::worktrees` takes its existence check.
///
/// Returns `None` for any name not on the list, for a directory whose parent
/// claims it, and for one nested inside another copy of itself — a
/// `node_modules` inside a `node_modules` belongs to the outer install, and its
/// parent is a package rather than a project.
pub fn classify(
    path: &Path,
    root: &Path,
    has_marker: &dyn Fn(&Path, &str) -> bool,
) -> Option<Orphan> {
    let name = path.file_name()?.to_str()?;
    let owned = recognise(path, name, has_marker)?;

    if nested_in_itself(path, name) {
        return None;
    }

    // Every directory from the parent up to the root, inclusive. One manifest
    // anywhere along that chain and this is somebody's.
    let parent = path.parent()?;
    let mut directory = Some(parent);
    while let Some(current) = directory {
        if owned
            .markers
            .iter()
            .any(|marker| has_marker(current, marker))
        {
            return None;
        }
        if current == root {
            break;
        }
        directory = current.parent();
    }

    Some(Orphan {
        path: path.to_string_lossy().into_owned(),
        parent: parent.to_string_lossy().into_owned(),
        label: owned.label.to_owned(),
        bytes: None,
        regenerable: owned.regenerable,
    })
}

/// Which entry this directory is, if any.
///
/// Every entry sharing the name is considered, because one ambiguous name can
/// belong to more than one tool and only the file inside settles which.
fn recognise(
    path: &Path,
    name: &str,
    has_marker: &dyn Fn(&Path, &str) -> bool,
) -> Option<&'static Owned> {
    OWNED
        .iter()
        .filter(|entry| entry.directory == name)
        .find(|entry| match entry.confirmed_by {
            Some(inside) => has_marker(path, inside),
            None => true,
        })
}

/// Whether this is a known tool's artifact, whether or not a project claims it.
///
/// The walk needs this and `classify` cannot answer it: `classify` returns
/// `None` both for "a project owns this" and for "not a directory this rule
/// knows", and only the first is a reason to stop descending. Told apart, a
/// healthy `node_modules` is stepped over; conflated, the walk either reads
/// every dependency tree on the machine or halts at every ordinary folder.
///
/// It lives here rather than as a list of names beside the walk, because a list
/// of names beside the walk is a second copy of this table that drifts the first
/// time an entry is added — which it did.
pub fn is_artifact(path: &Path, has_marker: &dyn Fn(&Path, &str) -> bool) -> bool {
    path.file_name()
        .and_then(|name| name.to_str())
        .and_then(|name| recognise(path, name, has_marker))
        .is_some()
}

/// Whether this sits inside another directory of the same name.
fn nested_in_itself(path: &Path, name: &str) -> bool {
    path.ancestors()
        .skip(1)
        .filter_map(Path::file_name)
        .any(|ancestor| ancestor.eq_ignore_ascii_case(name))
}

/// Applies measured weights and orders the report.
pub fn weigh(report: &mut OrphanReport, sizes: &std::collections::HashMap<String, u64>) {
    for orphan in &mut report.orphans {
        orphan.bytes = sizes.get(&orphan.path).copied();
    }
    // Unweighed sink rather than disappear, for the same reason they do in the
    // duplicate report: dropping what could not be read would quietly shrink a
    // total the user is being asked to believe.
    report
        .orphans
        .sort_by_key(|orphan| std::cmp::Reverse(orphan.bytes.unwrap_or(0)));
    report.bytes = report.orphans.iter().fold(0u64, |total, orphan| {
        total.saturating_add(orphan.bytes.unwrap_or(0))
    });
}

#[cfg(test)]
mod tests {
    use super::{classify, weigh, Orphan, OrphanReport};
    use std::collections::HashMap;
    use std::path::Path;

    /// A filesystem described as the set of directories holding a manifest.
    fn markers<'a>(owned: &'a [&'a str]) -> impl Fn(&Path, &str) -> bool + 'a {
        move |directory: &Path, marker: &str| {
            marker == "package.json" && owned.iter().any(|held| Path::new(held) == directory)
        }
    }

    #[test]
    fn a_node_modules_beside_its_manifest_belongs_to_someone() {
        let has = markers(&["/w/api"]);
        assert_eq!(
            classify(Path::new("/w/api/node_modules"), Path::new("/w"), &has),
            None
        );
    }

    #[test]
    fn a_node_modules_whose_project_is_gone_is_an_orphan() {
        let has = markers(&[]);
        let found = classify(Path::new("/w/api/node_modules"), Path::new("/w"), &has)
            .expect("nothing claims it");

        assert_eq!(found.path, "/w/api/node_modules");
        assert_eq!(found.parent, "/w/api");
        assert_eq!(found.label, "Node modules");
        assert_eq!(found.bytes, None, "weighing is a separate pass");
    }

    /// The narrowing that keeps this from firing on a monorepo. A workspace
    /// member whose own manifest is momentarily missing still sits under the
    /// repository's, and that is a project mid-edit rather than an orphan.
    #[test]
    fn a_manifest_further_up_still_claims_it() {
        let has = markers(&["/w/repo"]);
        assert_eq!(
            classify(
                Path::new("/w/repo/packages/ui/node_modules"),
                Path::new("/w"),
                &has
            ),
            None
        );
    }

    /// The chain stops at the root. A manifest outside the folder the user
    /// chose is not evidence about anything inside it, and walking past the
    /// root would let an unrelated `package.json` in a home directory silence
    /// every finding beneath it.
    #[test]
    fn a_manifest_above_the_root_does_not_reach_inside_it() {
        let has = markers(&["/w"]);
        let found = classify(
            Path::new("/w/projects/api/node_modules"),
            Path::new("/w/projects"),
            &has,
        );

        assert!(found.is_some(), "the search stops at the chosen folder");
    }

    /// A `node_modules` inside a `node_modules` is a package's own copy. Its
    /// parent is a package directory, which never holds a project manifest, so
    /// without this every nested install would report as an orphan.
    #[test]
    fn a_nested_copy_belongs_to_the_install_around_it() {
        let has = markers(&[]);
        assert_eq!(
            classify(
                Path::new("/w/api/node_modules/debug/node_modules"),
                Path::new("/w"),
                &has
            ),
            None
        );
    }

    /// The names with no way to tell them apart from an ordinary folder stay
    /// out. Being wrong here means telling someone a directory they need
    /// belongs to nobody.
    #[test]
    fn a_directory_no_scanner_claims_is_not_a_finding() {
        let has = markers(&[]);
        for path in ["/w/api/dist", "/w/api/build", "/w/api/vendor", "/w/api/src"] {
            assert_eq!(
                classify(Path::new(path), Path::new("/w"), &has),
                None,
                "{path} is a name other tools use too"
            );
        }
    }

    /// `target` is what every Makefile ever written also produces, so the name
    /// alone was never enough. `CACHEDIR.TAG` settles it: the tag's own
    /// specification means the directory holds regenerable data, whoever wrote
    /// it, which is exactly the question being asked.
    #[test]
    fn an_ambiguous_name_needs_the_file_that_identifies_it() {
        let bare = |_: &Path, _: &str| false;
        assert_eq!(
            classify(Path::new("/w/api/target"), Path::new("/w"), &bare),
            None,
            "a folder called target with nothing in it is just a folder"
        );

        let tagged = |directory: &Path, file: &str| {
            directory == Path::new("/w/api/target") && file == "CACHEDIR.TAG"
        };
        let found = classify(Path::new("/w/api/target"), Path::new("/w"), &tagged)
            .expect("a tagged cache directory nothing owns");
        assert_eq!(found.label, "Build cache");
        assert!(found.regenerable);
    }

    #[test]
    fn a_cargo_target_beside_its_manifest_belongs_to_someone() {
        let has = |directory: &Path, file: &str| match file {
            "CACHEDIR.TAG" => directory == Path::new("/w/api/target"),
            "Cargo.toml" => directory == Path::new("/w/api"),
            _ => false,
        };
        assert_eq!(
            classify(Path::new("/w/api/target"), Path::new("/w"), &has),
            None
        );
    }

    /// The one finding here that is not disposable because rebuilding is cheap.
    /// Without the project's dependency file nothing can reproduce a virtual
    /// environment — it is dead weight for the opposite reason, because nothing
    /// is left that could use it, and the screen has to say so differently.
    #[test]
    fn an_abandoned_virtual_environment_is_reported_as_not_rebuildable() {
        let venv = |directory: &Path, file: &str| {
            file == "pyvenv.cfg" && directory == Path::new("/w/api/.venv")
        };
        let found = classify(Path::new("/w/api/.venv"), Path::new("/w"), &venv)
            .expect("no Python project claims it");

        assert_eq!(found.label, "Python virtual environment");
        assert!(
            !found.regenerable,
            "nothing can rebuild this once its project is gone"
        );
    }

    /// Python never settled on one file, and missing any of them would report a
    /// live project's environment as abandoned.
    #[test]
    fn any_of_the_python_manifests_claims_an_environment() {
        for manifest in [
            "pyproject.toml",
            "requirements.txt",
            "Pipfile",
            "setup.py",
            "setup.cfg",
            "environment.yml",
        ] {
            let has = |directory: &Path, file: &str| match file {
                "pyvenv.cfg" => directory == Path::new("/w/api/.venv"),
                other => other == manifest && directory == Path::new("/w/api"),
            };
            assert_eq!(
                classify(Path::new("/w/api/.venv"), Path::new("/w"), &has),
                None,
                "{manifest} beside it means a project uses it"
            );
        }
    }

    /// A folder called `env` is usually not a virtual environment at all, and
    /// reporting one as abandoned would be the worst mistake this rule can make.
    #[test]
    fn a_folder_named_env_that_is_not_an_environment_is_left_alone() {
        let bare = |_: &Path, _: &str| false;
        for name in ["env", "venv", ".venv"] {
            let path = format!("/w/api/{name}");
            assert_eq!(
                classify(Path::new(&path), Path::new("/w"), &bare),
                None,
                "{name} without pyvenv.cfg is an ordinary folder"
            );
        }
    }

    #[test]
    fn the_framework_caches_are_claimed_by_the_same_manifest() {
        let claimed = markers(&["/w/api"]);
        let unclaimed = markers(&[]);
        for name in [".next", ".turbo", ".angular", ".nuxt", ".svelte-kit"] {
            let path = format!("/w/api/{name}");
            assert_eq!(
                classify(Path::new(&path), Path::new("/w"), &claimed),
                None,
                "{name} beside a manifest"
            );
            assert!(
                classify(Path::new(&path), Path::new("/w"), &unclaimed).is_some(),
                "{name} with no manifest anywhere"
            );
        }
    }

    #[test]
    fn the_heaviest_orphan_leads_and_the_total_is_their_sum() {
        let mut report = OrphanReport {
            orphans: vec![
                Orphan {
                    path: "/w/small/node_modules".into(),
                    parent: "/w/small".into(),
                    label: "Node modules".into(),
                    regenerable: true,
                    bytes: None,
                },
                Orphan {
                    path: "/w/large/node_modules".into(),
                    parent: "/w/large".into(),
                    label: "Node modules".into(),
                    regenerable: true,
                    bytes: None,
                },
            ],
            ..OrphanReport::default()
        };
        weigh(
            &mut report,
            &HashMap::from([
                ("/w/small/node_modules".to_owned(), 10),
                ("/w/large/node_modules".to_owned(), 9_000),
            ]),
        );

        assert_eq!(report.orphans[0].path, "/w/large/node_modules");
        assert_eq!(report.bytes, 9_010);
    }

    #[test]
    fn one_that_could_not_be_weighed_stays_in_the_list_at_nothing() {
        let mut report = OrphanReport {
            orphans: vec![Orphan {
                path: "/w/unreadable/node_modules".into(),
                parent: "/w/unreadable".into(),
                label: "Node modules".into(),
                regenerable: true,
                bytes: None,
            }],
            ..OrphanReport::default()
        };
        weigh(&mut report, &HashMap::new());

        assert_eq!(report.orphans.len(), 1);
        assert_eq!(report.orphans[0].bytes, None);
        assert_eq!(report.bytes, 0);
    }

    #[test]
    fn the_report_crosses_the_boundary_in_camel_case() {
        let report = OrphanReport {
            orphans: vec![Orphan {
                path: "/w/a/node_modules".into(),
                parent: "/w/a".into(),
                label: "Node modules".into(),
                regenerable: true,
                bytes: Some(4),
            }],
            bytes: 4,
            examined: 12,
        };
        let value = serde_json::to_value(&report).unwrap();

        assert_eq!(value["orphans"][0]["bytes"], 4);
        assert_eq!(value["examined"], 12);
    }
}
