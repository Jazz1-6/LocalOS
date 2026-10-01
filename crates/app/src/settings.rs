//! User-configurable settings, persisted as JSON.
//!
//! Stored at `<config_dir>/settings.json`. Written atomically: first
//! to a sibling `.tmp` file, then renamed over the target.
//!
//! Missing or malformed files fall back to defaults. We never fail
//! to start because of a bad settings file.

use std::io::Write;
use std::path::Path;

use serde::{Deserialize, Serialize};

/// User settings. All fields have sensible defaults.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(default)]
pub struct Settings {
    /// Name shown to other peers on the LAN.
    pub display_name: String,

    /// Whether this device participates in ghost clipboard sync.
    /// Off by default — opt-in.
    pub clipboard_sync_enabled: bool,
}

impl Default for Settings {
    fn default() -> Self {
        Self {
            display_name: default_display_name(),
            clipboard_sync_enabled: false,
        }
    }
}

/// Best-effort default name from the OS hostname.
fn default_display_name() -> String {
    std::env::var("COMPUTERNAME")
        .or_else(|_| std::env::var("HOSTNAME"))
        .ok()
        .filter(|s| !s.is_empty())
        .map(|s| format!("LocalOS on {s}"))
        .unwrap_or_else(|| "LocalOS".to_string())
}

impl Settings {
    /// Load settings from disk. Returns defaults if the file is missing
    /// or malformed. Never fails.
    pub fn load(path: &Path) -> Self {
        match std::fs::read_to_string(path) {
            Ok(text) => serde_json::from_str(&text).unwrap_or_else(|e| {
                tracing::warn!(?e, "settings file malformed; using defaults");
                Self::default()
            }),
            Err(e) if e.kind() == std::io::ErrorKind::NotFound => Self::default(),
            Err(e) => {
                tracing::warn!(?e, "settings read failed; using defaults");
                Self::default()
            }
        }
    }

    /// Persist settings to disk atomically.
    ///
    /// Writes to a sibling `.tmp` file first, then renames over the
    /// destination. On Windows, `fs::rename` replaces the target if
    /// it exists (MOVEFILE_REPLACE_EXISTING).
    pub fn save(&self, path: &Path) -> std::io::Result<()> {
        if let Some(dir) = path.parent() {
            std::fs::create_dir_all(dir)?;
        }
        let text = serde_json::to_string_pretty(self)
            .map_err(|e| std::io::Error::new(std::io::ErrorKind::Other, e))?;

        let tmp = path.with_extension("json.tmp");
        {
            let mut f = std::fs::File::create(&tmp)?;
            f.write_all(text.as_bytes())?;
            f.sync_all()?;
        }
        std::fs::rename(&tmp, path)?;
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn default_has_reasonable_values() {
        let s = Settings::default();
        assert!(!s.display_name.is_empty());
        assert!(!s.clipboard_sync_enabled);
    }

    #[test]
    fn round_trip() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("settings.json");

        let original = Settings {
            display_name: "Test Device".to_string(),
            clipboard_sync_enabled: true,
        };
        original.save(&path).unwrap();

        let loaded = Settings::load(&path);
        assert_eq!(loaded.display_name, "Test Device");
        assert!(loaded.clipboard_sync_enabled);
    }

    #[test]
    fn missing_file_returns_defaults() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("does-not-exist.json");
        let s = Settings::load(&path);
        assert_eq!(s.display_name, Settings::default().display_name);
    }

    #[test]
    fn malformed_file_returns_defaults() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("settings.json");
        std::fs::write(&path, "not json at all {{{").unwrap();
        let s = Settings::load(&path);
        assert_eq!(s.display_name, Settings::default().display_name);
    }
}