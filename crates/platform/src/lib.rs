//! LocalOS platform integrations.
//!
//! Implements the traits defined in `localos-traits` once per OS.

pub mod clipboard;
pub mod paths;

pub use clipboard::NativeClipboard;
pub use paths::NativePaths;