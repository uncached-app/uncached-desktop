use jwalk::WalkDir;
use std::path::Path;
use std::sync::{Arc, Mutex};

pub struct DiskWalker;

impl DiskWalker {
    /// Iterates through directories efficiently in parallel.
    pub fn walk_directories<F>(root: &Path, callback: F)
    where
        F: FnMut(&Path, &str) -> bool + Send + 'static, // returns true to skip recursing deeper into this directory
    {
        let callback = Arc::new(Mutex::new(callback));
        let walker = WalkDir::new(root).skip_hidden(false).process_read_dir({
            let callback = Arc::clone(&callback);
            move |_, _, _, children| {
                children.sort_by(|a, b| {
                    a.as_ref()
                        .map(|e| e.file_name())
                        .ok()
                        .cmp(&b.as_ref().map(|e| e.file_name()).ok())
                });

                for child in children.iter_mut().flatten() {
                    if child.file_type().is_dir() {
                        let path = child.path();
                        let name = child.file_name().to_string_lossy();
                        if callback.lock().unwrap()(&path, &name) {
                            child.read_children_path = None;
                        }
                    }
                }
            }
        });

        for _ in walker.into_iter().flatten() {}
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
        });

        let visited = visited.lock().unwrap();
        assert!(visited.contains(&target));
        assert!(!visited.contains(&nested));
        fs::remove_dir_all(root).unwrap();
    }
}
