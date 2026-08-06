pub mod permanent;
pub mod trash;
pub mod windows;

use crate::errors::NukeResult;
use std::path::Path;

pub trait Cleaner: Send + Sync {
    /// Cleans/deletes the specified target path.
    /// Returns the number of freed bytes.
    fn clean(&self, target_path: &Path) -> NukeResult<u64>;
}
