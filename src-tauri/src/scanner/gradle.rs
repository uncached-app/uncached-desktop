use crate::models::category::Category;
use crate::scanner::Scanner;
use std::path::Path;
use uncached_core::Scanner as CoreScanner;

pub struct GradleScanner;

impl CoreScanner for GradleScanner {
    fn category(&self) -> uncached_core::Category {
        uncached_core::Category::Gradle
    }

    fn matches(&self, dir_name: &str) -> bool {
        dir_name == ".gradle"
    }

    fn confirm_context(&self, _dir_path: &Path) -> bool {
        true
    }
}

impl Scanner for GradleScanner {
    fn category(&self) -> Category {
        Category::Gradle
    }

    fn matches(&self, dir_name: &str) -> bool {
        CoreScanner::matches(self, dir_name)
    }

    fn confirm_context(&self, _dir_path: &Path) -> bool {
        CoreScanner::confirm_context(self, _dir_path)
    }
}
