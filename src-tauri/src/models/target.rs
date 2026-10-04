use crate::entitlements::{plan_for_category, Plan};
use crate::models::category::Category;
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
    /// The owning tool's command for reclaiming a location that is reported
    /// and never removed here. Run by the user, never by the app.
    #[serde(default)]
    pub reclaim_with: Option<String>,
    /// The program using this directory right now, if one is.
    ///
    /// Distinct from `cleanable`, which is a permanent property of what the
    /// thing *is*. This is a fact about this moment: the cache is disposable,
    /// and disposing of it while its owner is mid-write does not free space,
    /// it breaks what was running. Set at scan time so the row can say so, and
    /// asked again at removal — the two are minutes apart, and starting the
    /// tool in between is the ordinary case rather than an exotic one.
    #[serde(default)]
    pub blocked_by: Option<String>,
    pub size_bytes: u64,
    /// Newest write anywhere inside, in seconds since the Unix epoch, from the
    /// same walk that measured the size. `None` while the size is pending, and
    /// for a tree holding no readable file.
    #[serde(default)]
    pub last_used_at: Option<i64>,
    pub size_has_errors: bool,
    pub size_pending: bool,
    pub formatted_size: String,
    #[serde(skip)]
    pub identity: Option<uncached_core::FileIdentity>,
}

impl ScanTarget {
    pub fn from_core(scan_id: &str, target: uncached_core::ScanTarget) -> Self {
        let mut ui_target = Self::pending(target.path, target.category);
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
    pub fn from_discovery(
        scan_id: &str,
        discovery: &uncached_core::Discovery,
        running: &std::collections::BTreeSet<String>,
    ) -> Self {
        let mut target = Self::pending(discovery.path.clone(), discovery.category.clone());
        target.id = format!("{scan_id}-{}", target.id);
        target.label = Some(discovery.label.to_owned());
        target.confidence = uncached_core::assess(uncached_core::discovery::signals_for(discovery));
        target.identity = uncached_core::filesystem::file_identity(&discovery.path);
        target.cleanable = discovery.kind != uncached_core::LocationKind::ReportOnly;
        target.reclaim_with = discovery.reclaim_with.map(str::to_owned);
        target.blocked_by = crate::workspace::running::first_running(discovery.owner, running)
            .map(|owner| owner.to_owned());
        target
    }

    pub fn new(path: PathBuf, category: Category, size_bytes: u64, size_has_errors: bool) -> Self {
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
            reclaim_with: None,
            blocked_by: None,
            size_bytes,
            last_used_at: None,
            size_has_errors,
            size_pending: false,
            formatted_size,
            identity: None,
        }
    }

    pub fn pending(path: PathBuf, category: Category) -> Self {
        let mut target = Self::new(path, category, 0, false);
        target.size_pending = true;
        target
    }

    /// Whether a reclaim could actually take this one.
    ///
    /// Three conditions, and each is a refusal that already exists somewhere
    /// else: `cleanable` is false for a catalogued location no provider vouches
    /// for, so `validate_clean_target` rejects it; a pending or failed size is
    /// rejected by `claim_target_for_cleanup`. Composing them here means the
    /// question "may this be offered" has one answer instead of being
    /// reassembled by every caller that asks.
    ///
    /// **Mirrored by `getCleanupReadyTargets` in `src/utils/scanReview.mjs`,
    /// condition for condition.** The interface has to answer the same question
    /// before a click, and it cannot call this. The mirror is deliberate and
    /// both sides are tested; a fourth condition added here has to be added
    /// there, and the test names on each side say so.
    ///
    /// It is not stamped onto the wire because two of its three inputs are
    /// mutated after a target is registered — sizing settles later — so a
    /// cached copy would be stale exactly when it mattered.
    ///
    /// A settled size of zero is also withheld: there is nothing to reclaim,
    /// and the directory can still be load-bearing — a pnpm workspace
    /// package's `node_modules` holds only links to its sibling packages.
    pub fn cleanup_ready(&self) -> bool {
        self.cleanable && !self.size_pending && !self.size_has_errors && self.size_bytes > 0
    }

