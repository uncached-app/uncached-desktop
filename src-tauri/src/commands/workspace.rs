use crate::workspace::git::{self, GitContext};
use crate::workspace::maintenance;
use crate::workspace::restore;
use crate::workspace::schedule;
use crate::workspace::verdict::{self, ActivityState, Verdict};
use serde::Serialize;
use std::path::Path;
use std::sync::atomic::AtomicBool;
use std::time::{SystemTime, UNIX_EPOCH};

pub const MAX_PROJECTS: usize = 250;
const MAX_DEPTH: usize = 4;
/// How many unreadable folders are named back. The count is the whole story;
/// the sample only has to be long enough to show which kind of folder it is.
const MAX_UNREADABLE_SAMPLE: usize = 5;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkspaceProject {
    pub name: String,
    pub path: String,
    /// The indexed root this project sits under.
    pub root: String,
    pub kind: String,
    pub git: GitContext,
    pub activity: Activity,
    /// Other indexed paths holding the same repository.
    pub duplicate_of: Vec<String>,
    pub install_missing: bool,
    pub install_stale: bool,
    /// How what a reclaim removes would come back, and whether it would come
    /// back the same. `None` when nothing here identifies a package manager.
    pub restore: Option<crate::workspace::restore::Restore>,
    /// The directory this shares with at least one other project, if any.
    pub family: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Activity {
    pub last_activity_at: Option<i64>,
    pub idle_days: Option<u32>,
    pub state: ActivityState,
}

/// `source_bytes` is what remains once every reclaimable target is removed.
#[derive(Debug, Clone, Default, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Footprint {
    pub total_bytes: u64,
    pub source_bytes: u64,
    pub reclaimable_bytes: u64,
    pub by_category: Vec<CategoryBytes>,
    /// Some directory could not be read, so the total is partial.
    pub has_errors: bool,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CategoryBytes {
    pub category: String,
    pub bytes: u64,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkspaceIndex {
    pub roots: Vec<String>,
    pub projects: Vec<WorkspaceProject>,
    /// Roots the caller asked for that this plan does not cover.
    pub roots_over_limit: Vec<String>,
    pub root_limit: usize,
    /// Discovery hit `MAX_PROJECTS` or `MAX_DEPTH`.
    pub truncated: bool,
    /// Folders the operating system would not let discovery open. Projects
    /// inside them are missing from this index rather than known to be absent.
    pub unreadable: usize,
    /// The first few of them, so the user can see which access to grant.
    pub unreadable_sample: Vec<String>,
    /// Directories holding more than one of these projects. What the index used
    /// to leave on the disk: four folders under one `uncached-app` are one
    /// piece of work, and every screen was drawing four unrelated things.
    pub families: Vec<crate::workspace::family::Family>,
}

/// Folders discovery had to skip.
#[derive(Debug, Default)]
struct Skipped {
    count: usize,
    sample: Vec<String>,
}

impl Skipped {
    fn note(&mut self, path: &Path) {
        self.count += 1;
        if self.sample.len() < MAX_UNREADABLE_SAMPLE {
            self.sample.push(path.to_string_lossy().into_owned());
        }
    }
}

/// Canonicalises and collapses roots so the interface lists exactly what will be scanned.
#[tauri::command]
pub async fn normalize_workspace_roots(paths: Vec<String>) -> Vec<String> {
    let canonical = paths
        .into_iter()
        .map(|path| dunce::canonicalize(Path::new(&path)).unwrap_or(path.into()))
        .collect();
    crate::scanner::outermost_roots(canonical)
        .into_iter()
        .map(|root| root.to_string_lossy().into_owned())
        .collect()
}

#[tauri::command]
pub async fn scan_workspace_index(paths: Vec<String>) -> Result<WorkspaceIndex, String> {
    let limit = crate::commands::entitlements::root_limit();
    tauri::async_runtime::spawn_blocking(move || build_index(&paths, limit))
        .await
        .map_err(|error| error.to_string())?
}

fn build_index(paths: &[String], limit: usize) -> Result<WorkspaceIndex, String> {
    if paths.is_empty() {
        return Err("Select at least one folder".to_string());
    }
    let mut canonical = Vec::new();
    for path in paths {
        let root = dunce::canonicalize(Path::new(path))
            .map_err(|error| format!("Cannot open workspace: {error}"))?;
        if !root.is_dir() {
            return Err("Workspace path is not a directory".to_string());
        }
        canonical.push(root);
    }
    // Nested roots collapse into the outermost before the plan limit applies,
    // so a redundant folder never costs the user a slot.
    let canonical = crate::scanner::outermost_roots(canonical);
    let (accepted, over_limit) = canonical.split_at(canonical.len().min(limit));

    let mut roots = Vec::new();
    let mut projects = Vec::new();
    let mut truncated = false;
    let mut skipped = Skipped::default();

    for root in accepted {
        let before = projects.len();
        discover_projects(root, root, 0, &mut projects, &mut skipped)?;
        // The cap is shared across roots, so it is reported once for the whole index.
        truncated = truncated || projects.len() >= MAX_PROJECTS && projects.len() > before;
        roots.push(root.to_string_lossy().into_owned());
    }

    mark_duplicates(&mut projects);
    projects.sort_by_cached_key(|project| project.name.to_lowercase());

    let families = detect_families(&projects, &roots);
    for project in projects.iter_mut() {
        project.family = families
            .iter()
            .find(|family| family.members.iter().any(|member| member == &project.path))
            .map(|family| family.path.clone());
    }

    Ok(WorkspaceIndex {
        roots,
        projects,
        roots_over_limit: over_limit
            .iter()
            .map(|root| root.to_string_lossy().into_owned())
            .collect(),
        root_limit: limit,
        truncated,
        unreadable: skipped.count,
        unreadable_sample: skipped.sample,
        families,
    })
}

/// The disk half of `family::detect`, which is pure and takes this as a probe.
///
/// Two of the markers cannot be recognised by name. Every crate has a
/// `Cargo.toml` and every package has a `package.json`; only what is inside
/// says whether the directories beside it are members, so those two are read
/// and the rest are a `try_exists`.
fn detect_families(
    projects: &[WorkspaceProject],
    roots: &[String],
) -> Vec<crate::workspace::family::Family> {
    use crate::workspace::family;

    let paths: Vec<String> = projects
        .iter()
        .map(|project| project.path.clone())
        .collect();
    family::detect(&paths, roots, &|directory: &Path, name: &str| match name {
        "Cargo.toml" => std::fs::read_to_string(directory.join(name))
            .is_ok_and(|contents| family::cargo_declares_workspace(&contents)),
        "package.json" => std::fs::read_to_string(directory.join(name))
            .is_ok_and(|contents| family::package_declares_workspaces(&contents)),
        _ => directory.join(name).try_exists().unwrap_or(false),
    })
}

/// Walks one root for projects.
///
/// Only the folder the user chose can fail this: a folder found inside it that
/// the operating system withholds is counted and stepped over. Scanning a whole
/// disk crosses plenty of those, and one of them ending the walk would leave the
/// user with an error instead of the projects the walk had already found.
fn discover_projects(
    root: &Path,
    directory: &Path,
    depth: usize,
    projects: &mut Vec<WorkspaceProject>,
    skipped: &mut Skipped,
) -> Result<(), String> {
    if depth > MAX_DEPTH || projects.len() >= MAX_PROJECTS {
        return Ok(());
    }

    let is_project = directory.join(".git").is_dir();
    if is_project {
        projects.push(project_from_directory(directory, root));
        return Ok(());
    }

    let entries = match std::fs::read_dir(directory) {
        Ok(entries) => entries,
        Err(error) if depth == 0 => return Err(error.to_string()),
        Err(_) => {
            skipped.note(directory);
            return Ok(());
        }
    };
    for entry in entries {
        if projects.len() >= MAX_PROJECTS {
            break;
        }
        let Ok(entry) = entry else {
            skipped.note(directory);
            continue;
        };
        let path = entry.path();
        let Ok(file_type) = entry.file_type() else {
            skipped.note(&path);
            continue;
        };
        if !file_type.is_dir() {
            continue;
        }
        let Some(name) = path.file_name().and_then(|value| value.to_str()) else {
            continue;
        };
        if name.starts_with('.') || matches!(name, "node_modules" | "target" | "dist" | "build") {
            continue;
        }
        if path != root && looks_like_project(&path) {
            projects.push(project_from_directory(&path, root));
            continue;
        }
        discover_projects(root, &path, depth + 1, projects, skipped)?;
    }
    Ok(())
}

fn looks_like_project(directory: &Path) -> bool {
    directory.join(".git").is_dir()
        || [
            "package.json",
            "Cargo.toml",
            "pyproject.toml",
            "go.mod",
            "pom.xml",
        ]
        .iter()
        .any(|file| directory.join(file).is_file())
}

/// Points every clone of the same repository at its siblings.
///
/// Two paths holding the same remote is something no file manager can tell the
/// user, because the answer is not on disk — it is in what the repositories
/// claim to be.
fn mark_duplicates(projects: &mut [WorkspaceProject]) {
    let mut by_remote: std::collections::HashMap<String, Vec<String>> =
        std::collections::HashMap::new();
    for project in projects.iter() {
        // Grouped on the key, not on what is displayed: the same repository
        // cloned over SSH and over HTTPS is one repository.
        if let Some(remote) = &project.git.remote_key {
            by_remote
                .entry(remote.clone())
                .or_default()
                .push(project.path.clone());
        }
    }

    for project in projects.iter_mut() {
        let Some(remote) = &project.git.remote_key else {
            continue;
        };
        let Some(paths) = by_remote.get(remote) else {
            continue;
        };
        if paths.len() < 2 {
            continue;
        }
        project.duplicate_of = paths
            .iter()
            .filter(|path| *path != &project.path)
            .cloned()
            .collect();
    }
}

fn project_from_directory(path: &Path, root: &Path) -> WorkspaceProject {
    let git = git::read(path);
    let activity = activity_of(path, git.last_commit_at);
    let (install_missing, install_stale) = installation_state(path);

    WorkspaceProject {
        name: path
            .file_name()
            .map(|value| value.to_string_lossy().into_owned())
            .unwrap_or_else(|| "Workspace".to_string()),
        path: path.to_string_lossy().into_owned(),
        root: root.to_string_lossy().into_owned(),
        kind: project_kind(path),
        git,
        activity,
        duplicate_of: Vec::new(),
        install_missing,
        install_stale,
        restore: restore_for(path),
        // Filled once every project is known: belonging is a fact about the set,
        // not about the folder in front of the walker.
        family: None,
    }
}

/// How this project's dependencies come back.
///
/// The `packageManager` field is read only when a `package.json` is there to
/// hold it, so the common case costs one `is_file` per candidate and no reads
/// at all.
pub(crate) fn restore_for(path: &Path) -> Option<restore::Restore> {
    let declared = std::fs::read_to_string(path.join("package.json"))
        .ok()
        .and_then(|contents| {
            serde_json::from_str::<serde_json::Value>(&contents)
                .ok()?
                .get("packageManager")?
                .as_str()
                .map(str::to_owned)
        });

    restore::detect(&|name| path.join(name).is_file(), declared.as_deref())
}

/// Last activity, from the last commit or the newest source file.
///
/// Regenerable directories are excluded on purpose: a `node_modules` written by
/// yesterday's install says nothing about whether the project is alive, and
/// counting it would mark every abandoned project as active the moment someone
/// runs a build in it.
fn activity_of(path: &Path, last_commit_at: Option<i64>) -> Activity {
    let last_activity_at = [last_commit_at, newest_source_write(path)]
        .into_iter()
        .flatten()
        .max();
    let idle_days = last_activity_at.and_then(|at| {
        let now = SystemTime::now().duration_since(UNIX_EPOCH).ok()?.as_secs() as i64;
        u32::try_from((now - at).max(0) / 86_400).ok()
    });

    Activity {
        last_activity_at,
        idle_days,
        state: verdict::activity_state(idle_days),
    }
}

fn newest_source_write(path: &Path) -> Option<i64> {
    let entries = std::fs::read_dir(path).ok()?;
    entries
        .flatten()
        .filter(|entry| {
            entry
                .file_name()
                .to_str()
                .is_some_and(|name| !name.starts_with('.') && !is_regenerable(name))
        })
        .filter_map(|entry| entry.metadata().ok()?.modified().ok())
        .filter_map(|time| time.duration_since(UNIX_EPOCH).ok())
        .map(|since| since.as_secs() as i64)
        .max()
}

fn is_regenerable(name: &str) -> bool {
    matches!(
        name,
        "node_modules" | "target" | "dist" | "build" | "vendor" | "__pycache__" | "DerivedData"
    )
}

/// Whether the project has a lockfile without an installation behind it, and
/// whether that installation predates the lockfile.
fn installation_state(path: &Path) -> (bool, bool) {
    const PAIRS: &[(&str, &str)] = &[
        ("package-lock.json", "node_modules"),
        ("pnpm-lock.yaml", "node_modules"),
        ("yarn.lock", "node_modules"),
        ("bun.lockb", "node_modules"),
        ("Cargo.lock", "target"),
    ];

    for (lockfile, installed) in PAIRS {
        let lock = path.join(lockfile);
        if !lock.is_file() {
            continue;
        }
        let install = path.join(installed);
        if !install.is_dir() {
            return (true, false);
        }
        let newer = written_at(&lock)
            .zip(written_at(&install))
            .is_some_and(|(lock_at, install_at)| lock_at > install_at);
        return (false, newer);
    }
    (false, false)
}

fn written_at(path: &Path) -> Option<i64> {
    let modified = std::fs::metadata(path).ok()?.modified().ok()?;
    Some(modified.duration_since(UNIX_EPOCH).ok()?.as_secs() as i64)
}

/// What the project is written in, as the interface names it.
///
/// Also what decides which editor leads: a specialist opens the language it is
/// built for and sorts below every general-purpose editor otherwise. Swift is
/// here for exactly that — without it, Xcode's specialisation matches nothing
/// and it never leads even an iOS project.
fn project_kind(path: &Path) -> String {
    if path.join("Package.swift").is_file() || has_extension(path, "xcodeproj") {
        "Swift".to_string()
    } else if path.join("package.json").is_file() {
        "Node".to_string()
    } else if path.join("Cargo.toml").is_file() {
        "Rust".to_string()
    } else if path.join("pyproject.toml").is_file() {
        "Python".to_string()
    } else if path.join("go.mod").is_file() {
        "Go".to_string()
    } else if path.join("pom.xml").is_file() {
        "Java".to_string()
    } else {
        "Project".to_string()
    }
}

/// Measures one project. The caller runs these concurrently and stops asking to cancel.
#[tauri::command]
pub async fn measure_project_footprint(
    app: tauri::AppHandle,
    path: String,
) -> Result<Footprint, String> {
    let settings = crate::commands::settings::load_settings(&app).unwrap_or_default();
    tauri::async_runtime::spawn_blocking(move || measure_footprint(Path::new(&path), &settings))
        .await
        .map_err(|error| error.to_string())?
}

/// One project's inputs to the verdict, on its way across the boundary.
///
/// Every field was produced here — the recoverability by `git::read`, the
/// activity and the install flags by the index, the weight by
/// `measure_project_footprint`. The interface carries them back rather than
/// re-deriving any of them, the same arrangement `preview_maintenance` uses.
#[derive(serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Assessment {
    /// Echoed back untouched, so a batch of answers can be matched to the
    /// projects that asked without depending on the order surviving the wire.
    pub path: String,
    pub recoverability: verdict::RecoverabilityLevel,
    pub activity: ActivityState,
    pub reclaimable_bytes: u64,
    pub install_missing: bool,
    pub install_stale: bool,
}

/// The verdicts for a batch of projects, once their footprints are known.
///
/// Kept out of the index because the reclaimable figure is measured later:
/// deciding before it arrives would call every project Archivable.
///
/// Taken as a batch because weights arrive in groups and the answer is a pure
/// function of five scalars. One project at a time meant one round trip per
/// project — up to `MAX_PROJECTS` of them to run a function with no IO in it.
#[tauri::command]
pub async fn assess_projects(projects: Vec<Assessment>) -> Vec<(String, Verdict)> {
    projects
        .into_iter()
        .map(|project| {
            let verdict = verdict::assess(verdict::VerdictInput {
                recoverability: Some(project.recoverability),
                activity: project.activity,
                reclaimable_bytes: project.reclaimable_bytes,
                install_missing: project.install_missing,
                install_stale: project.install_stale,
            });
            (project.path, verdict)
        })
        .collect()
}

/// What a maintenance policy would select right now.
///
/// Every candidate field was produced here — the verdict by `assess_project`,
/// the weight by `measure_project_footprint`, the idle days by the index — so
/// this asks the interface to carry facts back rather than to re-derive them.
/// Reading is free: a policy nobody can see the result of is a control with no
/// operation behind it.
#[tauri::command]
pub async fn preview_maintenance(
    candidates: Vec<maintenance::Candidate>,
    policy: maintenance::MaintenancePolicy,
) -> maintenance::Preview {
    maintenance::select(&candidates, &policy)
}

/// The registered targets a run of this policy would remove.
///
/// The selection is made here, from the same function the preview uses, and the
/// interface never sends one: a caller that could name the projects could name
/// any project. What comes back are ids into the scan session's registry, so
/// the removal itself still goes through `clean_target`, which re-validates
/// every one of them.
///
/// Pro-gated because running unattended maintenance is the capability being
/// sold. Seeing what it would do is not.
#[tauri::command]
pub async fn maintenance_targets(
    candidates: Vec<maintenance::Candidate>,
    policy: maintenance::MaintenancePolicy,
) -> Result<Vec<String>, String> {
    if !crate::commands::entitlements::current_status().pro_enabled {
        return Err("Running maintenance requires Uncached Pro".to_string());
    }
    let selected: Vec<std::path::PathBuf> = maintenance::select(&candidates, &policy)
        .selected
        .into_iter()
        .map(|entry| std::path::PathBuf::from(entry.path))
        .collect();
    if selected.is_empty() {
        return Ok(Vec::new());
    }
    Ok(crate::services::scan_service::ScanService::targets_under(
        &selected,
    ))
}

/// Where the schedule stands: when it last ran, when it runs next, and what is
/// stopping it right now.
///
/// The interval comes back clamped and the next run comes back computed, rather
/// than the interface doing either. Neither is a decision about what may be
/// deleted, but both are answers the screen states as fact, and a screen that
/// derives them separately is a screen that can disagree with the thread.
#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ScheduleStatus {
    pub schedule: schedule::Schedule,
    /// The interval actually in force, which a hand-edited file can differ from.
    pub interval_hours: u32,
    pub last_run_at: Option<i64>,
    pub next_run_at: Option<i64>,
    /// Why a run would not start this minute, or `None` if one would.
    pub held: Option<schedule::Held>,
    pub min_every_hours: u32,
    pub max_every_hours: u32,
    /// Whether closing the window leaves the app running.
    ///
    /// Not a `Held` reason: the app is running right now, so a run would start.
    /// It decides whether there will be a *next* one — the schedule lives in
    /// this process, and with this off, closing the window ends the process and
    /// the schedule with it. A schedule switched on beside this switched off is
    /// the one combination the product can promise and not deliver, so it is
    /// reported rather than left for the user to discover by it not happening.
    pub keeps_running_in_background: bool,
}

