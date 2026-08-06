use crate::errors::NukeResult;
use crate::filesystem::permissions::ensure_writable;
use std::path::Path;

pub struct WindowsCleaner;

impl WindowsCleaner {
    /// Specialized Windows helper for unlocking locked directory handles.
    pub fn prepare_for_deletion(path: &Path) -> NukeResult<()> {
        #[cfg(target_os = "windows")]
        {
            ensure_writable(path)?;
        }
        let _ = path;
        Ok(())
    }
}
