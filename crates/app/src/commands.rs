//! Tauri commands exposed to the frontend.

use tauri::State;

use localos_traits::{AppPaths,Clipboard, Firewall, PeerAd};

use crate::state::AppState;

/// Version + identity + platform status. Shown in the header.
#[derive(serde::Serialize)]
pub struct Status {
    pub version: String,
    pub peer_id: String,
    pub data_dir: String,
    pub config_dir: String,
    pub firewall_status: String,
    pub clipboard_preview: Option<String>,
}

/// Return the current status of the app.
///
/// Reads the clipboard on every call. If it's empty or has only an
/// image, `clipboard_preview` is `None`.
#[tauri::command]
pub fn get_status(state: State<'_, AppState>) -> Status {
    let clipboard_preview = match state.clipboard.get() {
        Ok(localos_traits::ClipboardItem::Text(s)) => {
            // Truncate for display; never send the full payload to the UI.
            const MAX: usize = 80;
            let mut preview = s.chars().take(MAX).collect::<String>();
            if s.chars().count() > MAX {
                preview.push('…');
            }
            Some(preview)
        }
        _ => None,
    };

    Status {
        version: localos_core::version().to_string(),
        peer_id: state.self_peer_id.clone(),
        data_dir: state.paths.data_dir().display().to_string(),
        config_dir: state.paths.config_dir().display().to_string(),
        firewall_status: format!("{:?}", state.firewall.status()),
        clipboard_preview,
    }
}

/// Return all peers currently known to be on the LAN.
///
/// This is a snapshot; peers come and go. The frontend can subscribe
/// to the `peer-discovered` event to know when to refresh.
#[tauri::command]
pub async fn list_peers(state: State<'_, AppState>) -> Result<Vec<PeerAd>, String> {
    // Take the read lock, copy what we need, drop the guard before
    // returning. Holding it across an await would violate Rule §7.7.
    let guard = state.peers.read().await;
    let mut peers: Vec<PeerAd> = guard.values().cloned().collect();
    drop(guard);

    peers.sort_by(|a, b| a.name.cmp(&b.name));
    Ok(peers)
}