#[tauri::command]
pub async fn maintenance_schedule_status(app: tauri::AppHandle) -> Result<ScheduleStatus, String> {
    let settings = crate::commands::settings::load_settings(&app)?;
    let stored = settings.maintenance_schedule;

    let held = match schedule::due(&schedule::Conditions {
        schedule: stored,
        pro_enabled: crate::commands::entitlements::current_status().pro_enabled,
        has_workspace: !settings.workspace_roots.is_empty(),
        scan_in_progress: crate::services::scan_service::ScanService::active_scan_count() > 0,
        last_run_at: settings.maintenance_last_run_at,
        now: chrono::Utc::now().timestamp(),
    }) {
        schedule::Due::Now => None,
        schedule::Due::Held(reason) => Some(reason),
    };

    Ok(ScheduleStatus {
        interval_hours: stored.interval_hours(),
        next_run_at: schedule::next_run_at(&stored, settings.maintenance_last_run_at),
        last_run_at: settings.maintenance_last_run_at,
        schedule: stored,
        held,
        min_every_hours: schedule::MIN_EVERY_HOURS,
        max_every_hours: schedule::MAX_EVERY_HOURS,
        keeps_running_in_background: settings.keep_running_in_background,
    })
}

/// Every project under these folders, reduced to what a policy reads.
///
/// The interface reaches the same answer by chaining `scan_workspace_index`,
/// `measure_project_footprint` and `assess_project` across a window's lifetime,
/// filling weights in a few at a time so the screen can report progress. A
/// scheduler has no screen and nobody to report to, so it walks the same three
/// steps here, in order, and blocks.
///
/// Measuring every project is the expensive part and there is no way around it:
/// the policy's whole question is which projects are large and cold, and a
/// project that was not weighed is unknown rather than small. That is why this
/// runs on a timer measured in days.
pub(crate) fn candidates_for(
    paths: &[String],
    settings: &crate::commands::settings::AppSettings,
) -> Result<Vec<maintenance::Candidate>, String> {
    let index = build_index(paths, crate::commands::entitlements::root_limit())?;

    Ok(index
        .projects
        .into_iter()
        .map(|project| {
            // A project whose footprint could not be read stays a candidate with
            // no weight, which the policy skips as `Unmeasured`. Dropping it here
            // would report the same refusal as a project that does not exist.
            let footprint = measure_footprint(Path::new(&project.path), settings).ok();
            let verdict = match footprint.as_ref() {
                Some(measured) => verdict::assess(verdict::VerdictInput {
                    recoverability: Some(project.git.recoverability.level),
                    activity: project.activity.state,
                    reclaimable_bytes: measured.reclaimable_bytes,
                    install_missing: project.install_missing,
                    install_stale: project.install_stale,
                }),
                None => Verdict::Unknown,
            };
            maintenance::Candidate {
                path: project.path,
                name: project.name,
                verdict,
                idle_days: project.activity.idle_days,
                reclaimable_bytes: footprint.map(|measured| measured.reclaimable_bytes),
            }
        })
        .collect())
}

