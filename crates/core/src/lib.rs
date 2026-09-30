//! LocalOS core engine.
//!
//! 100% OS-agnostic. Never imports `localos-platform`.

#![deny(unsafe_code)]

/// Placeholder — filled in by Engineer A in Phase 1.
pub fn version() -> &'static str {
    env!("CARGO_PKG_VERSION")
}
