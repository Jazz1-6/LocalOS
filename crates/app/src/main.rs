//! LocalOS desktop binary.

#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::collections::HashMap;
use std::sync::{Arc, RwLock};

use tauri::{Emitter, Manager};
use tokio::sync::RwLock as TokioRwLock;

use localos_platform::{NativeClipboard, NativeDiscovery, NativeFirewall, NativePaths};
use localos_traits::{AppPaths, Discovery, PeerAd};

mod commands;
mod settings;
mod state;

use settings::Settings;
use state::{AppState, LISTEN_PORT};

fn main() {
    tracing_subscriber::fmt()
        .with_env_filter(
            tracing_subscriber::EnvFilter::try_from_default_env()
                .unwrap_or_else(|_| "info,mdns_sd=off".into()),
        )
        .init();

    tracing::info!(version = localos_core::version(), "LocalOS starting");

    tauri::Builder::default()
        .setup(setup)
        .invoke_handler(tauri::generate_handler![
            commands::get_status,
            commands::list_peers,
            commands::get_settings,
            commands::save_settings,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

fn setup(app: &mut tauri::App) -> Result<(), Box<dyn std::error::Error>> {
    // ─── Platform services ──────────────────────────────────────
    let paths = NativePaths::new()?;
    let firewall = NativeFirewall::new()?;
    let clipboard = NativeClipboard::new()?;
    let discovery = NativeDiscovery::new()?;

    tracing::info!(data_dir = ?paths.data_dir(), "platform services ready");

    // ─── Settings ───────────────────────────────────────────────
    let settings_path = paths.config_dir().join("settings.json");
    let settings = Settings::load(&settings_path);
    tracing::info!(?settings, ?settings_path, "settings loaded");

    // ─── Identity ───────────────────────────────────────────────
    let pid = std::process::id();
    let self_peer_id = format!("localos-{pid}");

    // ─── Advertise ourselves ────────────────────────────────────
    let self_ad = PeerAd {
        peer_id: self_peer_id.clone(),
        name: settings.display_name.clone(),
        session_id: None,
        port: LISTEN_PORT,
    };
    discovery.advertise(&self_ad)?;
    tracing::info!(
        peer_id = %self_peer_id,
        name = %settings.display_name,
        "advertising self"
    );

    // ─── Peers map + background listener ────────────────────────
    let peers: Arc<TokioRwLock<HashMap<String, PeerAd>>> =
        Arc::new(TokioRwLock::new(HashMap::new()));

    let mut rx = discovery.browse()?;
    let peers_for_task = peers.clone();
    let app_handle = app.handle().clone();
    let self_id_for_task = self_peer_id.clone();

    tauri::async_runtime::spawn(async move {
        tracing::info!("discovery listener started");
        while let Some(peer) = rx.recv().await {
            if peer.peer_id == self_id_for_task {
                continue;
            }
            tracing::info!(?peer, "peer discovered");

            {
                let mut guard = peers_for_task.write().await;
                guard.insert(peer.peer_id.clone(), peer.clone());
            }

            let _ = app_handle.emit("peer-discovered", &peer);
        }
        tracing::warn!("discovery listener stopped");
    });

    // ─── Register state ─────────────────────────────────────────
    app.manage(AppState {
        discovery,
        clipboard,
        firewall,
        paths,
        self_peer_id,
        peers,
        settings: Arc::new(RwLock::new(settings)),
        settings_path,
    });

    Ok(())
}
