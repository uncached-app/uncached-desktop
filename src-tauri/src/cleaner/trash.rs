use crate::cleaner::Cleaner;
use crate::errors::{NukeError, NukeResult};
use crate::filesystem::paths::canonicalize_target;
use crate::filesystem::size::calculate_dir_size;
use std::path::Path;

pub struct TrashCleaner;

impl Cleaner for TrashCleaner {
    fn clean(&self, target_path: &Path) -> NukeResult<u64> {
        let target_path = canonicalize_target(target_path)?;
        let freed_bytes = calculate_dir_size(&target_path);

        match trash::delete(&target_path) {
            Ok(_) => Ok(freed_bytes),
            Err(err) => {
                let err_msg = err.to_string();
                if err_msg.to_lowercase().contains("too large")
                    || err_msg.to_lowercase().contains("lixeira")
                {
                    Err(NukeError::RecycleBinTooLarge)
                } else {
                    Err(NukeError::Trash(err_msg))
                }
            }
        }
    }
}