    pub fn set_size(&mut self, size_bytes: u64, size_has_errors: bool) {
        self.size_bytes = size_bytes;
        self.size_has_errors = size_has_errors;
        self.size_pending = false;
        self.formatted_size = format_size(size_bytes);
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
///
/// Mirrored by `formatBytes` in `src/utils/format.mjs`, which renders the byte
/// counts the frontend adds up itself. Both appear on one screen, so the two
/// have a shared table of agreed values in each other's tests.
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
mod format_size_tests {
    use super::format_size;

    const KB: u64 = 1024;
    const MB: u64 = KB * 1024;
    const GB: u64 = MB * 1024;

    /// The table `formatBytes` in `src/utils/format.mjs` is checked against,
    /// entry for entry. That file has a test of the same name; a row added
    /// here has to be added there.
    ///
    /// The last four are ties. Rust rounds a half to even and JavaScript's
    /// `toFixed` rounds it away from zero, so the same directory read
    /// "1.12 GB" here and "1.13 GB" there until the mirror was written to
    /// match this side.
    #[test]
    fn format_size_agrees_with_format_bytes_row_for_row() {
        let agreed: [(u64, &str); 13] = [
            (0, "0 B"),
            (1, "1 B"),
            (1023, "1023 B"),
            (KB, "1.00 KB"),
            (MB - 1, "1024.00 KB"),
            (MB, "1.00 MB"),
            (GB, "1.00 GB"),
            (1536, "1.50 KB"),
            (GB + GB / 8, "1.12 GB"),
            (GB * 2 + GB * 3 / 8, "2.38 GB"),
            (MB * 2 + MB * 5 / 8, "2.62 MB"),
            (KB + KB * 7 / 8, "1.88 KB"),
            (100 * 1024 * GB, "102400.00 GB"),
        ];

        for (bytes, expected) in agreed {
            assert_eq!(format_size(bytes), expected, "{bytes} bytes");
        }
    }
}

#[cfg(test)]
mod cleanup_ready_tests {
    use super::ScanTarget;
    use crate::models::category::Category;
    use std::path::PathBuf;

    /// The three conditions, pinned so the mirror in
    /// `src/utils/scanReview.mjs` has something to be checked against. That
    /// file has a test of the same name; a fourth condition added here has to
    /// be added there.
    #[test]
    fn cleanup_ready_mirrors_get_cleanup_ready_targets_condition_for_condition() {
        let base = || {
            ScanTarget::new(
                PathBuf::from("/w/node_modules"),
                Category::NodeModules,
                10,
                false,
            )
        };

        assert!(base().cleanup_ready(), "a measured, cleanable target");

        let mut report_only = base();
        report_only.cleanable = false;
        assert!(
            !report_only.cleanup_ready(),
            "no provider vouches for it, so validation refuses it"
        );

        let mut measuring = base();
        measuring.size_pending = true;
        assert!(
            !measuring.cleanup_ready(),
            "claim_target_for_cleanup refuses a size that has not settled"
        );

        let mut unreadable = base();
        unreadable.size_has_errors = true;
        assert!(
            !unreadable.cleanup_ready(),
            "and refuses one whose measurement failed"
        );

        let mut empty = base();
        empty.set_size(0, false);
        assert!(
            !empty.cleanup_ready(),
            "a settled size of zero reclaims nothing"
        );
    }

    /// The reason this is a method rather than a stamped field: two of its
    /// three inputs are written after the target is registered.
    #[test]
    fn the_answer_follows_the_size_settling_rather_than_being_fixed_at_creation() {
        let mut target =
            ScanTarget::pending(PathBuf::from("/w/node_modules"), Category::NodeModules);
        assert!(
            !target.cleanup_ready(),
            "nothing is offered while measuring"
        );

        target.set_size(4_096, false);
        assert!(target.cleanup_ready(), "and it is once the size lands");

        target.set_size(4_096, true);
        assert!(
            !target.cleanup_ready(),
            "and is not again if it landed broken"
        );
    }
}

#[cfg(test)]
mod tests {
    use super::ScanTarget;
    use crate::entitlements::Plan;
    use crate::models::category::Category;
    use std::path::PathBuf;

    fn wire(category: Category) -> serde_json::Value {
        serde_json::to_value(ScanTarget::new(
            PathBuf::from("/workspace/project/artifact"),
            category,
            1,
            false,
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
            serde_json::to_value(ScanTarget::new(path, Category::NodeModules, 1, false)).unwrap();

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

            let target = ScanTarget::new(path, category, 1, false);

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
            owner: &[],
            root: std::env::temp_dir(),
            reclaim_with: None,
        };

        let target = ScanTarget::from_discovery("scan-1", &discovery, &Default::default());

        assert_eq!(target.label.as_deref(), Some("pnpm store"));
        assert_eq!(target.name, "store");
        assert_eq!(target.plan, Plan::Pro);
        assert_eq!(target.blocked_by, None);
        assert_eq!(
            target.confidence.level,
            uncached_core::ConfidenceLevel::Medium,
            "a shared cache is never offered as high confidence"
        );
    }

    /// The point of the whole mechanism: a cache whose tool is running is
    /// reported with its weight and refused, not offered.
    #[test]
    fn a_cache_whose_owner_is_running_is_blocked() {
        let discovery = uncached_core::Discovery {
            path: std::env::temp_dir().join("uncached-discovery-target/.claude/ide"),
            label: "Claude Code IDE locks",
            category: Category::AiToolCache,
            kind: uncached_core::LocationKind::ToolState,
            owner: &["claude"],
            root: std::env::temp_dir(),
            reclaim_with: None,
        };
        let running = ["claude".to_string(), "node".to_string()]
            .into_iter()
            .collect();

        let blocked = ScanTarget::from_discovery("scan-1", &discovery, &running);
        assert_eq!(blocked.blocked_by.as_deref(), Some("claude"));
        // Still reported, and still weighed. Hiding it would make the total
        // move between two scans with nothing on screen saying why.
        assert!(blocked.cleanable, "the entry itself is still disposable");

        let idle = ScanTarget::from_discovery("scan-1", &discovery, &Default::default());
        assert_eq!(idle.blocked_by, None);
    }

    #[test]
    fn a_report_only_location_carries_the_command_that_reclaims_it() {
        let discovery = uncached_core::Discovery {
            path: std::env::temp_dir().join("uncached-discovery-target/Devices"),
            label: "Simulator devices",
            category: Category::XcodeDerivedData,
            kind: uncached_core::LocationKind::ReportOnly,
            owner: &[],
            root: std::env::temp_dir(),
            reclaim_with: Some("xcrun simctl delete unavailable"),
        };

        let target = ScanTarget::from_discovery("scan-1", &discovery, &Default::default());

        assert!(!target.cleanable);
        assert_eq!(
            target.reclaim_with.as_deref(),
            Some("xcrun simctl delete unavailable")
        );
    }

    #[test]
    fn resizing_a_target_never_changes_its_plan() {
        let mut target = ScanTarget::new(
            PathBuf::from("/workspace/project/node_modules"),
            Category::NodeModules,
            0,
            false,
        );
        target.set_size(4096, false);

        assert_eq!(serde_json::to_value(&target).unwrap()["plan"], "free");
    }
}
