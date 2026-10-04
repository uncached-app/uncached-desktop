//! The running figures a scan reports as it goes.

/// Which half of a scan is running.
///
/// A scan reads two places that have nothing to do with each other: the folders
/// the user chose, and the tool caches in their home directory. The second is
/// not a continuation of the first — the directory counter stops, the paths
/// stop belonging to any project — so the screen is told which one it is
/// watching rather than presenting both as one long walk.
#[derive(Default, Clone, Copy, PartialEq, Eq)]
pub(super) enum ScanPhase {
    #[default]
    Workspace,
    Caches,
}

impl ScanPhase {
    pub(super) fn as_wire(self) -> &'static str {
        match self {
            Self::Workspace => "workspace",
            Self::Caches => "caches",
        }
    }
}

#[derive(Default)]
pub(super) struct ScanStats {
    pub(super) directories_scanned: u64,
    pub(super) targets_found: u64,
    pub(super) total_bytes_found: u64,
    pub(super) phase: ScanPhase,
    /// Folders the walk was not allowed to open, summed across every root.
    ///
    /// Recorded rather than only logged: the counts beside it are short by
    /// whatever is inside them, and a total the user cannot tell is partial is
    /// the one thing the scan must not report.
    pub(super) unreadable: u64,
}
