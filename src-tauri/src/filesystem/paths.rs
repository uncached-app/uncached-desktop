use crate::errors::{NukeError, NukeResult};
use std::fs;
use std::path::{Path, PathBuf};

/// Normalizes a path, ensuring extended-length path prefix (`\\?\`) on Windows if needed.
pub fn normalize_win_path(path: &Path) -> PathBuf {
    #[cfg(target_os = "windows")]
    {
        let path_str = path.to_string_lossy();
        if path_str.starts_with(r"\\?\") || path_str.starts_with(r"\\.\") {
            path.to_path_buf()
        } else if path.is_absolute() {
            PathBuf::from(format!(r"\\?\{}", path_str))
        } else {
            path.to_path_buf()
        }
    }

    #[cfg(not(target_os = "windows"))]
    {
        path.to_path_buf()
    }
}

/// Checks if a path is safe to delete (not system root or drive root).
pub fn is_safe_to_delete(path: &Path) -> bool {
    if !path.exists() {
        return false;
    }

    let Ok(metadata) = fs::symlink_metadata(path) else {
        return false;
    };
    if !metadata.is_dir() || metadata.file_type().is_symlink() {
        return false;
    }

    let Ok(canonical) = fs::canonicalize(path) else {
        return false;
    };
    if canonical.parent().is_none() || is_critical_directory(&canonical) {
        return false;
    }

    true
}

pub fn canonicalize_target(path: &Path) -> NukeResult<PathBuf> {
    let metadata =
        fs::symlink_metadata(path).map_err(|_| NukeError::NotFound(path.display().to_string()))?;
    if !metadata.is_dir() || metadata.file_type().is_symlink() {
        return Err(NukeError::PermissionDenied(
            "Target must be a real directory".to_string(),
        ));
    }

    let canonical = fs::canonicalize(path)?;
    if !is_safe_to_delete(&canonical) {
        return Err(NukeError::PermissionDenied(
            "Refusing to delete unsafe path".to_string(),
        ));
    }
    Ok(canonical)
}

pub fn is_within_root(root: &Path, target: &Path) -> bool {
    let Ok(canonical_root) = fs::canonicalize(root) else {
        return false;
    };
    let Ok(canonical_target) = fs::canonicalize(target) else {
        return false;
    };
    canonical_target != canonical_root && canonical_target.starts_with(canonical_root)
}

fn is_critical_directory(path: &Path) -> bool {
    #[cfg(target_os = "windows")]
    {
        let normalized = path.to_string_lossy().to_lowercase();
        let critical = [
            std::env::var("SystemRoot").unwrap_or_else(|_| r"C:\Windows".to_string()),
            std::env::var("ProgramFiles").unwrap_or_else(|_| r"C:\Program Files".to_string()),
            std::env::var("ProgramFiles(x86)")
                .unwrap_or_else(|_| r"C:\Program Files (x86)".to_string()),
        ];
        return critical.iter().any(|value| {
            let critical = value.trim_end_matches(['\\', '/']).to_lowercase();
            !critical.is_empty()
                && (normalized == critical || normalized.starts_with(&(critical + "\\")))
        });
    }

    #[cfg(not(target_os = "windows"))]
    {
        matches!(
            path.to_str(),
            Some("/usr" | "/bin" | "/sbin" | "/etc" | "/var" | "/home" | "/root" | "/opt")
        )
    }
}

#[cfg(test)]
mod tests {
    use super::{is_safe_to_delete, is_within_root};
    use std::fs;
    use std::path::PathBuf;

    fn temp_root() -> PathBuf {
        let root = std::env::temp_dir().join(format!(
            "nuke-modules-paths-{}-{:?}",
            std::process::id(),
            std::thread::current().id()
        ));
        fs::create_dir_all(&root).unwrap();
        root
    }

    #[test]
    fn rejects_existing_directory_as_deletion_root() {
        let volume_root = std::env::current_dir()
            .unwrap()
            .ancestors()
            .last()
            .unwrap()
            .to_path_buf();
        assert!(!is_safe_to_delete(&volume_root));
    }

    #[test]
    fn accepts_non_root_child_inside_scan_root() {
        let root = temp_root();
        let child = root.join("node_modules");
        fs::create_dir(&child).unwrap();
        assert!(is_safe_to_delete(&child));
        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn checks_target_containment_after_canonicalization() {
        let root = temp_root();
        let child = root.join("project").join("node_modules");
        fs::create_dir_all(&child).unwrap();
        let outside = root.join("sibling");
        fs::create_dir(&outside).unwrap();

        assert!(is_within_root(&root, &child));
        assert!(!is_within_root(&child, &outside));

        fs::remove_dir_all(root).unwrap();
    }
}
