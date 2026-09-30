//! LocalOS desktop binary.
//!
//! Wires core + platform + ui. At this stage it is a startup smoke test:
//! it constructs every platform implementation, runs a firewall check,
//! reads the clipboard, and listens for mDNS peers for 5 seconds.

use std::time::Duration;

use localos_platform::{
    NativeClipboard, NativeDiscovery, NativeFirewall, NativePaths,
};
use localos_traits::{AppPaths, Clipboard, Discovery, Firewall, PeerAd};

/// QUIC listen port. Temporary until Engineer A's session layer exists.
const LISTEN_PORT: u16 = 51000;

/// How long to listen for peers before exiting. Temporary.
const BROWSE_WINDOW: Duration = Duration::from_secs(5);

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    // ─── Logging ────────────────────────────────────────────────
    tracing_subscriber::fmt()
        .with_env_filter(
            tracing_subscriber::EnvFilter::try_from_default_env()
                .unwrap_or_else(|_| "info,mdns_sd=off".into()),
        )
        .init();

    tracing::info!(version = localos_core::version(), "LocalOS starting");

    // ─── 1. Paths ───────────────────────────────────────────────
    let paths = NativePaths::new()?;
    tracing::info!(
        config = ?paths.config_dir(),
        data = ?paths.data_dir(),
        cache = ?paths.cache_dir(),
        downloads = ?paths.default_download_dir(),
        "paths resolved"
    );

    // ─── 2. Firewall ────────────────────────────────────────────
    let firewall = NativeFirewall::new()?;
    firewall.ensure_allowed()?;
    tracing::info!(status = ?firewall.status(), "firewall check passed");

    // ─── 3. Clipboard ───────────────────────────────────────────
    let clipboard = NativeClipboard::new()?;
    match clipboard.get() {
        Ok(item) => tracing::info!(?item, "clipboard read"),
        Err(e) => tracing::warn!(
            error = %e,
            "clipboard read failed (expected if empty)"
        ),
    }

    // ─── 4. Discovery ───────────────────────────────────────────
    let discovery = NativeDiscovery::new()?;
    let self_peer_id = "localos-dev-1".to_string();
    let ad = PeerAd {
        peer_id: self_peer_id.clone(),
        name: "localos-dev".to_string(),
        session_id: None,
        port: LISTEN_PORT,
    };
    discovery.advertise(&ad)?;
    tracing::info!(peer_id = %self_peer_id, "advertising self via mDNS");

    let mut rx = discovery.browse()?;
    tracing::info!(window_secs = BROWSE_WINDOW.as_secs(), "listening for peers");

    let deadline = tokio::time::sleep(BROWSE_WINDOW);
    tokio::pin!(deadline);

    let mut discovered = 0u32;
    loop {
        tokio::select! {
            _ = &mut deadline => break,
            msg = rx.recv() => match msg {
                Some(peer) => {
                    // Ignore ourselves — mDNS loops back our own ad.
                    if peer.peer_id != self_peer_id {
                        discovered += 1;
                        tracing::info!(?peer, "peer discovered");
                    }
                }
                None => break,
            }
        }
    }

    discovery.stop_advertise()?;
    tracing::info!(peers_found = discovered, "shutdown clean");

    println!(
        "LocalOS v{} — startup complete, {} peer(s) found",
        localos_core::version(),
        discovered
    );
    Ok(())
}