//! Shared trait definitions for LocalOS.
//!
//! This crate contains no OS-specific code and no `#[cfg(target_os)]`.
//! Both `localos-core` and `localos-platform` depend on this crate.

use std::path::PathBuf;
use tokio::sync::mpsc;

/// Advertised peer on the LAN.
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct PeerAd {
    pub peer_id: String,
    pub name: String,
    pub session_id: Option<String>,
    pub port: u16,
}

/// Clipboard payload.
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub enum ClipboardItem {
    Text(String),
    Image(Vec<u8>),
}

/// Firewall state.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum FirewallStatus {
    Allowed,
    Denied,
    Unknown,
}

/// Platform-layer error.
#[derive(Debug, thiserror::Error)]
pub enum PlatformError {
    #[error("not supported on this platform")]
    NotSupported,
    #[error("io error: {0}")]
    Io(#[from] std::io::Error),
    #[error("other: {0}")]
    Other(String),
}

/// mDNS discovery.
pub trait Discovery: Send + Sync {
    fn advertise(&self, ad: &PeerAd) -> Result<(), PlatformError>;
    fn stop_advertise(&self) -> Result<(), PlatformError>;
    fn browse(&self) -> Result<mpsc::Receiver<PeerAd>, PlatformError>;
}

/// System clipboard.
pub trait Clipboard: Send + Sync {
    fn get(&self) -> Result<ClipboardItem, PlatformError>;
    fn set(&self, item: &ClipboardItem) -> Result<(), PlatformError>;
    fn watch(&self, cb: Box<dyn Fn(ClipboardItem) + Send + Sync>) -> Result<(), PlatformError>;
}

/// Cross-platform application paths.
pub trait AppPaths: Send + Sync {
    fn config_dir(&self) -> PathBuf;
    fn data_dir(&self) -> PathBuf;
    fn cache_dir(&self) -> PathBuf;
    fn default_download_dir(&self) -> PathBuf;
}

/// Firewall integration.
pub trait Firewall: Send + Sync {
    fn ensure_allowed(&self) -> Result<(), PlatformError>;
    fn status(&self) -> FirewallStatus;
}
