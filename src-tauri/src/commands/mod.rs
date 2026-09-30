pub mod cancel;
pub mod clean;
pub mod dependencies;
pub mod duplicates;
pub mod entitlements;
pub mod git;
pub mod history;
pub mod license;
pub mod locate;
pub mod orphans;
pub mod scan;
pub mod settings;
pub mod storage;
pub mod theme;
pub mod window;
pub mod workspace;

pub use clean::cleanup_capabilities;
