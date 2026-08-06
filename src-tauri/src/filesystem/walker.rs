use crate::errors::{NukeError, NukeResult};
use jwalk::WalkDir;
use std::path::Path;
use std::sync::{Arc, Mutex};

pub struct DiskWalker;

impl DiskWalker {
    /// Iterates through directories efficiently in parallel.
    pub fn walk_directories<F>(root: &Path, callback: F) -> NukeResult<()>
    where
        F: FnMut(&Path, &str) -> bool + Send + 'static, // returns true to skip recursing deeper into this directory
    {
        if !root.is_dir() {
            return Err(NukeError::NotFound(root.display().to_string()));
        }

        let callback = Arc::new(Mutex::new(callback));
        let walk_error = Arc::new(Mutex::new(None));
        let walker = WalkDir::new(root).skip_hidden(false).process_read_dir({
            let callback = Arc::clone(&callback);
            let walk_error = Arc::clone(&walk_error);
            move |_, _, _, children| {
                children.sort_by(|a, b| {
                    a.as_ref()
                        .map(|e| e.file_name())
                        .ok()
                        .cmp(&b.as_ref().map(|e| e.file_name()).ok())
                });

                for child_result in children.iter_mut() {
                    match child_result {
                        Ok(child) => {
                            if child.file_type().is_dir() {
                                let path = child.path();
                                let name = child.file_name().to_string_lossy();
                                if callback.lock().unwrap()(&path, &name) {
                                    child.read_children_path = None;
                                }
                            }
                        }
                        Err(error) => {
                            let mut walk_error = walk_error.lock().unwrap();
                            if walk_error.is_none() {
                                *walk_error =
                                    Some(NukeError::Io(std::io::Error::other(error.to_string())));
                            }
                        }
                    }
                }
            }
        });

        for entry in walker {
            if let Err(error) = entry {
                let mut walk_error = walk_error.lock().unwrap();
                if walk_error.is_none() {
                    *walk_error = Some(NukeError::Io(error.into()));
                }
            }
        }

        let result = walk_error.lock().unwrap().take().map_or(Ok(()), Err);
        result
    }
}

#[cfg(test)]
mod tests {
    use super::DiskWalker;
    use std::fs;
    use std::path::PathBuf;
    use std::sync::{Arc, Mutex};

    fn temp_root() -> PathBuf {
        let root = std::env::temp_dir().join(format!("nuke-modules-walker-{}", std::process::id()));
        fs::create_dir_all(&root).unwrap();
        root
    }

    #[test]
    fn callback_can_prune_target_subtree() {
        let root = temp_root();
        let target = root.join("node_modules");
        let nested = target.join("nested");
        fs::create_dir_all(&nested).unwrap();

        let visited = Arc::new(Mutex::new(Vec::new()));
        let visited_for_callback = Arc::clone(&visited);
        DiskWalker::walk_directories(&root, move |path, name| {
            visited_for_callback
                .lock()
                .unwrap()
                .push(path.to_path_buf());
            name == "node_modules"
        })
        .unwrap();

        let visited = visited.lock().unwrap();
        assert!(visited.contains(&target));
        assert!(!visited.contains(&nested));
        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn returns_error_for_missing_root() {
        let root =
            std::env::temp_dir().join(format!("nuke-modules-missing-root-{}", std::process::id()));
        let result = DiskWalker::walk_directories(&root, |_path, _name| false);
        assert!(result.is_err());
    }
}
