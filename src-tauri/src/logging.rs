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

/// The log file every `info`/`warn`/`error` call appends to.
pub fn log_file() -> PathBuf {
    log_directory().join("uncached.log")
}

/// Under the temp dir in tests, which exercise code that logs and must not
/// write into the user's own log.
#[cfg(test)]
fn log_directory() -> PathBuf {
    std::env::temp_dir().join(format!("uncached-test-logs-{}", std::process::id()))
}

#[cfg(not(test))]
fn log_directory() -> PathBuf {
    platform_log_directory(std::env::consts::OS, |name| std::env::var_os(name))
        .unwrap_or_else(|| std::env::temp_dir().join("Uncached").join("logs"))
}

/// Where each platform keeps an application's logs: `~/Library/Logs`, which
/// Console.app lists, on macOS; `$XDG_STATE_HOME` (else `~/.local/state`) on
/// Linux; `%LOCALAPPDATA%` on Windows. `None` when the variable it needs is
/// unset.
fn platform_log_directory(
    os: &str,
    variable: impl Fn(&str) -> Option<std::ffi::OsString>,
) -> Option<PathBuf> {
    let from = |name: &str| {
        variable(name)
            .filter(|value| !value.is_empty())
            .map(PathBuf::from)
    };
    match os {
        "macos" => Some(from("HOME")?.join("Library").join("Logs").join("Uncached")),
        "windows" => Some(from("LOCALAPPDATA")?.join("Uncached").join("logs")),
        _ => from("XDG_STATE_HOME")
            .or_else(|| Some(from("HOME")?.join(".local").join("state")))
            .map(|state| state.join("uncached")),
    }
}

fn global() -> &'static Logger {
    static LOGGER: OnceLock<Logger> = OnceLock::new();
    LOGGER.get_or_init(|| Logger::at_path(log_file()))
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
    use super::{platform_log_directory, Logger};
    use std::ffi::OsString;
    use std::fs;
    use std::path::PathBuf;

    fn environment(pairs: &[(&str, &str)]) -> impl Fn(&str) -> Option<OsString> {
        let pairs: Vec<(String, String)> = pairs
            .iter()
            .map(|(name, value)| (name.to_string(), value.to_string()))
            .collect();
        move |name| {
            pairs
                .iter()
                .find(|(key, _)| key == name)
                .map(|(_, value)| OsString::from(value))
        }
    }

    #[test]
    fn logs_live_where_each_platform_keeps_them_not_in_the_temp_dir() {
        assert_eq!(
            platform_log_directory("macos", environment(&[("HOME", "/Users/a")])),
            Some(PathBuf::from("/Users/a/Library/Logs/Uncached"))
        );
        assert_eq!(
            platform_log_directory("linux", environment(&[("HOME", "/home/a")])),
            Some(PathBuf::from("/home/a/.local/state/uncached"))
        );
        assert_eq!(
            platform_log_directory(
                "linux",
                environment(&[("HOME", "/home/a"), ("XDG_STATE_HOME", "/s")])
            ),
            Some(PathBuf::from("/s/uncached"))
        );
        assert_eq!(
            platform_log_directory(
                "windows",
                environment(&[("LOCALAPPDATA", "C:/Users/a/AppData/Local")])
            ),
            Some(PathBuf::from("C:/Users/a/AppData/Local/Uncached/logs"))
        );
        assert_eq!(platform_log_directory("macos", environment(&[])), None);
    }

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
