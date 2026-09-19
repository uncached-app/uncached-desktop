//! What the disk under a path actually holds.
//!
//! The scan can only ever account for what it was allowed to read, and on a
//! Mac that is a fraction of a full boot volume. A figure from the filesystem
//! itself is the only honest frame for the one the scan produces.

use serde::Serialize;
use std::path::Path;

#[derive(Debug, Clone, Copy, Default, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct VolumeReport {
    pub total_bytes: u64,
    /// What the filesystem will hand out right now.
    pub free_bytes: u64,
    /// Space macOS is holding but would release under pressure: local snapshots,
    /// cached downloads, anything it can fetch again.
    ///
    /// `None` off macOS, and `None` when the platform declines to answer. It is
    /// the difference between what the system offers for an important write and
    /// what it calls free, so it is never negative and never counted twice.
    pub purgeable_bytes: Option<u64>,
}

impl VolumeReport {
    pub fn used_bytes(&self) -> u64 {
        self.total_bytes.saturating_sub(self.free_bytes)
    }
}

/// Reads the volume holding `path`.
pub fn report_for(path: &Path) -> Option<VolumeReport> {
    let (total_bytes, free_bytes) = capacity(path)?;
    Some(VolumeReport {
        total_bytes,
        free_bytes,
        purgeable_bytes: purgeable(path, free_bytes),
    })
}

#[cfg(unix)]
fn capacity(path: &Path) -> Option<(u64, u64)> {
    use std::ffi::CString;
    use std::os::unix::ffi::OsStrExt;

    let path = CString::new(path.as_os_str().as_bytes()).ok()?;
    let mut stats: libc::statvfs = unsafe { std::mem::zeroed() };
    // SAFETY: `path` is a NUL-terminated C string that outlives the call, and
    // `stats` is a live, correctly sized buffer.
    if unsafe { libc::statvfs(path.as_ptr(), &mut stats) } != 0 {
        return None;
    }
    // `f_bavail` rather than `f_bfree`: the reserve a filesystem keeps for root
    // is not space this user can write into, and reporting it as free would
    // promise a cleanup gain that never arrives.
    let block = stats.f_frsize as u64;
    Some((stats.f_blocks as u64 * block, stats.f_bavail as u64 * block))
}

#[cfg(windows)]
fn capacity(path: &Path) -> Option<(u64, u64)> {
    use std::os::windows::ffi::OsStrExt;
    use windows_sys::Win32::Storage::FileSystem::GetDiskFreeSpaceExW;

    let mut wide: Vec<u16> = path.as_os_str().encode_wide().collect();
    wide.push(0);
    let mut free_to_caller = 0u64;
    let mut total = 0u64;
    let mut free = 0u64;
    // SAFETY: `wide` is NUL-terminated and the three outputs are live u64s.
    let ok =
        unsafe { GetDiskFreeSpaceExW(wide.as_ptr(), &mut free_to_caller, &mut total, &mut free) };
    if ok == 0 {
        return None;
    }
    // The caller's quota, not the volume's free space: on a disk with quotas
    // the second figure is one this user cannot actually use.
    Some((total, free_to_caller))
}

/// macOS holds space back and reports it as used until something needs it.
///
/// The system's own answer for "how much could I really write" is the
/// important-usage capacity, which includes what it would purge. The
/// difference between that and plain free space is the purgeable amount, and
/// it is the reason a Mac reports tens of gigabytes of storage that no walk of
/// the filesystem can find.
#[cfg(target_os = "macos")]
fn purgeable(path: &Path, free_bytes: u64) -> Option<u64> {
    use objc2_foundation::{
        NSArray, NSNumber, NSString, NSURLVolumeAvailableCapacityForImportantUsageKey, NSURL,
    };

    let path = NSString::from_str(path.to_str()?);
    let url = NSURL::fileURLWithPath(&path);
    // SAFETY: the key is a Foundation constant, and every object below is
    // owned by this scope.
    let important = unsafe {
        let key = NSURLVolumeAvailableCapacityForImportantUsageKey;
        let keys = NSArray::from_slice(&[key]);
        let values = url.resourceValuesForKeys_error(&keys).ok()?;
        let value = values.objectForKey(key)?;
        value.downcast::<NSNumber>().ok()?.longLongValue()
    };
    let important = u64::try_from(important).ok()?;
    Some(important.saturating_sub(free_bytes))
}

#[cfg(not(target_os = "macos"))]
fn purgeable(_path: &Path, _free_bytes: u64) -> Option<u64> {
    None
}

#[cfg(test)]
mod tests {
    use super::report_for;

    /// The figures have to agree with each other before they are worth showing
    /// beside a scan's total.
    #[test]
    fn a_volume_reports_a_total_its_free_space_fits_inside() {
        let report = report_for(&std::env::temp_dir()).expect("the temp volume should be readable");

        assert!(report.total_bytes > 0, "a mounted volume has a size");
        assert!(report.free_bytes <= report.total_bytes);
        assert_eq!(
            report.used_bytes(),
            report.total_bytes - report.free_bytes,
            "used is what is left when free is taken from the total"
        );
    }

    #[test]
    fn a_path_that_is_not_mounted_has_no_report() {
        assert!(report_for(std::path::Path::new("/uncached-no-such-volume/x")).is_none());
    }
}
