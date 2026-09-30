//! LocalOS desktop binary.
//!
//! Wires core + platform + ui. At this stage it opens a Tauri window
//! and exposes a single demo command.

// Hide the console window on Windows release builds.
// Keep it visible in debug builds so logs are readable.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use localos_traits::AppPaths;

mod commands;

fn main() {
    // ─── Logging ────────────────────────────────────────────────
    // `mdns_sd=off` silences a benign shutdown race inside the
    // mdns-sd crate. See commit history for details.
    tracing_subscriber::fmt()
        .with_env_filter(
            tracing_subscriber::EnvFilter::try_from_default_env()
                .unwrap_or_else(|_| "info,mdns_sd=off".into()),
        )
        .init();

    tracing::info!(version = localos_core::version(), "LocalOS starting");

    // ─── Platform smoke test ────────────────────────────────────
    let paths = localos_platform::NativePaths::new().expect("NativePaths::new failed");
    tracing::info!(data_dir = ?paths.data_dir(), "data directory resolved");

    // ─── Tauri window ───────────────────────────────────────────
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![commands::greet])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}