/// Whether the directory holds anything with this extension.
///
/// A bundle rather than a file: `.xcodeproj` and `.xcworkspace` are directories.
fn has_extension(directory: &Path, extension: &str) -> bool {
    std::fs::read_dir(directory).is_ok_and(|entries| {
        entries.flatten().any(|entry| {
            entry
                .path()
                .extension()
                .is_some_and(|found| found.eq_ignore_ascii_case(extension))
        })
    })
}

fn measure_footprint(
    path: &Path,
    settings: &crate::commands::settings::AppSettings,
) -> Result<Footprint, String> {
    let total = crate::filesystem::size::calculate_dir_size_report(path);
    // Same providers and exclusions as the Purge, so reclaimable matches what cleanup takes.
    let providers = crate::scanner::get_default_providers(settings);
    let cancelled = AtomicBool::new(false);

    let mut targets = Vec::new();
    let outcome = uncached_core::traverse_workspace(path, &providers, &cancelled, |entry| {
        match entry.category.clone() {
            Some(category) => {
                targets.push((entry.path.clone(), category));
                uncached_core::TraversalControl::Prune
            }
            None => uncached_core::TraversalControl::Continue,
        }
    })
    .map_err(|error| error.to_string())?;

    // A walk that could not open every folder may have missed artifacts, so the
    // reclaimable figure is partial for the same reason a partial size is.
    let walk_incomplete = matches!(
        outcome,
        uncached_core::TraversalOutcome::Completed { unreadable } if unreadable > 0
    );

    let mut footprint = Footprint {
        total_bytes: total.bytes,
        has_errors: total.errors > 0 || walk_incomplete,
        ..Footprint::default()
    };
    let mut by_category: Vec<(String, u64)> = Vec::new();

    for (target_path, category) in targets {
        let size = crate::filesystem::size::calculate_dir_size_report(&target_path);
        footprint.has_errors = footprint.has_errors || size.errors > 0;
        footprint.reclaimable_bytes = footprint.reclaimable_bytes.saturating_add(size.bytes);
        let wire = category.as_wire();
        match by_category.iter_mut().find(|(name, _)| name == &wire) {
            Some((_, bytes)) => *bytes = bytes.saturating_add(size.bytes),
            None => by_category.push((wire, size.bytes)),
        }
    }

    // Saturating: the two sizing passes disagree if a file vanishes between them.
    footprint.source_bytes = footprint
        .total_bytes
        .saturating_sub(footprint.reclaimable_bytes);
    by_category.sort_by_key(|(_, bytes)| std::cmp::Reverse(*bytes));
    footprint.by_category = by_category
        .into_iter()
        .map(|(category, bytes)| CategoryBytes { category, bytes })
        .collect();

    Ok(footprint)
}

