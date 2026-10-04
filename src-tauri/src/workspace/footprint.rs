//! How much of a project is work and how much can be put back.
//!
//! The reclaimable figure is what the same providers and exclusions the cleanup
//! uses would remove, so what the screen promises matches what a cleanup takes.

use serde::Serialize;
use std::path::Path;
use std::sync::atomic::AtomicBool;

/// `source_bytes` is what remains once every reclaimable target is removed.
#[derive(Debug, Clone, Default, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Footprint {
    pub total_bytes: u64,
    pub source_bytes: u64,
    pub reclaimable_bytes: u64,
    pub by_category: Vec<CategoryBytes>,
    /// Some directory could not be read, so the total is partial.
    pub has_errors: bool,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CategoryBytes {
    pub category: String,
    pub bytes: u64,
}

pub(crate) fn measure_footprint(
    path: &Path,
    settings: &crate::settings::AppSettings,
) -> Result<Footprint, String> {
    // Same providers and exclusions as the Purge, so reclaimable matches what cleanup takes.
    let providers = crate::scanner::get_default_providers(settings);
    let cancelled = AtomicBool::new(false);

    let mut targets = Vec::new();
    let outcome = uncached_core::traverse_workspace(path, &providers, &cancelled, |entry| {
        match entry.category.clone() {
            Some(category) => {
                targets.push((entry.path.clone(), category));
                uncached_core::TraversalControl::Prune
            }
            None => uncached_core::TraversalControl::Continue,
        }
    })
    .map_err(|error| error.to_string())?;

    // A walk that could not open every folder may have missed artifacts, so the
    // reclaimable figure is partial for the same reason a partial size is.
    let walk_incomplete = matches!(
        outcome,
        uncached_core::TraversalOutcome::Completed { unreadable } if unreadable > 0
    );

    let mut footprint = Footprint {
        has_errors: walk_incomplete,
        ..Footprint::default()
    };
    let mut by_category: Vec<(String, u64)> = Vec::new();
    let artifact_paths: Vec<std::path::PathBuf> =
        targets.iter().map(|(path, _)| path.clone()).collect();

    for (target_path, category) in targets {
        let size = crate::filesystem::size::calculate_dir_size_report(&target_path);
        footprint.has_errors = footprint.has_errors || size.errors > 0;
        footprint.reclaimable_bytes = footprint.reclaimable_bytes.saturating_add(size.bytes);
        let wire = category.as_wire();
        match by_category.iter_mut().find(|(name, _)| name == &wire) {
            Some((_, bytes)) => *bytes = bytes.saturating_add(size.bytes),
            None => by_category.push((wire, size.bytes)),
        }
    }

    // The rest of the project, without descending into anything already
    // measured above. The artifacts are most of a project's files — 355 source
    // files against 17,880 artifact ones in this very repository — and sizing
    // the whole tree and then each artifact again walked those twice. On a warm
    // macOS cache the difference is milliseconds; on Windows, where a real-time
    // scanner inspects every file as it is opened, it is the difference between
    // seconds and minutes.
    //
    // From the canonical root, because that is the spelling the traversal
    // returned the artifact paths in — `/var` resolves to `/private/var` on
    // macOS, and comparing one against the other matches nothing, so every
    // artifact would be walked again and counted twice. The test caught exactly
    // that.
    let source = uncached_core::filesystem::directory_size_report_skipping(
        &uncached_core::filesystem::canonical(path).unwrap_or_else(|_| path.to_path_buf()),
        &artifact_paths,
        &cancelled,
    )
    .map(|report| report.unwrap_or_default())
    .unwrap_or_default();

    footprint.source_bytes = source.bytes;
    footprint.has_errors = footprint.has_errors || source.errors > 0;
    // Added rather than subtracted. Taking reclaimable off a separately measured
    // total meant two passes disagreeing whenever a file moved between them, and
    // a saturating subtraction hid that as a zero.
    footprint.total_bytes = source.bytes.saturating_add(footprint.reclaimable_bytes);
    by_category.sort_by_key(|(_, bytes)| std::cmp::Reverse(*bytes));
    footprint.by_category = by_category
        .into_iter()
        .map(|(category, bytes)| CategoryBytes { category, bytes })
        .collect();

    Ok(footprint)
}

#[cfg(test)]
mod tests {
    use std::fs;

    #[test]
    fn a_footprint_separates_the_work_from_what_can_be_put_back() {
        let root = std::env::temp_dir().join(format!("uncached-footprint-{}", std::process::id()));
        let _ = fs::remove_dir_all(&root);
        fs::create_dir_all(root.join("node_modules/pkg")).unwrap();
        fs::create_dir_all(root.join("src")).unwrap();
        fs::write(root.join("package.json"), b"{}").unwrap();
        fs::write(root.join("src/index.js"), vec![b'a'; 100]).unwrap();
        fs::write(root.join("node_modules/pkg/index.js"), vec![b'b'; 900]).unwrap();

        let settings = crate::settings::AppSettings::default();
        let footprint = super::measure_footprint(&root, &settings).unwrap();

        assert!(footprint.reclaimable_bytes >= 900);
        assert_eq!(
            footprint.source_bytes,
            footprint.total_bytes - footprint.reclaimable_bytes
        );
        assert!(footprint.source_bytes < footprint.reclaimable_bytes);
        assert_eq!(footprint.by_category.len(), 1);
        assert_eq!(footprint.by_category[0].category, "NodeModules");

        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn a_footprint_does_not_count_what_an_ignore_rule_protects() {
        let root =
            std::env::temp_dir().join(format!("uncached-footprint-ignored-{}", std::process::id()));
        let _ = fs::remove_dir_all(&root);
        fs::create_dir_all(root.join("node_modules/pkg")).unwrap();
        fs::write(root.join("package.json"), b"{}").unwrap();
        fs::write(root.join("node_modules/pkg/index.js"), vec![b'b'; 900]).unwrap();

        let settings = crate::settings::AppSettings {
            ignore_rules: root.join("node_modules").to_string_lossy().into_owned(),
            ..crate::settings::AppSettings::default()
        };
        let footprint = super::measure_footprint(&root, &settings).unwrap();

        assert_eq!(footprint.reclaimable_bytes, 0);
        assert!(footprint.by_category.is_empty());
        assert_eq!(footprint.source_bytes, footprint.total_bytes);

        let _ = fs::remove_dir_all(root);
    }
}
