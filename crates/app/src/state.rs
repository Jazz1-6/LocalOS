//! Shared application state, injected into every Tauri command.
//!
//! Built once in `main.rs` during Tauri's `setup` hook and managed
//! by the Tauri runtime. Commands access it via `State<'_, AppState>`.

use std::collections::HashMap;
use std::sync::Arc;

use tokio::sync::RwLock;

use localos_platform::{NativeClipboard, NativeDiscovery, NativeFirewall, NativePaths};
use localos_traits::PeerAd;

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
    ///
    /// A `RwLock` because the background discovery task writes and
    /// Tauri commands read. Never held across an `.await` (Rules §7.7).
    pub peers: Arc<RwLock<HashMap<String, PeerAd>>>,
}