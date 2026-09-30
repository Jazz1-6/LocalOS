//! Tauri commands exposed to the frontend.
//!
//! Each command is a plain function annotated with `#[tauri::command]`.
//! They run on Tauri's async runtime; for the moment they are all
//! synchronous because nothing they do is I/O bound.

/// Return a greeting for the given name.
///
/// Temporary demo command — proves the Rust ↔ JS bridge works end to end.
#[tauri::command]
pub fn greet(name: &str) -> String {
    format!("Hello, {name}! From Rust, running locally.")
}