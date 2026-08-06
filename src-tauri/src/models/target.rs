use crate::models::category::Category;
use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use std::path::PathBuf;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ScanTarget {
    pub id: String,
    pub path: PathBuf,
    pub name: String,
    pub category: Category,
    pub size_bytes: u64,
    pub formatted_size: String,
    pub last_modified: Option<DateTime<Utc>>,
}

impl ScanTarget {
    pub fn new(
        path: PathBuf,
        category: Category,
        size_bytes: u64,
        last_modified: Option<DateTime<Utc>>,
    ) -> Self {
        let name = path
            .file_name()
            .map(|n| n.to_string_lossy().to_string())
            .unwrap_or_else(|| "unknown".to_string());

        let id = simple_hash(&path.to_string_lossy());
        let formatted_size = format_size(size_bytes);

        Self {
            id,
            path,
            name,
            category,
            size_bytes,
            formatted_size,
            last_modified,
        }
    }
}

fn simple_hash(input: &str) -> String {
    use std::collections::hash_map::DefaultHasher;
    use std::hash::{Hash, Hasher};
    let mut hasher = DefaultHasher::new();
    input.hash(&mut hasher);
    format!("{:x}", hasher.finish())
}

fn format_size(bytes: u64) -> String {
    const KB: u64 = 1024;
    const MB: u64 = KB * 1024;
    const GB: u64 = MB * 1024;

    if bytes >= GB {
        format!("{:.2} GB", bytes as f64 / GB as f64)
    } else if bytes >= MB {
        format!("{:.2} MB", bytes as f64 / MB as f64)
    } else if bytes >= KB {
        format!("{:.2} KB", bytes as f64 / KB as f64)
    } else {
        format!("{} B", bytes)
    }
}
