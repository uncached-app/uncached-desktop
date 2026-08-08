use crate::models::category::Category;
use crate::scanner::Scanner;
use std::path::Path;
use uncached_core::Scanner as CoreScanner;

pub struct PyCacheScanner;

impl CoreScanner for PyCacheScanner {
    fn category(&self) -> uncached_core::Category {
        uncached_core::Category::PyCache
    }

    fn matches(&self, dir_name: &str) -> bool {
        matches!(dir_name, "__pycache__" | ".pytest_cache" | ".mypy_cache")
    }

    fn confirm_context(&self, _dir_path: &Path) -> bool {
        true
    }
}

impl Scanner for PyCacheScanner {
    fn category(&self) -> Category {
        Category::PyCache
    }

    fn matches(&self, dir_name: &str) -> bool {
        CoreScanner::matches(self, dir_name)
    }

    fn confirm_context(&self, _dir_path: &Path) -> bool {
        CoreScanner::confirm_context(self, _dir_path)
    }
}
