use crate::commands::entitlements::{plan_for_category, Plan};
use crate::models::category::Category;
use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};

/// Paths are not guaranteed to be UTF-8. Serializing lossily keeps a target
/// with an undecodable name visible in the UI, where the default `PathBuf`
/// serializer would fail the whole event instead.
fn serialize_path_lossy<S>(path: &Path, serializer: S) -> Result<S::Ok, S::Error>
where
    S: serde::Serializer,
{
    serializer.serialize_str(&path.to_string_lossy())
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ScanTarget {
    pub id: String,
    #[serde(serialize_with = "serialize_path_lossy")]
    pub path: PathBuf,
    pub name: String,
    /// The tool's own name for the finding, when the directory's basename does
    /// not identify it. `_cacache`, `store` and `caches` say nothing on their
    /// own; "npm cache" and "pnpm store" do. Absent for anything found by
    /// walking a workspace, where the basename is the name.
    pub label: Option<String>,
    pub category: Category,
    /// Stamped by the native layer so the UI never has to decide what is Free.
    pub plan: Plan,
    /// How sure the core is that this is a disposable artifact, with the
    /// reasons behind it. Decided in Rust for the same reason as `plan`.
    pub confidence: uncached_core::Confidence,
    /// False for a location the catalogue reports but never removes, and the
    /// reason the interface can leave the control out instead of offering one
    /// the backend would refuse. The refusal exists either way — no provider
    /// vouches for these — so this field is what keeps the two in agreement.
    pub cleanable: bool,
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
        let mut ui_target = Self::pending(target.path, target.category, last_modified);
        ui_target.id = format!("{scan_id}-{}", ui_target.id);
        ui_target.size_bytes = target.size_bytes;
        ui_target.formatted_size = format_size(target.size_bytes);
        ui_target.identity = target.identity;
        ui_target
    }

    /// Builds a target for a catalogued location found outside the workspace.
    ///
    /// Confidence comes from the catalogue rather than from the ground around
    /// the directory: there is no project above `~/Library/Caches`, and asking
    /// for one would report "no project found" for every discovery — true, and
    /// useless. What the entry is, and what removing it costs, were both
    /// decided in the core when the location was catalogued.
    pub fn from_discovery(scan_id: &str, discovery: &uncached_core::Discovery) -> Self {
        let last_modified = std::fs::metadata(&discovery.path)
            .ok()
            .and_then(|metadata| metadata.modified().ok())
            .map(DateTime::<Utc>::from);
        let mut target = Self::pending(
            discovery.path.clone(),
            discovery.category.clone(),
            last_modified,
        );
        target.id = format!("{scan_id}-{}", target.id);
        target.label = Some(discovery.label.to_owned());
        target.confidence = uncached_core::assess(uncached_core::discovery::signals_for(discovery));
        target.identity = uncached_core::filesystem::file_identity(&discovery.path);
        target.cleanable = discovery.kind != uncached_core::LocationKind::ReportOnly;
        target
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
        // A target only exists because a provider matched and confirmed its
        // context, which is exactly what `known_artifact` means.
        let confidence = uncached_core::assess(uncached_core::collect_signals(&path, true));

        Self {
            id,
            path,
            name,
            label: None,
            category,
            plan,
            confidence,
            // A target found by walking a workspace was confirmed by a
            // provider, which is the same thing that authorizes removing it.
            // Only the catalogue can produce something reportable but not
            // removable, and `from_discovery` sets this from the entry's kind.
            cleanable: true,
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
            category: self.category.clone(),
            size_bytes: self.size_bytes,
            size_pending: self.size_pending,
            size_has_errors: self.size_has_errors,
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

/// Shared with the tray, so a notification reports the same size the
/// interface would have shown for it.
pub fn format_size(bytes: u64) -> String {
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
    use crate::commands::entitlements::Plan;
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
        assert_eq!(wire(Category::CargoTarget)["plan"], "free");
        assert_eq!(wire(Category::PackageManagerCache)["plan"], "pro");
        assert_eq!(wire(Category::Custom("unknown".to_string()))["plan"], "pro");
    }

    // The event used to spell the path out with `to_string_lossy`. Serializing
    // the struct keeps that behaviour: the default `PathBuf` serializer errors
    // on non-UTF-8, which would drop the target from the scan entirely.
    #[cfg(unix)]
    #[test]
    fn a_path_that_is_not_utf8_still_reaches_the_wire() {
        use std::ffi::OsStr;
        use std::os::unix::ffi::OsStrExt;

        let path = PathBuf::from(OsStr::from_bytes(b"/workspace/pro\xffject/node_modules"));
        let value =
            serde_json::to_value(ScanTarget::new(path, Category::NodeModules, 1, false, None))
                .unwrap();

        assert!(value["path"].as_str().unwrap().ends_with("/node_modules"));
    }

    // End to end through collection and assessment: an ordinary project must
    // read as high confidence, including ecosystems that do not commit a
    // lockfile. A badge asking for review on routine targets teaches the user
    // to ignore it.
    #[test]
    fn an_ordinary_project_target_reads_as_high_confidence() {
        let root = std::env::temp_dir().join(format!(
            "uncached-target-confidence-{}-{:?}",
            std::process::id(),
            std::thread::current().id()
        ));
        let cases = [
            (
                "node",
                "package.json",
                Category::NodeModules,
                "node_modules",
            ),
            ("gradle", "build.gradle", Category::Gradle, ".gradle"),
            ("python", "pyproject.toml", Category::PyCache, "__pycache__"),
        ];

        for (name, manifest, category, artifact) in cases {
            let project = root.join(name);
            let path = project.join(artifact);
            std::fs::create_dir_all(&path).unwrap();
            std::fs::write(project.join(manifest), b"").unwrap();

            let target = ScanTarget::new(path, category, 1, false, None);

            assert_eq!(
                target.confidence.level,
                uncached_core::ConfidenceLevel::High,
                "{name}: {:?}",
                target.confidence.signals
            );
        }

        let _ = std::fs::remove_dir_all(root);
    }

    /// A discovered cache is named by its tool, not by its directory. Falling
    /// back to the basename would list "store", "_cacache" and "caches" and
    /// leave the user to guess which tool each one belongs to.
    #[test]
    fn a_discovered_location_is_named_after_its_tool() {
        let discovery = uncached_core::Discovery {
            path: std::env::temp_dir().join("uncached-discovery-target/store"),
            label: "pnpm store",
            category: Category::PackageManagerCache,
            kind: uncached_core::LocationKind::SharedCache,
        };

        let target = ScanTarget::from_discovery("scan-1", &discovery);

        assert_eq!(target.label.as_deref(), Some("pnpm store"));
        assert_eq!(target.name, "store");
        assert_eq!(target.plan, Plan::Pro);
        assert_eq!(
            target.confidence.level,
            uncached_core::ConfidenceLevel::Medium,
            "a shared cache is never offered as high confidence"
        );
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
