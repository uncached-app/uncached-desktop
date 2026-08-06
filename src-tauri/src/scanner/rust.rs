use crate::models::category::Category;
use crate::scanner::Scanner;
use std::path::Path;

pub struct CargoTargetScanner;

impl Scanner for CargoTargetScanner {
    fn category(&self) -> Category {
        Category::CargoTarget
    }

    fn matches(&self, dir_name: &str) -> bool {
        dir_name == "target"
    }

    fn confirm_context(&self, dir_path: &Path) -> bool {
        if let Some(parent) = dir_path.parent() {
            parent.join("Cargo.toml").exists()
        } else {
            false
        }
    }
}
