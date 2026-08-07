pub mod permanent;
pub mod windows;

use crate::errors::NukeResult;
use std::path::Path;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct CleanReport {
    pub freed_bytes: u64,
    pub size_has_errors: bool,
}

pub trait Cleaner: Send + Sync {
    /// Cleans/deletes the specified target path.
    /// Returns freed bytes and whether size calculation was partial.
    fn clean(&self, target_path: &Path) -> NukeResult<CleanReport>;
}
