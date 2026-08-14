//! The same package, installed once per project.
//!
//! Read-only, and deliberately the only thing this module does. WORKSPACE_REDESIGN
//! section 8 sets four stages before anything is allowed to move a byte, and this
//! is the first: measure the duplication and show it. A shared store is stage
//! four, and a bug there does not waste space — it breaks the environment the
//! user works in.
//!
//! **A symlinked entry is never counted.** pnpm links every package into a
//! content-addressed store, so its `node_modules` is a directory of links to one
//! copy on disk. Following those would count the same bytes once per project and
//! report duplication that does not exist — the opposite of the truth, since pnpm
//! is what already solved this. Skipping them means a pnpm project contributes
//! nothing here, which is the honest answer, and the count of those projects is
//! reported so the screen can say why.
//!
//! What is measured is one copy of each duplicated package, and the waste is that
//! figure times the copies past the first. Sizing every copy would cost a walk of
//! every `node_modules` on the machine to refine a number whose whole point is
//! being an order of magnitude.

use serde::Serialize;
use std::collections::HashMap;

/// One installed package, as found on disk.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Installed {
    pub name: String,
    pub version: String,
    /// The project whose `node_modules` holds it.
    pub project: String,
    pub path: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DuplicatePackage {
    pub name: String,
    pub version: String,
    pub copies: usize,
    /// One copy, measured. `None` until the caller has weighed it.
    pub bytes_each: Option<u64>,
    /// `bytes_each` times the copies past the first, so a package installed
    /// three times wastes two copies rather than three.
    pub wasted_bytes: u64,
    /// Where the copies are, so the number leads somewhere.
    pub projects: Vec<String>,
    /// One of them, for the caller to weigh.
    pub sample_path: String,
}

#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DuplicateReport {
    /// Heaviest waste first.
    pub packages: Vec<DuplicatePackage>,
    pub wasted_bytes: u64,
    /// Projects whose `node_modules` was read.
    pub scanned_projects: usize,
    /// Projects whose packages are links into a shared store, so they are not
    /// duplicating anything and are excluded from every figure above.
    pub shared_projects: usize,
    /// Distinct `name@version` seen, duplicated or not.
    pub distinct_packages: usize,
}

/// Groups installs into the ones that exist more than once.
///
/// Identity is `name@version`. Two directories with the same one came from the
/// same published tarball, which is what makes the copies interchangeable —
/// and the assumption is stated on screen rather than hidden here, because a
/// `postinstall` that compiled a native binary can make two of them differ.
///
/// A package installed twice inside the same project is one copy: the question
/// is how many projects are each holding their own, and npm's own nesting is not
/// something the user chose.
pub fn group(installs: Vec<Installed>) -> DuplicateReport {
    let mut by_identity: HashMap<(String, String), Vec<Installed>> = HashMap::new();
    for install in installs {
        by_identity
            .entry((install.name.clone(), install.version.clone()))
            .or_default()
            .push(install);
    }
    let distinct_packages = by_identity.len();

    let mut packages: Vec<DuplicatePackage> = by_identity
        .into_iter()
        .filter_map(|((name, version), copies)| {
            let mut projects: Vec<String> =
                copies.iter().map(|copy| copy.project.clone()).collect();
            projects.sort();
            projects.dedup();
            if projects.len() < 2 {
                return None;
            }
            Some(DuplicatePackage {
                copies: projects.len(),
                sample_path: copies[0].path.clone(),
                name,
                version,
                bytes_each: None,
                wasted_bytes: 0,
                projects,
            })
        })
        .collect();

    // Without a weight there is nothing to rank by, so the order is the stable
    // one the caller can re-sort once it has weighed them.
    packages.sort_by(|left, right| {
        right
            .copies
            .cmp(&left.copies)
            .then_with(|| left.name.cmp(&right.name))
            .then_with(|| left.version.cmp(&right.version))
    });

    DuplicateReport {
        packages,
        wasted_bytes: 0,
        scanned_projects: 0,
        shared_projects: 0,
        distinct_packages,
    }
}

/// Applies the measured weights and totals the waste.
///
/// Separate from `group` because weighing is the expensive half: only the
/// packages that turned out to be duplicated are ever measured, and only once
/// each.
pub fn weigh(report: &mut DuplicateReport, sizes: &HashMap<String, u64>) {
    for package in &mut report.packages {
        let Some(&bytes) = sizes.get(&package.sample_path) else {
            continue;
        };
        package.bytes_each = Some(bytes);
        package.wasted_bytes = bytes.saturating_mul(package.copies.saturating_sub(1) as u64);
    }
    // Unweighed packages sink rather than disappear: the list is what was found,
    // and dropping the ones whose size could not be read would quietly shrink a
    // total the user is being asked to believe.
    report
        .packages
        .sort_by_key(|package| std::cmp::Reverse(package.wasted_bytes));
    report.wasted_bytes = report.packages.iter().fold(0u64, |total, package| {
        total.saturating_add(package.wasted_bytes)
    });
}

#[cfg(test)]
mod tests {
    use super::{group, weigh, Installed};
    use std::collections::HashMap;

