use crate::cleaner::{CleanReport, Cleaner};
use crate::errors::{NukeError, NukeResult};
use crate::filesystem::paths::canonicalize_target;
use crate::filesystem::size::calculate_dir_size_report;
use std::path::Path;

pub struct TrashCleaner;

impl Cleaner for TrashCleaner {
    fn clean(&self, target_path: &Path) -> NukeResult<CleanReport> {
        let target_path = canonicalize_target(target_path)?;
        let size_report = calculate_dir_size_report(&target_path);

        match trash::delete(&target_path) {
            Ok(_) => Ok(CleanReport {
                freed_bytes: size_report.bytes,
                size_has_errors: size_report.errors > 0,
            }),
            Err(err) => {
                let err_msg = err.to_string();
                if err_msg.to_lowercase().contains("too large")
                    || err_msg.to_lowercase().contains("lixeira")
                {
                    Err(NukeError::RecycleBinTooLarge)
                } else {
                    Err(NukeError::Trash(err_msg))
                }
            }
        }
    }
}
