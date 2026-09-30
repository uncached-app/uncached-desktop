//! What the disk holds, beside what the scan found.
//!
//! A scan can only account for what it was allowed to read. On a Mac that is a
//! fraction of the boot volume: the system withholds directories from every
//! process without Full Disk Access, and holds further space back as purgeable
//! until something needs it. Reporting a cleanup total against nothing is how
//! somebody ends up believing the caches are the reason the disk is full.

use crate::filesystem::volume::{report_for, VolumeReport};
use serde::Serialize;
use std::path::PathBuf;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct StorageReport {
    /// Where the volume was read, for the screen to name it.
    pub path: String,
    pub total_bytes: u64,
    pub free_bytes: u64,
    pub used_bytes: u64,
    pub purgeable_bytes: Option<u64>,
    /// Whether this process can read the whole volume.
    ///
    /// macOS withholds directories under TCC from a process without Full Disk
    /// Access, and answers with a permission error rather than an empty
    /// listing. Off macOS there is nothing equivalent to ask about.
    pub full_disk_access: Option<bool>,
}

/// The volume the user's home directory lives on.
#[tauri::command]
pub async fn storage_report() -> Option<StorageReport> {
    let home = uncached_core::home_directory()?;
    let report = report_for(&home)?;
    Some(build(home, report))
}

fn build(path: PathBuf, report: VolumeReport) -> StorageReport {
    StorageReport {
        path: path.to_string_lossy().into_owned(),
        total_bytes: report.total_bytes,
        free_bytes: report.free_bytes,
        used_bytes: report.used_bytes(),
        purgeable_bytes: report.purgeable_bytes,
        full_disk_access: full_disk_access(),
    }
}

/// Reads a directory the system only hands to a process holding Full Disk
/// Access, and reports whether it was allowed.
///
/// `~/Library/Application Support/com.apple.TCC` is the canonical probe: it
/// exists on every Mac and is readable under no other permission. A missing
/// directory answers nothing rather than answering no.
#[cfg(target_os = "macos")]
pub(crate) fn full_disk_access() -> Option<bool> {
    let home = uncached_core::home_directory()?;
    let probe = home.join("Library/Application Support/com.apple.TCC");
    if !probe.exists() {
        return None;
    }
    Some(std::fs::read_dir(&probe).is_ok())
}

#[cfg(not(target_os = "macos"))]
pub(crate) fn full_disk_access() -> Option<bool> {
    None
}

/// Opens the system's Full Disk Access list.
///
/// A fixed URL handed to the platform opener, never a path from the window:
/// the one thing this command can do is show that pane. macOS is the only
/// system with the permission, so it is the only one where this does anything.
#[tauri::command]
pub async fn open_full_disk_access() -> bool {
    #[cfg(target_os = "macos")]
    {
        const PANE: &str =
            "x-apple.systempreferences:com.apple.preference.security?Privacy_AllFiles";
        crate::process::quiet("open").arg(PANE).status().is_ok()
    }
    #[cfg(not(target_os = "macos"))]
    false
}

#[cfg(test)]
mod tests {
    use super::{build, StorageReport};
    use crate::filesystem::volume::VolumeReport;
    use std::path::PathBuf;

    fn report(total: u64, free: u64, purgeable: Option<u64>) -> StorageReport {
        build(
            PathBuf::from("/Users/dev"),
            VolumeReport {
                total_bytes: total,
                free_bytes: free,
                purgeable_bytes: purgeable,
            },
        )
    }

    /// Used is derived here rather than in the interface, so the three figures
    /// on screen cannot disagree about the same volume.
    #[test]
    fn used_is_what_the_volume_holds_that_is_not_free() {
        let report = report(1_000, 400, Some(50));

        assert_eq!(report.used_bytes, 600);
        assert_eq!(report.purgeable_bytes, Some(50));
        assert_eq!(report.path, "/Users/dev");
    }

    /// Purgeable space is already counted as used, so it is reported beside
    /// that figure and never added to it.
    #[test]
    fn purgeable_space_is_not_added_to_what_is_free() {
        let report = report(1_000, 400, Some(300));

        assert_eq!(report.free_bytes + report.used_bytes, report.total_bytes);
    }
}
