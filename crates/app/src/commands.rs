//! Tauri commands exposed to the frontend.

use tauri::State;

use localos_traits::{AppPaths, Clipboard, Discovery, Firewall, PeerAd};

use crate::settings::Settings;
use crate::state::{AppState, LISTEN_PORT};

// ─── Status ──────────────────────────────────────────────────────

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

#[tauri::command]
pub fn get_status(state: State<'_, AppState>) -> Status {
    let clipboard_preview = match state.clipboard.get() {
        Ok(localos_traits::ClipboardItem::Text(s)) => {
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

// ─── Peers ───────────────────────────────────────────────────────

#[tauri::command]
pub async fn list_peers(state: State<'_, AppState>) -> Result<Vec<PeerAd>, String> {
    let guard = state.peers.read().await;
    let mut peers: Vec<PeerAd> = guard.values().cloned().collect();
    drop(guard);

    peers.sort_by(|a, b| a.name.cmp(&b.name));
    Ok(peers)
}

// ─── Settings ────────────────────────────────────────────────────

/// Return the current settings.
#[tauri::command]
pub fn get_settings(state: State<'_, AppState>) -> Settings {
    state.settings.read().unwrap().clone()
}

/// Persist new settings. Also re-advertises this peer over mDNS so
/// the new display name is visible to other peers immediately.
#[tauri::command]
pub fn save_settings(
    state: State<'_, AppState>,
    settings: Settings,
) -> Result<(), String> {
    // Trim and validate
    let display_name = settings.display_name.trim().to_string();
    if display_name.is_empty() {
        return Err("Display name cannot be empty".into());
    }
    if display_name.chars().count() > 64 {
        return Err("Display name must be 64 characters or fewer".into());
    }
        let settings = Settings {
        display_name,
        clipboard_sync_enabled: settings.clipboard_sync_enabled,
        demo_mode: settings.demo_mode,
        theme: settings.theme,
    };

    // Persist to disk first
    settings
        .save(&state.settings_path)
        .map_err(|e| format!("Failed to write settings: {e}"))?;

    // Update in-memory state
    {
        let mut guard = state.settings.write().unwrap();
        *guard = settings.clone();
    }

    // Re-advertise with the new display name. Best-effort: if mDNS
    // fails, log and continue (the setting is still saved).
    let ad = PeerAd {
        peer_id: state.self_peer_id.clone(),
        name: settings.display_name.clone(),
        session_id: None,
        port: LISTEN_PORT,
    };
    let _ = state.discovery.stop_advertise();
    if let Err(e) = state.discovery.advertise(&ad) {
        tracing::warn!(?e, "re-advertise after settings change failed");
    } else {
        tracing::info!(name = %settings.display_name, "re-advertised with new name");
    }

    Ok(())
}