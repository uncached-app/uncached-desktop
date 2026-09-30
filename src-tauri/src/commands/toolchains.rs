use crate::commands::locate::authorize;
use crate::errors::command::CommandError;
use crate::workspace::toolchains::{self, Manager, Roots, Runtime};
use serde::Serialize;
use std::path::PathBuf;
use tauri::AppHandle;

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct UnusedToolchain {
    pub runtime: Runtime,
    pub manager: Manager,
    pub version: String,
    pub path: String,
    pub bytes: u64,
    /// The manager's own command; Uncached never removes a toolchain.
    pub uninstall: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ToolchainReport {
    pub installed_count: usize,
    pub unused_count: usize,
    pub unused_bytes: u64,
    /// Heaviest first. Empty without Pro, which sees only the totals above.
    pub unused: Vec<UnusedToolchain>,
    pub locked: bool,
}

/// Toolchain versions installed by nvm, fnm, rustup, pyenv or SDKMAN that no
/// project under these paths pins and no manager uses as its default.
#[tauri::command]
pub async fn toolchain_report(
    app: AppHandle,
    paths: Vec<String>,
) -> Result<ToolchainReport, CommandError> {
    let mut projects: Vec<PathBuf> = Vec::new();
    for path in &paths {
        projects.push(authorize(&app, path)?);
    }
    let pro_enabled = crate::commands::entitlements::current_status().pro_enabled;

    tauri::async_runtime::spawn_blocking(move || build(&projects, pro_enabled))
        .await
        .map_err(|error| error.to_string().into())
}

fn build(projects: &[PathBuf], pro_enabled: bool) -> ToolchainReport {
    let roots = uncached_core::home_directory()
        .map(|home| Roots::resolve(&home, crate::shell_env::var))
        .unwrap_or_default();
    let installed = toolchains::installed(&roots);
    let mut pins = toolchains::default_pins(&roots, &installed);
    for project in projects {
        pins.extend(toolchains::project_pins(project));
    }

    let mut unused: Vec<UnusedToolchain> = toolchains::unused(&installed, &pins)
        .into_iter()
        .map(|entry| UnusedToolchain {
            runtime: entry.manager.runtime(),
            manager: entry.manager,
            uninstall: entry.manager.uninstall_command(&entry.version),
            bytes: crate::filesystem::size::calculate_dir_size(&entry.path),
            path: entry.path.to_string_lossy().into_owned(),
            version: entry.version,
        })
        .collect();
    unused.sort_by(|left, right| right.bytes.cmp(&left.bytes));

    crate::logging::info(
        "toolchains",
        &format!("installed={} unused={}", installed.len(), unused.len()),
    );

    ToolchainReport {
        installed_count: installed.len(),
        unused_count: unused.len(),
        unused_bytes: unused.iter().map(|entry| entry.bytes).sum(),
        unused: if pro_enabled { unused } else { Vec::new() },
        locked: !pro_enabled,
    }
}
