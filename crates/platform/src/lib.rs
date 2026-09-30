//! LocalOS platform integrations.
//!
//! Implements the traits defined in `localos-traits` once per OS.

pub mod clipboard;
pub mod discovery;
pub mod firewall;
pub mod paths;

pub use clipboard::NativeClipboard;
pub use discovery::NativeDiscovery;
pub use firewall::NativeFirewall;
pub use paths::NativePaths;