//! Shared application state, injected into every Tauri command.

use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::{Arc, RwLock};

use tokio::sync::RwLock as TokioRwLock;

use localos_platform::{NativeClipboard, NativeDiscovery, NativeFirewall, NativePaths};
use localos_traits::PeerAd;

use crate::settings::Settings;

/// QUIC listen port advertised over mDNS. Temporary — Engineer A
/// will replace this with the real port when the session layer ships.
pub const LISTEN_PORT: u16 = 51000;

/// All long-lived services the UI needs to talk to.
pub struct AppState {
    /// mDNS discovery daemon.
    pub discovery: NativeDiscovery,

    /// System clipboard.
    pub clipboard: NativeClipboard,

    /// Firewall check.
    pub firewall: NativeFirewall,

    /// OS application paths.
    pub paths: NativePaths,

    /// This peer's own ID. Filtered out of the peer list.
    pub self_peer_id: String,

    /// Peers currently seen on the LAN, keyed by peer_id.
    pub peers: Arc<TokioRwLock<HashMap<String, PeerAd>>>,

    /// User-configurable settings, shared mutable state.
    pub settings: Arc<RwLock<Settings>>,

    /// On-disk path of the settings file.
    pub settings_path: PathBuf,
}