#[cfg(test)]
mod tests {
    use super::build_index;
    use std::fs;

    #[test]
    fn discovers_project_and_ignores_regenerable_directories() {
        let root = std::env::temp_dir().join(format!("uncached-workspace-{}", std::process::id()));
        let project = root.join("app");
        fs::create_dir_all(project.join(".git")).unwrap();
        fs::create_dir_all(project.join("node_modules")).unwrap();
        fs::create_dir_all(root.join("node_modules").join("nested")).unwrap();
        fs::write(project.join("package.json"), b"{}").unwrap();

        let index = index_of(&[&root]);
        assert_eq!(index.projects.len(), 1);
        assert_eq!(index.projects[0].name, "app");
        assert_eq!(index.projects[0].kind, "Node");

        let _ = fs::remove_dir_all(root);
    }

    fn index_of(roots: &[&std::path::Path]) -> super::WorkspaceIndex {
        let paths = roots
            .iter()
            .map(|root| root.to_string_lossy().into_owned())
            .collect::<Vec<_>>();
        build_index(&paths, 12).unwrap()
    }

    fn workspace(name: &str, projects: &[&str]) -> std::path::PathBuf {
        let root =
            std::env::temp_dir().join(format!("uncached-roots-{}-{name}", std::process::id()));
        let _ = fs::remove_dir_all(&root);
        for project in projects {
            fs::create_dir_all(root.join(project).join(".git")).unwrap();
            fs::write(root.join(project).join("package.json"), b"{}").unwrap();
        }
        root
    }

