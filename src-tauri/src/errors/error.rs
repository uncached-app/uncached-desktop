use thiserror::Error;

#[derive(Error, Debug)]
pub enum NukeError {
    #[error("Core contract error")]
    Core(uncached_core::CoreErrorInfo),

    #[error("IO error: {0}")]
    Io(#[from] std::io::Error),

    #[error("Path not found: {0}")]
    NotFound(String),

    #[error("Permission denied when accessing or deleting: {0}")]
    PermissionDenied(String),

    #[error("Scan cancelled by user")]
    ScanCancelled,

    #[error("Cleanup cancelled before deletion")]
    CleanupCancelled,

    /// The tool that owns this directory is running.
    ///
    /// Not a permission problem and not a mistake about what the directory is:
    /// the cache is disposable, and this is the one moment it is not. Removing
    /// it now would take files the running process still has open, which does
    /// not free the space and does break what was running.
    #[error("{0} is running. Close it and scan again — removing this now would break it.")]
    InUse(String),

    #[error("Internal error: {0}")]
    Internal(String),
}

pub type NukeResult<T> = Result<T, NukeError>;

impl serde::Serialize for NukeError {
    fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: serde::Serializer,
    {
        serializer.serialize_str(&self.to_string())
    }
}
