use crate::cleaner::{CleanReport, Cleaner};
use crate::errors::{NukeError, NukeResult};
use crate::filesystem::paths::{canonicalize_target, normalize_win_path};
use crate::filesystem::permissions::ensure_writable;
use crate::filesystem::size::calculate_dir_size_report;
use std::fs;
use std::path::Path;

pub struct PermanentCleaner;

impl Cleaner for PermanentCleaner {
    fn clean(&self, target_path: &Path) -> NukeResult<CleanReport> {
        let canonical_path = canonicalize_target(target_path)?;
        let normalized_path = normalize_win_path(&canonical_path);
        let size_report = calculate_dir_size_report(&normalized_path);

        // Step 1: Remove read-only attributes
        ensure_writable(&normalized_path)?;

        // Step 2: Perform directory removal
        match fs::remove_dir_all(&normalized_path) {
            Ok(_) => Ok(CleanReport {
                freed_bytes: size_report.bytes,
                size_has_errors: size_report.errors > 0,
            }),
            Err(err) => Err(NukeError::Io(err)),
        }
    }
}
