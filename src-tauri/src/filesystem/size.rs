use std::path::Path;

/// Desktop sizing uses the core report so scan and cleanup share one sizing
/// implementation and one overflow/partial-result policy.
pub type DirSize = uncached_core::filesystem::DirectorySizeReport;

pub fn calculate_dir_size(path: &Path) -> u64 {
    calculate_dir_size_report(path).bytes
}

pub fn calculate_dir_size_report(path: &Path) -> DirSize {
    uncached_core::filesystem::directory_size_report(path).unwrap_or(DirSize {
        bytes: 0,
        errors: 1,
        newest_modified: None,
    })
}

#[cfg(test)]
mod tests {
    use super::calculate_dir_size_report;

    #[test]
    fn reports_error_for_missing_directory() {
        let path =
            std::env::temp_dir().join(format!("uncached-size-missing-{}", std::process::id()));
        let report = calculate_dir_size_report(&path);

        assert!(report.errors > 0);
        assert!(!report.is_complete());
    }

    #[test]
    fn calculates_bytes_for_files_in_directory() {
        use std::fs;

        let root = std::env::temp_dir().join(format!(
            "uncached-size-bytes-{}-{:?}",
            std::process::id(),
            std::thread::current().id()
        ));
        fs::create_dir_all(&root).unwrap();
        fs::write(root.join("package.json"), b"12345").unwrap();

        let report = calculate_dir_size_report(&root);

        assert_eq!(report.bytes, 5);
        assert!(report.is_complete());
        fs::remove_dir_all(root).unwrap();
    }
}
