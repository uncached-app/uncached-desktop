//! The category vocabulary, owned by the core.
//!
//! This module used to define its own copy of the enum, with a pair of
//! conversion functions bridging the two. That copy was a liability in three
//! ways, and adding a category to the core exposed all of them at once: it went
//! stale silently, its `Custom` variant serialized as `{"Custom":"x"}` where the
//! core's serializes as `"Custom:x"` — a wire divergence the UI would have
//! choked on the first time a custom provider shipped — and it invited the idea
//! that the desktop gets an opinion about what a category is.
//!
//! It does not. What can be found, and what it is called on the wire, is a core
//! decision. The re-export stays so callers keep a single import path, and so
//! this note has somewhere to live.

pub use uncached_core::Category;
