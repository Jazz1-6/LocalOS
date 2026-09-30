//! LocalOS desktop binary.
//!
//! Wires core + platform + ui. Opens a Tauri window, advertises this
//! peer over mDNS, and exposes platform services to the frontend.

#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::collections::HashMap;
use std::sync::Arc;

use tauri::{Emitter, Manager};
use tokio::sync::RwLock;

use localos_platform::{NativeClipboard, NativeDiscovery, NativeFirewall, NativePaths};
use localos_traits::{AppPaths, Discovery, PeerAd};

mod commands;
mod state;

use state::AppState;

/// QUIC listen port advertised over mDNS. Temporary until the session
/// layer exists — Engineer A will replace this with the real port.
const LISTEN_PORT: u16 = 51000;

fn main() {
    // `mdns_sd=off` silences a benign shutdown race inside the crate.
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
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

/// Build all platform services, start discovery, register state.
fn setup(app: &mut tauri::App) -> Result<(), Box<dyn std::error::Error>> {
    // ─── Platform services ──────────────────────────────────────
    let paths = NativePaths::new()?;
    let firewall = NativeFirewall::new()?;
    let clipboard = NativeClipboard::new()?;
    let discovery = NativeDiscovery::new()?;

    tracing::info!(data_dir = ?paths.data_dir(), "platform services ready");

    // ─── Identity ───────────────────────────────────────────────
    // Temporary: a fixed peer id. Engineer A's identity module will
    // derive this from an Ed25519 keypair.
    let self_peer_id = "localos-local".to_string();

    // ─── Advertise ourselves ────────────────────────────────────
    let self_ad = PeerAd {
        peer_id: self_peer_id.clone(),
        name: "LocalOS (this device)".to_string(),
        session_id: None,
        port: LISTEN_PORT,
    };
    discovery.advertise(&self_ad)?;
    tracing::info!(peer_id = %self_peer_id, "advertising self");

    // ─── Peers map + background listener ────────────────────────
    let peers: Arc<RwLock<HashMap<String, PeerAd>>> = Arc::new(RwLock::new(HashMap::new()));

    let mut rx = discovery.browse()?;
    let peers_for_task = peers.clone();
    let app_handle = app.handle().clone();
    let self_id_for_task = self_peer_id.clone();

    tauri::async_runtime::spawn(async move {
        tracing::info!("discovery listener started");
        while let Some(peer) = rx.recv().await {
            if peer.peer_id == self_id_for_task {
                // mDNS echoes our own advertisement. Ignore it.
                continue;
            }
            tracing::info!(?peer, "peer discovered");

            {
                let mut guard = peers_for_task.write().await;
                guard.insert(peer.peer_id.clone(), peer.clone());
            } // guard dropped here, before any await below

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
    });

    Ok(())
}