use crate::commands::entitlements::{plan_for_category, Plan};
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
    /// Stamped by the native layer so the UI never has to decide what is Free.
    pub plan: Plan,
    pub size_bytes: u64,
    pub size_has_errors: bool,
    pub size_pending: bool,
    pub formatted_size: String,
    pub last_modified: Option<DateTime<Utc>>,
    #[serde(skip)]
    pub identity: Option<uncached_core::FileIdentity>,
}

impl ScanTarget {
    pub fn from_core(scan_id: &str, target: uncached_core::ScanTarget) -> Self {
        let last_modified = std::fs::metadata(&target.path)
            .ok()
            .and_then(|metadata| metadata.modified().ok())
            .map(DateTime::<Utc>::from);
        let mut ui_target = Self::pending(
            target.path,
            category_from_core(target.category),
            last_modified,
        );
        ui_target.id = format!("{scan_id}-{}", ui_target.id);
        ui_target.size_bytes = target.size_bytes;
        ui_target.formatted_size = format_size(target.size_bytes);
        ui_target.identity = target.identity;
        ui_target
    }

    pub fn new(
        path: PathBuf,
        category: Category,
        size_bytes: u64,
        size_has_errors: bool,
        last_modified: Option<DateTime<Utc>>,
    ) -> Self {
        let name = path
            .file_name()
            .map(|n| n.to_string_lossy().to_string())
            .unwrap_or_else(|| "unknown".to_string());

        let id = simple_hash(&path.to_string_lossy());
        let formatted_size = format_size(size_bytes);
        let plan = plan_for_category(&category);

        Self {
            id,
            path,
            name,
            category,
            plan,
            size_bytes,
            size_has_errors,
            size_pending: false,
            formatted_size,
            last_modified,
            identity: None,
        }
    }

    pub fn pending(
        path: PathBuf,
        category: Category,
        last_modified: Option<DateTime<Utc>>,
    ) -> Self {
        let mut target = Self::new(path, category, 0, false, last_modified);
        target.size_pending = true;
        target
    }

    pub fn set_size(&mut self, size_bytes: u64, size_has_errors: bool) {
        self.size_bytes = size_bytes;
        self.size_has_errors = size_has_errors;
        self.size_pending = false;
        self.formatted_size = format_size(size_bytes);
    }

    pub fn to_core_dto(&self) -> uncached_core::contract::v1::ScanTargetDto {
        uncached_core::contract::v1::ScanTargetDto {
            path: self.path.to_string_lossy().into_owned(),
            category: category_to_core(&self.category),
            size_bytes: self.size_bytes,
            size_pending: self.size_pending,
            size_has_errors: self.size_has_errors,
        }
    }
}

fn category_from_core(category: uncached_core::Category) -> Category {
    match category {
        uncached_core::Category::NodeModules => Category::NodeModules,
        uncached_core::Category::CargoTarget => Category::CargoTarget,
        uncached_core::Category::NextJs => Category::NextJs,
        uncached_core::Category::Turbo => Category::Turbo,
        uncached_core::Category::PyCache => Category::PyCache,
        uncached_core::Category::Gradle => Category::Gradle,
        uncached_core::Category::DotNetObj => Category::DotNetObj,
        uncached_core::Category::Docker => Category::Docker,
        uncached_core::Category::Custom(name) => Category::Custom(name),
    }
}

fn category_to_core(category: &Category) -> uncached_core::Category {
    match category {
        Category::NodeModules => uncached_core::Category::NodeModules,
        Category::CargoTarget => uncached_core::Category::CargoTarget,
        Category::NextJs => uncached_core::Category::NextJs,
        Category::Turbo => uncached_core::Category::Turbo,
        Category::PyCache => uncached_core::Category::PyCache,
        Category::Gradle => uncached_core::Category::Gradle,
        Category::DotNetObj => uncached_core::Category::DotNetObj,
        Category::Docker => uncached_core::Category::Docker,
        Category::Custom(name) => uncached_core::Category::Custom(name.clone()),
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

#[cfg(test)]
mod tests {
    use super::ScanTarget;
    use crate::models::category::Category;
    use std::path::PathBuf;

    fn wire(category: Category) -> serde_json::Value {
        serde_json::to_value(ScanTarget::new(
            PathBuf::from("/workspace/project/artifact"),
            category,
            1,
            false,
            None,
        ))
        .unwrap()
    }

    #[test]
    fn every_target_carries_the_plan_decided_by_the_native_layer() {
        assert_eq!(wire(Category::NodeModules)["plan"], "free");
        assert_eq!(wire(Category::CargoTarget)["plan"], "pro");
        assert_eq!(wire(Category::Custom("unknown".to_string()))["plan"], "pro");
    }

    #[test]
    fn resizing_a_target_never_changes_its_plan() {
        let mut target = ScanTarget::new(
            PathBuf::from("/workspace/project/node_modules"),
            Category::NodeModules,
            0,
            false,
            None,
        );
        target.set_size(4096, false);

        assert_eq!(serde_json::to_value(&target).unwrap()["plan"], "free");
    }
}
