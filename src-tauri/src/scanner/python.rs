use crate::models::category::Category;
use crate::scanner::Scanner;
use std::path::Path;

pub struct PyCacheScanner;

impl Scanner for PyCacheScanner {
    fn category(&self) -> Category {
        Category::PyCache
    }

    fn matches(&self, dir_name: &str) -> bool {
        dir_name == "__pycache__" || dir_name == ".pytest_cache" || dir_name == ".mypy_cache"
    }

    fn confirm_context(&self, _dir_path: &Path) -> bool {
        true
    }
}
