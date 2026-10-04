use std::path::{Path, PathBuf};

/// Removes the Windows extended-length prefix when a path is safe to use as a
/// regular Windows path.
pub fn strip_extended_prefix(path: &Path) -> PathBuf {
    let value = path.to_string_lossy();
    if let Some(unc_path) = value.strip_prefix(r"\\?\UNC\") {
        return PathBuf::from(format!(r"\\{}", unc_path));
    }
    if let Some(drive_path) = value.strip_prefix(r"\\?\") {
        return PathBuf::from(drive_path);
    }
    path.to_path_buf()
}

#[cfg(test)]
mod tests {
    use super::strip_extended_prefix;
    use std::path::PathBuf;

    #[test]
    fn strips_extended_prefix_from_windows_drive_path() {
        assert_eq!(
            strip_extended_prefix(&PathBuf::from(r"\\?\D:\Downloads\project")),
            PathBuf::from(r"D:\Downloads\project")
        );
    }

    #[test]
    fn converts_extended_unc_path_to_regular_unc_path() {
        assert_eq!(
            strip_extended_prefix(&PathBuf::from(r"\\?\UNC\server\share\project")),
            PathBuf::from(r"\\server\share\project")
        );
    }
}
