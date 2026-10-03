//! The projects an unattended maintenance run chooses among.

use super::footprint::measure_footprint;
use super::index;
use super::maintenance;
use super::verdict::{self, Verdict};
use std::path::Path;

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
    let index = index::build_index(paths, crate::entitlements::root_limit())
        .map_err(|error| error.to_string())?;

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
