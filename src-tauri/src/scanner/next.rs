use crate::models::category::Category;
use crate::scanner::Scanner;
use std::path::Path;

pub struct NextCacheScanner;

impl Scanner for NextCacheScanner {
    fn category(&self) -> Category {
        Category::NextJs
    }
    fn matches(&self, dir_name: &str) -> bool {
        dir_name == ".next"
    }
    fn confirm_context(&self, dir_path: &Path) -> bool {
        dir_path
            .parent()
            .is_some_and(|parent| parent.join("package.json").exists())
    }
}
