use jwalk::WalkDir;
use std::path::Path;

#[derive(Debug, Clone, Copy, Default, PartialEq, Eq)]
pub struct DirSize {
    pub bytes: u64,
    pub errors: u64,
}

pub fn calculate_dir_size_with_entries<I, E>(entries: I) -> DirSize
where
    I: IntoIterator<Item = Result<u64, E>>,
{
    entries
        .into_iter()
        .fold(DirSize::default(), |mut report, entry| {
            match entry {
                Ok(bytes) => report.bytes = report.bytes.saturating_add(bytes),
                Err(_) => report.errors += 1,
            }
            report
        })
}

/// Calculates total size in bytes of a directory tree using `jwalk` parallel directory walking.
pub fn calculate_dir_size(path: &Path) -> u64 {
    calculate_dir_size_report(path).bytes
}

pub fn calculate_dir_size_report(path: &Path) -> DirSize {
    let entries =
        WalkDir::new(path)
            .skip_hidden(false)
            .into_iter()
            .map(|entry| -> Result<u64, ()> {
                let entry = entry.map_err(|_| ())?;
                let metadata = entry.metadata().map_err(|_| ())?;
                Ok(if metadata.is_file() {
                    metadata.len()
                } else {
                    0
                })
            });

    calculate_dir_size_with_entries(entries)
}

#[cfg(test)]
mod tests {
    use super::calculate_dir_size_with_entries;

    #[test]
    fn preserves_bytes_and_counts_partial_read_errors() {
        let report = calculate_dir_size_with_entries([Ok(7), Err(())]);

        assert_eq!(report.bytes, 7);
        assert_eq!(report.errors, 1);
    }

    #[test]
    fn reports_error_for_missing_directory() {
        let path =
            std::env::temp_dir().join(format!("uncached-size-missing-{}", std::process::id()));
        let report = super::calculate_dir_size_report(&path);

        assert!(report.errors > 0);
    }
}
