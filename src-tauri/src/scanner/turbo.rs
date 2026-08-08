use crate::models::category::Category;
use crate::scanner::Scanner;
use std::path::Path;
use uncached_core::Scanner as CoreScanner;

pub struct TurboCacheScanner;

impl CoreScanner for TurboCacheScanner {
    fn category(&self) -> uncached_core::Category {
        uncached_core::Category::Turbo
    }

    fn matches(&self, dir_name: &str) -> bool {
        dir_name == ".turbo"
    }

    fn confirm_context(&self, dir_path: &Path) -> bool {
        dir_path.parent().is_some_and(|parent| {
            parent.join("package.json").exists() || parent.join("turbo.json").exists()
        })
    }
}

impl Scanner for TurboCacheScanner {
    fn category(&self) -> Category {
        Category::Turbo
    }
    fn matches(&self, dir_name: &str) -> bool {
        CoreScanner::matches(self, dir_name)
    }
    fn confirm_context(&self, dir_path: &Path) -> bool {
        CoreScanner::confirm_context(self, dir_path)
    }
}
