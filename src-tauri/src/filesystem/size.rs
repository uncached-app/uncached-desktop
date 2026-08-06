use jwalk::WalkDir;
use std::path::Path;

/// Calculates total size in bytes of a directory tree using `jwalk` parallel directory walking.
pub fn calculate_dir_size(path: &Path) -> u64 {
    WalkDir::new(path)
        .skip_hidden(false)
        .into_iter()
        .filter_map(|entry| entry.ok())
        .filter_map(|entry| entry.metadata().ok())
        .filter(|metadata| metadata.is_file())
        .map(|metadata| metadata.len())
        .sum()
}
