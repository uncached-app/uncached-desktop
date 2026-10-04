use crate::errors::{NukeError, NukeResult};
use crate::filesystem::paths::strip_extended_prefix;
use crate::models::target::ScanTarget;
use crate::scanner::get_default_providers;
use serde::Serialize;
use std::collections::{HashMap, HashSet};
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, AtomicU8, Ordering};
use std::sync::mpsc::{sync_channel, SyncSender, TrySendError};
use std::sync::{Arc, Mutex, OnceLock};
use std::time::Instant;
use tauri::{AppHandle, Emitter};

mod cleanup_control;
mod discovery;
mod events;
mod registry;
mod session;
mod sizing;
mod stats;
mod targets;
mod types;
mod walk;

pub use cleanup_control::*;
use discovery::*;
pub use events::*;
use registry::*;
#[cfg(test)]
use session::{providers_for_scan, scan_path};
use sizing::*;
use stats::*;
pub use types::*;
use walk::*;

pub struct ScanService;

#[cfg(test)]
mod tests;
