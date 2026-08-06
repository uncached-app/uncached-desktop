use chrono::Utc;
use std::fs;
use std::path::PathBuf;
use std::sync::{Mutex, OnceLock};

const MAX_LOG_BYTES: usize = 5 * 1024 * 1024;

pub struct Logger {
    path: PathBuf,
    lock: Mutex<()>,
}

impl Logger {
    pub fn at_path(path: PathBuf) -> Self {
        Self {
            path,
            lock: Mutex::new(()),
        }
    }

    pub fn write(&self, level: &str, component: &str, message: &str) {
        let _guard = self.lock.lock().unwrap();
        let line = format!(
            "{} {} {} {}\n",
            Utc::now().to_rfc3339(),
            level,
            component,
            message
        );
        let mut content = fs::read(&self.path).unwrap_or_default();
        content.extend_from_slice(line.as_bytes());
        if content.len() > MAX_LOG_BYTES {
            content = content[content.len() - MAX_LOG_BYTES..].to_vec();
        }

        if let Some(parent) = self.path.parent() {
            let _ = fs::create_dir_all(parent);
        }
        let _ = fs::write(&self.path, content);
    }
}

fn global() -> &'static Logger {
    static LOGGER: OnceLock<Logger> = OnceLock::new();
    LOGGER.get_or_init(|| {
        let base = std::env::var_os("LOCALAPPDATA")
            .map(PathBuf::from)
            .unwrap_or_else(std::env::temp_dir);
        Logger::at_path(base.join("Uncached").join("logs").join("uncached.log"))
    })
}

pub fn info(component: &str, message: &str) {
    global().write("INFO", component, message);
}

pub fn warn(component: &str, message: &str) {
    global().write("WARN", component, message);
}

pub fn error(component: &str, message: &str) {
    global().write("ERROR", component, message);
}

#[cfg(test)]
mod tests {
    use super::Logger;
    use std::fs;
    use std::path::PathBuf;

    fn temp_log_path(name: &str) -> PathBuf {
        std::env::temp_dir()
            .join(format!("uncached-logging-{}-{}", std::process::id(), name))
            .join("app.log")
    }

    #[test]
    fn creates_parent_and_writes_structured_line() {
        let path = temp_log_path("format");
        let logger = Logger::at_path(path.clone());
        logger.write("INFO", "scan", "root=\"D:/\"");

        let content = fs::read_to_string(path).unwrap();
        assert!(content.contains(" INFO scan root=\"D:/\""));
    }

    #[test]
    fn keeps_log_at_or_below_five_mebibytes() {
        let path = temp_log_path("rotation");
        let logger = Logger::at_path(path.clone());
        logger.write("INFO", "test", &"x".repeat(6 * 1024 * 1024));

        assert!(fs::metadata(path).unwrap().len() <= 5 * 1024 * 1024);
    }

    #[test]
    fn records_aggregate_size_errors_without_file_contents() {
        let path = temp_log_path("size-errors");
        let logger = Logger::at_path(path.clone());
        logger.write("INFO", "size", "targetPath=\"D:/\" bytes=0 errors=12");

        let content = fs::read_to_string(path).unwrap();
        assert!(content.contains("size targetPath=\"D:/\" bytes=0 errors=12"));
        assert!(!content.contains("secret-file-content"));
    }
}
