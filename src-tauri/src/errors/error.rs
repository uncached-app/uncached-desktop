use thiserror::Error;

#[derive(Error, Debug)]
pub enum NukeError {
    #[error("IO error: {0}")]
    Io(#[from] std::io::Error),

    #[error("Recycle bin error: {0}")]
    Trash(String),

    #[error("Item is too large for the Recycle Bin. Confirmation required for Permanent Nuke.")]
    RecycleBinTooLarge,

    #[error("Path not found: {0}")]
    NotFound(String),

    #[error("Permission denied when accessing or deleting: {0}")]
    PermissionDenied(String),

    #[error("Scan cancelled by user")]
    ScanCancelled,

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
