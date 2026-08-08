use crate::models::category::Category;
use crate::scanner::Scanner;
use std::path::Path;
use uncached_core::Scanner as CoreScanner;

pub struct CargoTargetScanner;

impl CoreScanner for CargoTargetScanner {
    fn category(&self) -> uncached_core::Category {
        uncached_core::Category::CargoTarget
    }

    fn matches(&self, dir_name: &str) -> bool {
        dir_name == "target"
    }

    fn confirm_context(&self, dir_path: &Path) -> bool {
        dir_path
            .parent()
            .is_some_and(|parent| parent.join("Cargo.toml").exists())
    }
}

impl Scanner for CargoTargetScanner {
    fn category(&self) -> Category {
        Category::CargoTarget
    }

    fn matches(&self, dir_name: &str) -> bool {
        CoreScanner::matches(self, dir_name)
    }

    fn confirm_context(&self, dir_path: &Path) -> bool {
        CoreScanner::confirm_context(self, dir_path)
    }
}
