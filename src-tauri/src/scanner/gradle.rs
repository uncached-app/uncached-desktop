use crate::models::category::Category;
use crate::scanner::Scanner;
use std::path::Path;

pub struct GradleScanner;

impl Scanner for GradleScanner {
    fn category(&self) -> Category {
        Category::Gradle
    }

    fn matches(&self, dir_name: &str) -> bool {
        dir_name == ".gradle"
    }

    fn confirm_context(&self, _dir_path: &Path) -> bool {
        true
    }
}
