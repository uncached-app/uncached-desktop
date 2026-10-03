use crate::errors::command::CommandError;
use crate::workspace::index::{self, IndexError, WorkspaceIndex};
use crate::workspace::maintenance;
use crate::workspace::running;
use crate::workspace::schedule;
use crate::workspace::verdict::{self, ActivityState, Verdict};
use serde::Serialize;
use std::path::{Path, PathBuf};
use std::sync::atomic::AtomicBool;

/// What the interface is told when an index cannot be built. The codes and the
/// wording are the contract with the screen, and live here with the commands.
impl From<IndexError> for CommandError {
    fn from(error: IndexError) -> Self {
        match error {
            IndexError::NoFolderSelected => {
                CommandError::new("no_folder_selected", "Select at least one folder")
            }
            IndexError::FolderUnreadable { detail } => CommandError::new(
                "folder_unreadable",
                format!("Cannot open workspace: {detail}"),
            )
            .with("detail", detail),
            IndexError::NotAFolder => {
                CommandError::new("not_a_folder", "Workspace path is not a directory")
            }
            IndexError::Discovery(message) => CommandError::from(message),
        }
    }
}

/// The index, with its failure told in the interface's terms.
fn build_index(paths: &[String], limit: usize) -> Result<WorkspaceIndex, CommandError> {
    index::build_index(paths, limit).map_err(CommandError::from)
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
pub async fn scan_workspace_index(paths: Vec<String>) -> Result<WorkspaceIndex, CommandError> {
    let limit = crate::entitlements::root_limit();
    tauri::async_runtime::spawn_blocking(move || build_index(&paths, limit))
        .await
        .map_err(|error| CommandError::from(error.to_string()))?
}

/// Measures one project. The caller runs these concurrently and stops asking to cancel.
#[tauri::command]
pub async fn measure_project_footprint(
    app: tauri::AppHandle,
    path: String,
) -> Result<Footprint, String> {
    let settings = crate::settings::load_settings(&app).unwrap_or_default();
    tauri::async_runtime::spawn_blocking(move || measure_footprint(Path::new(&path), &settings))
        .await
        .map_err(|error| error.to_string())?
}

/// Which of these projects has a process working inside it right now.
///
/// One listing answers for the whole workspace, so this is asked for the batch
/// rather than per project. Re-asked whenever the workspace is read again: a
/// dev server started a minute ago is exactly the case this exists for.
#[tauri::command]
pub async fn running_projects(paths: Vec<String>) -> Result<Vec<running::RunningProject>, String> {
    let projects: Vec<PathBuf> = paths.into_iter().map(PathBuf::from).collect();
    tauri::async_runtime::spawn_blocking(move || running::running_projects(&projects))
        .await
        .map_err(|error| error.to_string())
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
) -> Result<Vec<String>, CommandError> {
    if !crate::entitlements::current_status().pro_enabled {
        return Err(CommandError::new(
            "requires_pro",
            "Running maintenance requires Uncached Pro",
        ));
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
    /// Least free space across the workspace's volumes, the figure the
    /// low-space trigger compares against.
    pub free_bytes: Option<u64>,
}

#[tauri::command]
pub async fn maintenance_schedule_status(app: tauri::AppHandle) -> Result<ScheduleStatus, String> {
    // Off the async runtime: asking a volume how much room it has can stall for
    // seconds when a workspace root is on a network share that went away, and
    // an async command waiting on that holds a runtime thread the whole time.
    tauri::async_runtime::spawn_blocking(move || schedule_status(&app))
        .await
        .map_err(|error| error.to_string())?
}

fn schedule_status(app: &tauri::AppHandle) -> Result<ScheduleStatus, String> {
    let settings = crate::settings::load_settings(app)?;
    let stored = settings.maintenance_schedule;
    let free_bytes = crate::scheduler::least_free_bytes(&settings.workspace_roots);

    let held = match schedule::due(&schedule::Conditions {
        schedule: stored,
        pro_enabled: crate::entitlements::current_status().pro_enabled,
        has_workspace: !settings.workspace_roots.is_empty(),
        scan_in_progress: crate::services::scan_service::ScanService::active_scan_count() > 0,
        last_run_at: settings.maintenance_last_run_at,
        now: chrono::Utc::now().timestamp(),
        free_bytes,
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
        free_bytes,
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
    settings: &crate::settings::AppSettings,
) -> Result<Vec<maintenance::Candidate>, String> {
    let index = build_index(paths, crate::entitlements::root_limit())
        .map_err(|error| error.message)?;

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

fn measure_footprint(
    path: &Path,
    settings: &crate::settings::AppSettings,
) -> Result<Footprint, String> {
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
        has_errors: walk_incomplete,
        ..Footprint::default()
    };
    let mut by_category: Vec<(String, u64)> = Vec::new();
    let artifact_paths: Vec<std::path::PathBuf> =
        targets.iter().map(|(path, _)| path.clone()).collect();

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

    // The rest of the project, without descending into anything already
    // measured above. The artifacts are most of a project's files — 355 source
    // files against 17,880 artifact ones in this very repository — and sizing
    // the whole tree and then each artifact again walked those twice. On a warm
    // macOS cache the difference is milliseconds; on Windows, where a real-time
    // scanner inspects every file as it is opened, it is the difference between
    // seconds and minutes.
    //
    // From the canonical root, because that is the spelling the traversal
    // returned the artifact paths in — `/var` resolves to `/private/var` on
    // macOS, and comparing one against the other matches nothing, so every
    // artifact would be walked again and counted twice. The test caught exactly
    // that.
    let source = uncached_core::filesystem::directory_size_report_skipping(
        &uncached_core::filesystem::canonical(path).unwrap_or_else(|_| path.to_path_buf()),
        &artifact_paths,
        &cancelled,
    )
    .map(|report| report.unwrap_or_default())
    .unwrap_or_default();

    footprint.source_bytes = source.bytes;
    footprint.has_errors = footprint.has_errors || source.errors > 0;
    // Added rather than subtracted. Taking reclaimable off a separately measured
    // total meant two passes disagreeing whenever a file moved between them, and
    // a saturating subtraction hid that as a zero.
    footprint.total_bytes = source.bytes.saturating_add(footprint.reclaimable_bytes);
    by_category.sort_by_key(|(_, bytes)| std::cmp::Reverse(*bytes));
    footprint.by_category = by_category
        .into_iter()
        .map(|(category, bytes)| CategoryBytes { category, bytes })
        .collect();

    Ok(footprint)
}

#[cfg(test)]
mod tests {

    use super::{build_index, IndexError};
    use crate::errors::command::CommandError;
    use std::fs;

    /// The codes and wording the screen switches on and shows were decided when
    /// the index spoke `CommandError` itself. Moving the index out of the
    /// command layer must not change a character of them.
    #[test]
    fn an_index_failure_reaches_the_interface_with_the_same_code_and_words() {
        let none = CommandError::from(IndexError::NoFolderSelected);
        assert_eq!(none.code, "no_folder_selected");
        assert_eq!(none.message, "Select at least one folder");
        assert!(none.params.is_empty());

        let unreadable = CommandError::from(IndexError::FolderUnreadable {
            detail: "Permission denied (os error 13)".into(),
        });
        assert_eq!(unreadable.code, "folder_unreadable");
        assert_eq!(
            unreadable.message,
            "Cannot open workspace: Permission denied (os error 13)"
        );
        assert_eq!(
            unreadable.params.get("detail").map(String::as_str),
            Some("Permission denied (os error 13)")
        );

        let not_a_folder = CommandError::from(IndexError::NotAFolder);
        assert_eq!(not_a_folder.code, "not_a_folder");
        assert_eq!(not_a_folder.message, "Workspace path is not a directory");

        let other = CommandError::from(IndexError::Discovery("disk on fire".into()));
        assert_eq!(other, CommandError::from("disk on fire".to_string()));
    }

    /// The same failures, reached through the command's own entry point.
    #[test]
    fn the_command_tells_a_missing_folder_and_a_plain_file_apart() {
        let root =
            std::env::temp_dir().join(format!("uncached-index-errors-{}", std::process::id()));
        let _ = fs::remove_dir_all(&root);
        fs::create_dir_all(&root).unwrap();
        let file = root.join("not-a-folder.txt");
        fs::write(&file, b"x").unwrap();

        let missing = build_index(&[root.join("nope").to_string_lossy().into_owned()], 12);
        assert_eq!(missing.unwrap_err().code, "folder_unreadable");
        let plain_file = build_index(&[file.to_string_lossy().into_owned()], 12);
        assert_eq!(plain_file.unwrap_err().code, "not_a_folder");
        assert_eq!(build_index(&[], 12).unwrap_err().code, "no_folder_selected");

        let _ = fs::remove_dir_all(&root);
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

        let settings = crate::settings::AppSettings::default();
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

        let settings = crate::settings::AppSettings {
            ignore_rules: root.join("node_modules").to_string_lossy().into_owned(),
            ..crate::settings::AppSettings::default()
        };
        let footprint = super::measure_footprint(&root, &settings).unwrap();

        assert_eq!(footprint.reclaimable_bytes, 0);
        assert!(footprint.by_category.is_empty());
        assert_eq!(footprint.source_bytes, footprint.total_bytes);

        let _ = fs::remove_dir_all(root);
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
}
