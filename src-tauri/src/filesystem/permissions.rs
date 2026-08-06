use crate::errors::NukeResult;
use std::fs;
use std::path::Path;

/// Recursively removes Read-Only attribute from files and directories.
pub fn ensure_writable(path: &Path) -> NukeResult<()> {
    if !path.exists() {
        return Err(crate::errors::NukeError::NotFound(
            path.display().to_string(),
        ));
    }

    let metadata = fs::symlink_metadata(path)?;
    if metadata.file_type().is_symlink() {
        return Ok(());
    }

    {
        let mut permissions = metadata.permissions();
        if permissions.readonly() {
            permissions.set_readonly(false);
            fs::set_permissions(path, permissions)?;
        }
    }

    if path.is_dir() {
        for entry in fs::read_dir(path)? {
            ensure_writable(&entry?.path())?;
        }
    }

    Ok(())
}