    #[test]
    fn several_roots_index_into_one_list_that_remembers_where_each_came_from() {
        let personal = workspace("personal", &["blog"]);
        let work = workspace("work", &["api"]);

        let index = index_of(&[&personal, &work]);

        assert_eq!(index.roots.len(), 2);
        assert_eq!(index.projects.len(), 2);
        let blog = index
            .projects
            .iter()
            .find(|project| project.name == "blog")
            .expect("the personal project should be indexed");
        assert!(blog.root.ends_with("personal"), "root was {}", blog.root);
        assert!(index.roots_over_limit.is_empty());

        let _ = fs::remove_dir_all(personal);
        let _ = fs::remove_dir_all(work);
    }

    #[test]
    fn a_root_beyond_the_limit_is_named_rather_than_dropped() {
        let personal = workspace("limit-personal", &["blog"]);
        let work = workspace("limit-work", &["api"]);
        let paths = [
            personal.to_string_lossy().into_owned(),
            work.to_string_lossy().into_owned(),
        ];

        let index = build_index(&paths, 1).unwrap();

        assert_eq!(index.roots.len(), 1);
        assert_eq!(index.projects.len(), 1);
        assert_eq!(index.projects[0].name, "blog");
        assert_eq!(
            index.roots_over_limit,
            vec![work.canonicalize().unwrap().to_string_lossy().into_owned()]
        );
        assert_eq!(index.root_limit, 1);

        let _ = fs::remove_dir_all(personal);
        let _ = fs::remove_dir_all(work);
    }

