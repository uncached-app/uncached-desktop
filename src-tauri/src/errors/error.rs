use thiserror::Error;

#[derive(Error, Debug)]
pub enum NukeError {
    #[error("Core contract error")]
    Core(uncached_core::CoreErrorInfo),

    #[error("IO error: {0}")]
    Io(#[from] std::io::Error),

    #[error("Recycle Bin error: {0}")]
    Trash(String),

    #[error("Target is too large for the Recycle Bin. Switch to permanent deletion in Settings to remove it.")]
    RecycleBinTooLarge,

    #[error("Path not found: {0}")]
    NotFound(String),

    #[error("Permission denied when accessing or deleting: {0}")]
    PermissionDenied(String),

    #[error("Scan cancelled by user")]
    ScanCancelled,

    #[error("Cleanup cancelled before deletion")]
    CleanupCancelled,

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