    fn install(name: &str, version: &str, project: &str) -> Installed {
        Installed {
            name: name.to_owned(),
            version: version.to_owned(),
            project: project.to_owned(),
            path: format!("{project}/node_modules/{name}"),
        }
    }

    #[test]
    fn a_package_installed_once_is_not_a_duplicate() {
        let report = group(vec![install("react", "18.3.1", "/w/a")]);

        assert!(report.packages.is_empty());
        assert_eq!(report.distinct_packages, 1);
    }

    /// The identity is the whole design: two versions of one package are two
    /// packages, and reporting them as copies would offer to save space that
    /// removing either one would not free.
    #[test]
    fn two_versions_of_one_package_are_not_copies_of_each_other() {
        let report = group(vec![
            install("react", "18.3.1", "/w/a"),
            install("react", "19.0.0", "/w/b"),
        ]);

        assert!(report.packages.is_empty());
        assert_eq!(report.distinct_packages, 2);
    }

    #[test]
    fn the_same_version_in_two_projects_is_one_wasted_copy() {
        let mut report = group(vec![
            install("react", "18.3.1", "/w/a"),
            install("react", "18.3.1", "/w/b"),
        ]);
        let sample = report.packages[0].sample_path.clone();
        weigh(&mut report, &HashMap::from([(sample, 1_000)]));

        assert_eq!(report.packages.len(), 1);
        assert_eq!(report.packages[0].copies, 2);
        assert_eq!(report.packages[0].bytes_each, Some(1_000));
        assert_eq!(
            report.packages[0].wasted_bytes, 1_000,
            "two copies waste one, not two"
        );
        assert_eq!(report.wasted_bytes, 1_000);
    }

    #[test]
    fn three_projects_waste_two_copies() {
        let mut report = group(vec![
            install("esbuild", "0.28.1", "/w/a"),
            install("esbuild", "0.28.1", "/w/b"),
            install("esbuild", "0.28.1", "/w/c"),
        ]);
        let sample = report.packages[0].sample_path.clone();
        weigh(&mut report, &HashMap::from([(sample, 10_000)]));

        assert_eq!(report.packages[0].copies, 3);
        assert_eq!(report.wasted_bytes, 20_000);
    }

    /// npm nests a second copy inside a package when versions conflict. That is
    /// npm's business, not the user's, and counting it would report duplication
    /// nobody chose and nothing here would fix.
    #[test]
    fn a_package_twice_inside_one_project_is_one_copy() {
        let mut nested = install("ms", "2.1.3", "/w/a");
        nested.path = "/w/a/node_modules/debug/node_modules/ms".to_owned();
        let report = group(vec![install("ms", "2.1.3", "/w/a"), nested]);

        assert!(
            report.packages.is_empty(),
            "one project holding it twice is still one project"
        );
    }

    #[test]
    fn the_heaviest_waste_leads_once_the_weights_are_in() {
        let mut report = group(vec![
            install("small", "1.0.0", "/w/a"),
            install("small", "1.0.0", "/w/b"),
            install("large", "1.0.0", "/w/a"),
            install("large", "1.0.0", "/w/b"),
        ]);
        let sizes: HashMap<String, u64> = report
            .packages
            .iter()
            .map(|package| {
                let bytes = if package.name == "large" { 9_000 } else { 10 };
                (package.sample_path.clone(), bytes)
            })
            .collect();
        weigh(&mut report, &sizes);

        assert_eq!(report.packages[0].name, "large");
        assert_eq!(report.wasted_bytes, 9_010);
    }

    /// Dropping what could not be weighed would quietly shrink a total the user
    /// is being asked to believe.
    #[test]
    fn a_package_whose_size_could_not_be_read_stays_in_the_list_at_zero() {
        let mut report = group(vec![
            install("unreadable", "1.0.0", "/w/a"),
            install("unreadable", "1.0.0", "/w/b"),
        ]);
        weigh(&mut report, &HashMap::new());

        assert_eq!(report.packages.len(), 1);
        assert_eq!(report.packages[0].bytes_each, None);
        assert_eq!(report.wasted_bytes, 0);
    }

    #[test]
    fn a_scoped_package_keeps_its_scope_in_its_identity() {
        let report = group(vec![
            install("@types/node", "22.0.0", "/w/a"),
            install("@types/node", "22.0.0", "/w/b"),
            install("node", "22.0.0", "/w/c"),
        ]);

        assert_eq!(report.packages.len(), 1);
        assert_eq!(report.packages[0].name, "@types/node");
    }

    #[test]
    fn the_report_crosses_the_boundary_in_camel_case() {
        let mut report = group(vec![
            install("react", "18.3.1", "/w/a"),
            install("react", "18.3.1", "/w/b"),
        ]);
        report.shared_projects = 3;
        let value = serde_json::to_value(&report).unwrap();

        assert!(value["packages"][0]["wastedBytes"].is_number());
        assert!(value["packages"][0]["bytesEach"].is_null());
        assert_eq!(value["sharedProjects"], 3);
        assert!(value["distinctPackages"].is_number());
    }
}