    #[test]
    fn a_footprint_separates_the_work_from_what_can_be_put_back() {
        let root = std::env::temp_dir().join(format!("uncached-footprint-{}", std::process::id()));
        let _ = fs::remove_dir_all(&root);
        fs::create_dir_all(root.join("node_modules/pkg")).unwrap();
        fs::create_dir_all(root.join("src")).unwrap();
        fs::write(root.join("package.json"), b"{}").unwrap();
        fs::write(root.join("src/index.js"), vec![b'a'; 100]).unwrap();
        fs::write(root.join("node_modules/pkg/index.js"), vec![b'b'; 900]).unwrap();

        let settings = crate::commands::settings::AppSettings::default();
        let footprint = super::measure_footprint(&root, &settings).unwrap();

        assert!(footprint.reclaimable_bytes >= 900);
        assert_eq!(
            footprint.source_bytes,
            footprint.total_bytes - footprint.reclaimable_bytes
        );
        assert!(footprint.source_bytes < footprint.reclaimable_bytes);
        assert_eq!(footprint.by_category.len(), 1);
        assert_eq!(footprint.by_category[0].category, "NodeModules");

        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn a_footprint_does_not_count_what_an_ignore_rule_protects() {
        let root =
            std::env::temp_dir().join(format!("uncached-footprint-ignored-{}", std::process::id()));
        let _ = fs::remove_dir_all(&root);
        fs::create_dir_all(root.join("node_modules/pkg")).unwrap();
        fs::write(root.join("package.json"), b"{}").unwrap();
        fs::write(root.join("node_modules/pkg/index.js"), vec![b'b'; 900]).unwrap();

        let settings = crate::commands::settings::AppSettings {
            ignore_rules: root.join("node_modules").to_string_lossy().into_owned(),
            ..crate::commands::settings::AppSettings::default()
        };
        let footprint = super::measure_footprint(&root, &settings).unwrap();

        assert_eq!(footprint.reclaimable_bytes, 0);
        assert!(footprint.by_category.is_empty());
        assert_eq!(footprint.source_bytes, footprint.total_bytes);

        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn a_root_nested_in_another_is_replaced_without_duplicating_its_projects() {
        let outer = workspace("nested-outer", &["api"]);
        let inner = outer.join("api");
        let paths = [
            outer.to_string_lossy().into_owned(),
            inner.to_string_lossy().into_owned(),
        ];

        let index = build_index(&paths, 12).unwrap();

        assert_eq!(index.roots.len(), 1);
        assert_eq!(index.projects.len(), 1);
        assert!(index.roots_over_limit.is_empty());

        let _ = fs::remove_dir_all(outer);
    }

    /// An install run yesterday says nothing about whether a project is alive.
    /// Counting it would mark every abandoned project active the moment a build
    /// touched it, which is the failure the age heuristic exists to avoid.
    #[test]
    fn a_regenerable_directory_does_not_make_a_project_look_active() {
        let root = std::env::temp_dir().join(format!("uncached-activity-{}", std::process::id()));
        let _ = fs::remove_dir_all(&root);
        fs::create_dir_all(root.join("node_modules/pkg")).unwrap();
        fs::write(root.join("node_modules/pkg/index.js"), b"fresh").unwrap();

        assert!(
            super::newest_source_write(&root).is_none(),
            "only regenerable content exists, so there is no source activity"
        );

        fs::write(root.join("index.js"), b"source").unwrap();
        assert!(super::newest_source_write(&root).is_some());

        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn a_lockfile_without_an_installation_reads_as_broken_and_never_as_stale() {
        let root = std::env::temp_dir().join(format!("uncached-install-{}", std::process::id()));
        let _ = fs::remove_dir_all(&root);
        fs::create_dir_all(&root).unwrap();
        fs::write(root.join("package-lock.json"), b"{}").unwrap();

        assert_eq!(super::installation_state(&root), (true, false));

        fs::create_dir_all(root.join("node_modules")).unwrap();
        let (missing, _) = super::installation_state(&root);
        assert!(!missing);

        let _ = fs::remove_dir_all(root);
    }

    /// The same repository in two folders is something no file manager can
    /// report, because the answer is not on disk.
    #[test]
    fn clones_of_one_repository_point_at_each_other() {
        // Spelled differently on purpose: one clone over SSH and one over
        // HTTPS is one repository, and the display string no longer says so.
        let mut projects = vec![
            project_named("first", Some("git@github.com:acme/app.git")),
            project_named("second", Some("https://github.com/acme/app")),
            project_named("other", Some("https://github.com/acme/other")),
            project_named("local", None),
        ];

        super::mark_duplicates(&mut projects);

        assert_eq!(projects[0].duplicate_of, vec!["second".to_string()]);
        assert_eq!(projects[1].duplicate_of, vec!["first".to_string()]);
        assert!(projects[2].duplicate_of.is_empty());
        assert!(projects[3].duplicate_of.is_empty());
    }

    fn project_named(path: &str, remote: Option<&str>) -> super::WorkspaceProject {
        super::WorkspaceProject {
            name: path.to_string(),
            path: path.to_string(),
            root: "/root".to_string(),
            kind: "Node".to_string(),
            git: crate::workspace::git::GitContext {
                remote: remote.map(str::to_string),
                remote_key: remote.map(crate::workspace::git::normalise_remote),
                ..Default::default()
            },
            activity: super::Activity {
                last_activity_at: None,
                idle_days: None,
                state: crate::workspace::verdict::ActivityState::Unknown,
            },
            duplicate_of: Vec::new(),
            install_missing: false,
            install_stale: false,
            restore: None,
            family: None,
        }
    }

    /// The half of `restore_for` the pure module cannot reach: reading
    /// `packageManager` out of a real manifest, and surviving one that is not
    /// JSON at all.
    #[test]
    fn the_declared_manager_is_read_from_the_manifest_on_disk() {
        let root = std::env::temp_dir().join(format!("uncached-restore-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&root);
        std::fs::create_dir_all(&root).unwrap();

        std::fs::write(
            root.join("package.json"),
            r#"{"packageManager":"pnpm@9.1.0"}"#,
        )
        .unwrap();
        std::fs::write(root.join("package-lock.json"), "{}").unwrap();
        let found = super::restore_for(&root).expect("a Node project");
        assert_eq!(found.manager, "pnpm", "the manifest names the tool");
        assert_eq!(found.pinned_by.as_deref(), Some("package-lock.json"));

        // A manifest with no declaration falls back to the lockfile's own tool.
        std::fs::write(root.join("package.json"), r#"{"name":"x"}"#).unwrap();
        assert_eq!(super::restore_for(&root).unwrap().manager, "npm");

        // A manifest that will not parse is still a Node project.
        std::fs::write(root.join("package.json"), "not json").unwrap();
        assert_eq!(super::restore_for(&root).unwrap().manager, "npm");

        let _ = std::fs::remove_dir_all(root);
    }

    /// Each answer has to carry the path that asked for it. Zipping a reply
    /// against the request by position is correct until something reorders it,
    /// and a verdict attached to the wrong project is the one mistake the
    /// workspace map must not make.
    #[test]
    fn a_batch_of_verdicts_comes_back_paired_with_the_projects_that_asked() {
        use crate::workspace::verdict::{ActivityState, RecoverabilityLevel, Verdict};

        let assessment = |path: &str, level, activity, bytes| super::Assessment {
            path: path.to_owned(),
            recoverability: level,
            activity,
            reclaimable_bytes: bytes,
            install_missing: false,
            install_stale: false,
        };

        let answers = tauri::async_runtime::block_on(super::assess_projects(vec![
            assessment(
                "/w/cold",
                RecoverabilityLevel::FullyRemote,
                ActivityState::Cold,
                9_000,
            ),
            assessment(
                "/w/risky",
                RecoverabilityLevel::LocalOnlyWork,
                ActivityState::Active,
                9_000,
            ),
        ]));

        let by_path: std::collections::HashMap<_, _> = answers.into_iter().collect();
        assert_eq!(by_path["/w/cold"], Verdict::Safe);
        assert_eq!(
            by_path["/w/risky"],
            Verdict::Protect,
            "work that exists nowhere else is answered first, whatever its weight"
        );
    }

    #[test]
    fn an_empty_batch_is_an_empty_answer_rather_than_an_error() {
        let answers = tauri::async_runtime::block_on(super::assess_projects(Vec::new()));
        assert!(answers.is_empty());
    }

    #[test]
    fn indexing_nothing_is_an_error_rather_than_an_empty_map() {
        assert!(build_index(&[], 1).is_err());
    }

    /// Whole-disk scans cross folders the operating system withholds. Failing
    /// there would hand the user an error in place of the projects already
    /// found, which is what a permission-denied scan used to do.
    #[cfg(unix)]
    #[test]
    fn a_folder_that_cannot_be_opened_is_counted_rather_than_ending_the_index() {
        use std::os::unix::fs::PermissionsExt;

        let root = workspace("unreadable", &["visible"]);
        let locked = root.join("locked");
        fs::create_dir_all(&locked).unwrap();
        fs::set_permissions(&locked, fs::Permissions::from_mode(0o000)).unwrap();

        let index = index_of(&[&root]);

        assert_eq!(index.projects.len(), 1);
        assert_eq!(index.projects[0].name, "visible");
        assert_eq!(index.unreadable, 1);
        assert_eq!(index.unreadable_sample.len(), 1);
        assert!(index.unreadable_sample[0].ends_with("locked"));

        fs::set_permissions(&locked, fs::Permissions::from_mode(0o755)).unwrap();
        let _ = fs::remove_dir_all(root);
    }

    /// The folder the user picked is the one case worth reporting: an index of
    /// nothing, with no reason given, is not an answer.
    #[cfg(unix)]
    #[test]
    fn a_chosen_root_that_cannot_be_opened_still_fails() {
        use std::os::unix::fs::PermissionsExt;

        let root =
            std::env::temp_dir().join(format!("uncached-unreadable-root-{}", std::process::id()));
        let _ = fs::remove_dir_all(&root);
        fs::create_dir_all(&root).unwrap();
        fs::set_permissions(&root, fs::Permissions::from_mode(0o000)).unwrap();

        let paths = [root.to_string_lossy().into_owned()];
        let failure = build_index(&paths, 12);

        fs::set_permissions(&root, fs::Permissions::from_mode(0o755)).unwrap();
        assert!(failure.is_err());
        let _ = fs::remove_dir_all(root);
    }
}
