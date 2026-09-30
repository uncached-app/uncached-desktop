//! Toolchain versions installed by version managers, and which of them no
//! project in the workspace pins and no manager uses as its default.
//!
//! Report only: each version comes with the manager's own uninstall command,
//! because removing the directory would leave rustup's and SDKMAN's records
//! pointing at nothing.

use serde::Serialize;
use std::collections::HashSet;
use std::path::{Path, PathBuf};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum Runtime {
    Node,
    Rust,
    Python,
    Java,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum Manager {
    Nvm,
    Fnm,
    Rustup,
    Pyenv,
    Sdkman,
}

impl Manager {
    pub fn runtime(self) -> Runtime {
        match self {
            Manager::Nvm | Manager::Fnm => Runtime::Node,
            Manager::Rustup => Runtime::Rust,
            Manager::Pyenv => Runtime::Python,
            Manager::Sdkman => Runtime::Java,
        }
    }

    pub fn uninstall_command(self, version: &str) -> String {
        match self {
            Manager::Nvm => format!("nvm uninstall {version}"),
            Manager::Fnm => format!("fnm uninstall {version}"),
            Manager::Rustup => format!("rustup toolchain uninstall {version}"),
            Manager::Pyenv => format!("pyenv uninstall -f {version}"),
            Manager::Sdkman => format!("sdk uninstall java {version}"),
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Installed {
    pub manager: Manager,
    /// The directory name, which is what the manager's commands take.
    pub version: String,
    pub path: PathBuf,
}

/// Where each manager keeps its versions. `None` when it has no directory.
#[derive(Debug, Clone, Default)]
pub struct Roots {
    pub nvm: Option<PathBuf>,
    pub fnm: Option<PathBuf>,
    pub rustup: Option<PathBuf>,
    pub pyenv: Option<PathBuf>,
    pub sdkman: Option<PathBuf>,
}

impl Roots {
    /// Each manager's variable when set, its default location otherwise.
    pub fn resolve(home: &Path, var: impl Fn(&str) -> Option<String>) -> Self {
        let chosen = |name: &str, fallbacks: &[PathBuf]| {
            var(name)
                .map(PathBuf::from)
                .or_else(|| fallbacks.iter().find(|path| path.is_dir()).cloned())
                .filter(|path| path.is_dir())
        };
        Self {
            nvm: chosen("NVM_DIR", &[home.join(".nvm")]),
            fnm: chosen(
                "FNM_DIR",
                &[
                    home.join(".local/share/fnm"),
                    home.join("Library/Application Support/fnm"),
                ],
            ),
            rustup: chosen("RUSTUP_HOME", &[home.join(".rustup")]),
            pyenv: chosen("PYENV_ROOT", &[home.join(".pyenv")]),
            sdkman: chosen("SDKMAN_DIR", &[home.join(".sdkman")]),
        }
    }
}

/// Real directories inside `dir`, skipping hidden entries and symlinks.
fn version_dirs(dir: &Path) -> Vec<(String, PathBuf)> {
    let Ok(entries) = std::fs::read_dir(dir) else {
        return Vec::new();
    };
    let mut found: Vec<(String, PathBuf)> = entries
        .flatten()
        .filter(|entry| entry.file_type().is_ok_and(|kind| kind.is_dir()))
        .filter_map(|entry| {
            let name = entry.file_name().into_string().ok()?;
            (!name.starts_with('.')).then(|| (name, entry.path()))
        })
        .collect();
    found.sort();
    found
}

pub fn installed(roots: &Roots) -> Vec<Installed> {
    let sources = [
        (
            Manager::Nvm,
            roots.nvm.as_ref().map(|root| root.join("versions/node")),
        ),
        (
            Manager::Fnm,
            roots.fnm.as_ref().map(|root| root.join("node-versions")),
        ),
        (
            Manager::Rustup,
            roots.rustup.as_ref().map(|root| root.join("toolchains")),
        ),
        (
            Manager::Pyenv,
            roots.pyenv.as_ref().map(|root| root.join("versions")),
        ),
        (
            Manager::Sdkman,
            roots
                .sdkman
                .as_ref()
                .map(|root| root.join("candidates/java")),
        ),
    ];
    sources
        .into_iter()
        .filter_map(|(manager, dir)| Some((manager, dir?)))
        .flat_map(|(manager, dir)| {
            version_dirs(&dir)
                .into_iter()
                .filter(|(name, _)| name != "current")
                .map(move |(version, path)| Installed {
                    manager,
                    version,
                    path,
                })
        })
        .collect()
}

/// A version a project or a manager's default asks for.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Pin {
    pub runtime: Runtime,
    pub spec: String,
}

fn pin(runtime: Runtime, spec: &str) -> Option<Pin> {
    let spec = spec.trim().trim_matches('"');
    (!spec.is_empty() && !spec.starts_with('#')).then(|| Pin {
        runtime,
        spec: spec.to_owned(),
    })
}

fn first_line(path: &Path) -> Option<String> {
    std::fs::read_to_string(path)
        .ok()?
        .lines()
        .map(str::trim)
        .find(|line| !line.is_empty() && !line.starts_with('#'))
        .map(str::to_owned)
}

/// `key = "value"` from a TOML file, without a TOML parser: the files read here
/// hold single string values.
fn toml_string(text: &str, key: &str) -> Option<String> {
    text.lines().find_map(|line| {
        let (name, value) = line.split_once('=')?;
        (name.trim() == key).then(|| value.trim().trim_matches('"').to_owned())
    })
}

/// Versions a project pins in the files version managers read.
pub fn project_pins(project: &Path) -> Vec<Pin> {
    let mut pins = Vec::new();

    for file in [".nvmrc", ".node-version"] {
        if let Some(line) = first_line(&project.join(file)) {
            pins.extend(pin(Runtime::Node, &line));
        }
    }
    if let Some(node) = std::fs::read_to_string(project.join("package.json"))
        .ok()
        .and_then(|text| serde_json::from_str::<serde_json::Value>(&text).ok())
        .and_then(|json| json.pointer("/volta/node")?.as_str().map(str::to_owned))
    {
        pins.extend(pin(Runtime::Node, &node));
    }

    if let Ok(text) = std::fs::read_to_string(project.join("rust-toolchain.toml")) {
        pins.extend(toml_string(&text, "channel").and_then(|channel| pin(Runtime::Rust, &channel)));
    }
    if let Ok(text) = std::fs::read_to_string(project.join("rust-toolchain")) {
        let channel =
            toml_string(&text, "channel").or_else(|| text.lines().next().map(str::to_owned));
        pins.extend(channel.and_then(|channel| pin(Runtime::Rust, &channel)));
    }

    if let Ok(text) = std::fs::read_to_string(project.join(".python-version")) {
        pins.extend(text.lines().filter_map(|line| pin(Runtime::Python, line)));
    }
    if let Ok(text) = std::fs::read_to_string(project.join(".sdkmanrc")) {
        pins.extend(
            text.lines()
                .filter_map(|line| line.trim().strip_prefix("java="))
                .filter_map(|version| pin(Runtime::Java, version)),
        );
    }
    if let Ok(text) = std::fs::read_to_string(project.join(".tool-versions")) {
        for line in text.lines() {
            let mut words = line.split_whitespace();
            let runtime = match words.next() {
                Some("nodejs" | "node") => Runtime::Node,
                Some("rust") => Runtime::Rust,
                Some("python") => Runtime::Python,
                Some("java") => Runtime::Java,
                _ => continue,
            };
            pins.extend(words.filter_map(|version| pin(runtime, version)));
        }
    }
    pins
}

fn link_target_name(link: &Path) -> Option<String> {
    let target = std::fs::read_link(link).ok()?;
    let target = if target.file_name()? == "installation" {
        target.parent()?.to_path_buf()
    } else {
        target
    };
    target.file_name()?.to_str().map(str::to_owned)
}

/// The version each manager falls back to, which is in use whether or not a
/// project pins it. nvm's `node` alias resolves to the newest installed.
pub fn default_pins(roots: &Roots, installed: &[Installed]) -> Vec<Pin> {
    let mut pins = Vec::new();

    if let Some(alias) = roots
        .nvm
        .as_ref()
        .and_then(|root| first_line(&root.join("alias/default")))
    {
        let newest = || {
            installed
                .iter()
                .filter(|entry| entry.manager == Manager::Nvm)
                .max_by(|left, right| {
                    numeric_parts(&left.version).cmp(&numeric_parts(&right.version))
                })
                .map(|entry| entry.version.clone())
        };
        let spec = match alias.as_str() {
            "node" | "stable" | "latest" | "current" => newest(),
            _ => Some(alias),
        };
        pins.extend(spec.and_then(|spec| pin(Runtime::Node, &spec)));
    }
    if let Some(version) = roots
        .fnm
        .as_ref()
        .and_then(|root| link_target_name(&root.join("aliases/default")))
    {
        pins.extend(pin(Runtime::Node, &version));
    }
    if let Some(text) = roots
        .rustup
        .as_ref()
        .and_then(|root| std::fs::read_to_string(root.join("settings.toml")).ok())
    {
        pins.extend(
            toml_string(&text, "default_toolchain")
                .and_then(|toolchain| pin(Runtime::Rust, &toolchain)),
        );
        let overrides = text.split("[overrides]").nth(1).unwrap_or_default();
        pins.extend(
            overrides
                .lines()
                .take_while(|line| !line.trim_start().starts_with('['))
                .filter_map(|line| line.split_once('=').map(|(_, toolchain)| toolchain))
                .filter_map(|toolchain| pin(Runtime::Rust, toolchain)),
        );
    }
    if let Some(text) = roots
        .pyenv
        .as_ref()
        .and_then(|root| std::fs::read_to_string(root.join("version")).ok())
    {
        pins.extend(text.lines().filter_map(|line| pin(Runtime::Python, line)));
    }
    if let Some(version) = roots
        .sdkman
        .as_ref()
        .and_then(|root| link_target_name(&root.join("candidates/java/current")))
    {
        pins.extend(pin(Runtime::Java, &version));
    }
    pins
}

/// How a pin selects installed versions.
#[derive(Debug, PartialEq, Eq)]
enum Selector {
    /// Leading numeric components; `x` and `*` match any.
    Prefix(Vec<String>),
    /// A Rust channel or dated toolchain, matched as a name prefix.
    Channel(String),
    Exact(String),
    /// Refers to a version no manager here installs (`system`).
    Ignore,
    /// Cannot be resolved offline (`lts/*`); every version may be the one.
    Unknown,
}

fn strip_v(version: &str) -> &str {
    version.strip_prefix('v').unwrap_or(version)
}

fn numeric_parts(version: &str) -> Vec<u64> {
    strip_v(version)
        .split(['.', '-'])
        .map_while(|part| part.parse().ok())
        .collect()
}

fn is_numeric_spec(spec: &str) -> bool {
    !spec.is_empty()
        && spec.split('.').all(|part| {
            part == "x"
                || part == "*"
                || (!part.is_empty() && part.chars().all(|c| c.is_ascii_digit()))
        })
}

fn selector(runtime: Runtime, spec: &str) -> Selector {
    let spec = strip_v(spec.trim());
    if spec == "system" {
        return Selector::Ignore;
    }
    match runtime {
        Runtime::Node if is_numeric_spec(spec) => {
            Selector::Prefix(spec.split('.').map(str::to_owned).collect())
        }
        Runtime::Node => Selector::Unknown,
        Runtime::Python if is_numeric_spec(spec) => {
            Selector::Prefix(spec.split('.').map(str::to_owned).collect())
        }
        Runtime::Python => Selector::Exact(spec.to_owned()),
        Runtime::Rust => Selector::Channel(spec.to_owned()),
        Runtime::Java => Selector::Exact(spec.to_owned()),
    }
}

fn selects(selector: &Selector, version: &str) -> bool {
    match selector {
        Selector::Prefix(parts) => {
            let installed: Vec<&str> = strip_v(version).split('.').collect();
            parts.len() <= installed.len()
                && parts
                    .iter()
                    .zip(&installed)
                    .all(|(wanted, have)| wanted == "x" || wanted == "*" || wanted == have)
        }
        Selector::Channel(channel) => {
            version == channel
                || version.starts_with(&format!("{channel}-"))
                || version.starts_with(&format!("{channel}."))
        }
        Selector::Exact(name) => version == name,
        Selector::Ignore => false,
        Selector::Unknown => true,
    }
}

/// Installed versions no pin selects. A runtime with an unresolvable pin
/// reports nothing: any of its versions may be the one in use.
pub fn unused(installed: &[Installed], pins: &[Pin]) -> Vec<Installed> {
    let selectors: Vec<(Runtime, Selector)> = pins
        .iter()
        .map(|pin| (pin.runtime, selector(pin.runtime, &pin.spec)))
        .collect();
    let undecidable: HashSet<Runtime> = selectors
        .iter()
        .filter(|(_, selector)| *selector == Selector::Unknown)
        .map(|(runtime, _)| *runtime)
        .collect();

    installed
        .iter()
        .filter(|entry| {
            let runtime = entry.manager.runtime();
            !undecidable.contains(&runtime)
                && !selectors.iter().any(|(pinned, selector)| {
                    *pinned == runtime && selects(selector, &entry.version)
                })
        })
        .cloned()
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    fn scratch(name: &str) -> PathBuf {
        let root =
            std::env::temp_dir().join(format!("uncached-toolchains-{name}-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&root);
        std::fs::create_dir_all(&root).unwrap();
        root
    }

    fn installed_as(manager: Manager, version: &str) -> Installed {
        Installed {
            manager,
            version: version.to_owned(),
            path: PathBuf::from(format!("/x/{version}")),
        }
    }

    fn node(spec: &str) -> Pin {
        Pin {
            runtime: Runtime::Node,
            spec: spec.to_owned(),
        }
    }

    #[test]
    fn node_pins_match_by_leading_components() {
        let versions = ["v16.20.2", "v18.17.1", "v18.19.0", "v20.11.0"];
        let installed: Vec<Installed> = versions
            .iter()
            .map(|version| installed_as(Manager::Nvm, version))
            .collect();
        let left: Vec<String> = unused(&installed, &[node("18"), node("v20.11.0")])
            .into_iter()
            .map(|entry| entry.version)
            .collect();
        assert_eq!(left, vec!["v16.20.2"]);

        let wildcard: Vec<String> = unused(&installed, &[node("18.x")])
            .into_iter()
            .map(|entry| entry.version)
            .collect();
        assert_eq!(wildcard, vec!["v16.20.2", "v20.11.0"]);
    }

    #[test]
    fn an_unresolvable_pin_keeps_every_version_of_its_runtime() {
        let installed = [
            installed_as(Manager::Nvm, "v16.20.2"),
            installed_as(Manager::Pyenv, "3.9.18"),
        ];
        let left = unused(&installed, &[node("lts/*")]);
        assert_eq!(left, vec![installed_as(Manager::Pyenv, "3.9.18")]);
    }

    #[test]
    fn rust_channels_and_versions_match_toolchain_names() {
        let installed = [
            installed_as(Manager::Rustup, "stable-aarch64-apple-darwin"),
            installed_as(Manager::Rustup, "1.70.0-aarch64-apple-darwin"),
            installed_as(Manager::Rustup, "1.75.0-aarch64-apple-darwin"),
            installed_as(Manager::Rustup, "nightly-2024-01-01-aarch64-apple-darwin"),
        ];
        let pins = [
            Pin {
                runtime: Runtime::Rust,
                spec: "stable-aarch64-apple-darwin".into(),
            },
            Pin {
                runtime: Runtime::Rust,
                spec: "1.70".into(),
            },
        ];
        let left: Vec<String> = unused(&installed, &pins)
            .into_iter()
            .map(|entry| entry.version)
            .collect();
        assert_eq!(
            left,
            vec![
                "1.75.0-aarch64-apple-darwin",
                "nightly-2024-01-01-aarch64-apple-darwin"
            ]
        );
    }

    #[test]
    fn python_names_and_system_are_handled() {
        let installed = [
            installed_as(Manager::Pyenv, "3.11.4"),
            installed_as(Manager::Pyenv, "miniconda3-latest"),
        ];
        let pins = [
            Pin {
                runtime: Runtime::Python,
                spec: "system".into(),
            },
            Pin {
                runtime: Runtime::Python,
                spec: "3.11".into(),
            },
        ];
        assert_eq!(
            unused(&installed, &pins),
            vec![installed_as(Manager::Pyenv, "miniconda3-latest")]
        );
    }

    #[test]
    fn a_project_s_pin_files_are_all_read() {
        let project = scratch("pins");
        std::fs::write(project.join(".nvmrc"), "# node\nv18\n").unwrap();
        std::fs::write(
            project.join("package.json"),
            r#"{"volta":{"node":"20.11.0"}}"#,
        )
        .unwrap();
        std::fs::write(
            project.join("rust-toolchain.toml"),
            "[toolchain]\nchannel = \"1.70.0\"\n",
        )
        .unwrap();
        std::fs::write(project.join(".python-version"), "3.11.4\n3.9\n").unwrap();
        std::fs::write(project.join(".sdkmanrc"), "java=17.0.2-tem\n").unwrap();
        std::fs::write(
            project.join(".tool-versions"),
            "nodejs 16.20.2\nterraform 1.5.0\n",
        )
        .unwrap();

        let pins = project_pins(&project);
        let _ = std::fs::remove_dir_all(&project);

        let specs: Vec<(Runtime, &str)> = pins
            .iter()
            .map(|pin| (pin.runtime, pin.spec.as_str()))
            .collect();
        assert_eq!(
            specs,
            vec![
                (Runtime::Node, "v18"),
                (Runtime::Node, "20.11.0"),
                (Runtime::Rust, "1.70.0"),
                (Runtime::Python, "3.11.4"),
                (Runtime::Python, "3.9"),
                (Runtime::Java, "17.0.2-tem"),
                (Runtime::Node, "16.20.2"),
            ]
        );
    }

    #[test]
    fn managers_and_their_defaults_are_found_on_disk() {
        let home = scratch("home");
        let nvm = home.join(".nvm");
        for version in ["v16.20.2", "v20.11.0"] {
            std::fs::create_dir_all(nvm.join("versions/node").join(version)).unwrap();
        }
        std::fs::create_dir_all(nvm.join("alias")).unwrap();
        std::fs::write(nvm.join("alias/default"), "node\n").unwrap();
        let rustup = home.join("elsewhere/rustup");
        for toolchain in ["stable-aarch64-apple-darwin", "1.70.0-aarch64-apple-darwin"] {
            std::fs::create_dir_all(rustup.join("toolchains").join(toolchain)).unwrap();
        }
        std::fs::write(rustup.join("settings.toml"), "default_toolchain = \"stable-aarch64-apple-darwin\"\n\n[overrides]\n\"/w/legacy\" = \"1.70.0-aarch64-apple-darwin\"\n").unwrap();

        let rustup_home = rustup.to_string_lossy().into_owned();
        let roots = Roots::resolve(&home, |name| {
            (name == "RUSTUP_HOME").then(|| rustup_home.clone())
        });
        let found = installed(&roots);
        let pins = default_pins(&roots, &found);
        let left: Vec<String> = unused(&found, &pins)
            .into_iter()
            .map(|entry| entry.version)
            .collect();
        let _ = std::fs::remove_dir_all(&home);

        assert_eq!(found.len(), 4);
        assert_eq!(
            left,
            vec!["v16.20.2"],
            "the newest node is nvm's default and both toolchains are in use"
        );
    }

    #[test]
    fn each_manager_names_its_own_uninstall() {
        assert_eq!(
            Manager::Nvm.uninstall_command("v16.20.2"),
            "nvm uninstall v16.20.2"
        );
        assert_eq!(
            Manager::Rustup.uninstall_command("1.70.0-aarch64-apple-darwin"),
            "rustup toolchain uninstall 1.70.0-aarch64-apple-darwin"
        );
        assert_eq!(
            Manager::Sdkman.uninstall_command("17.0.2-tem"),
            "sdk uninstall java 17.0.2-tem"
        );
    }
}
