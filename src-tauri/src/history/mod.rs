//! What the machine looked like last time, and what has been reclaimed so far.
//!
//! Every other module here answers a question about the present. This one is
//! the only thing that lets the product say "since your last visit" or "you
//! reclaimed 238 GB", and both sentences are impossible to fake: they need a
//! record that outlives the window.
//!
//! Two files, two shapes, for two different reasons.
//!
//! The snapshot is a single overwritten document — only the last visit can be
//! compared against, so keeping more of them would be storing what nothing
//! reads. The cleanup log is append-only, because a total is the sum of what
//! happened and a rewritten file is a total that can silently drift.
//!
//! Neither file exists on Free. Not as a paywall on a computation, but because
//! persistence is the capability being sold: Free reads the machine fresh every
//! time, which is exactly what it does today, and nothing about the user's
//! filesystem is written down.
//!
//! Paths are the sensitive part of both, and both hold them. The snapshot needs
//! them because a per-project diff has nothing to join on otherwise. The log
//! records one per event because a report you can only read as a single running
//! total is a number, not a report: every question worth asking of a cleanup
//! history — which ecosystem, which workspace, was that me or a schedule — is a
//! dimension that has to have been written down at the time. `clear_history`
//! deletes both files, and nothing here leaves the machine.

mod model;
mod store;
mod summary;

#[cfg(test)]
use model::CLEANUP_SCHEMA_VERSION;
pub use model::{
    CleanupEvent, CleanupHistory, CleanupRecord, CleanupTotals, ProjectWeight, WorkspaceChange,
    WorkspaceSnapshot,
};
pub(crate) use model::{CLEANUP_LOG_FILE, SCHEMA_VERSION, SNAPSHOT_FILE};
pub use store::{freed_since, record_cleanup};
pub(crate) use store::{history_dir, read_cleanup_log, read_snapshot, write_atomically};
pub use summary::compare;
pub(crate) use summary::totals_from;

#[cfg(test)]
mod tests;
