//! Cross-platform application paths.
//!
//! Resolves `%APPDATA%` on Windows, `~/.local/share` on Linux,
//! `~/Library/...` on macOS via the `directories` crate.

use directories::{ProjectDirs, UserDirs};
use localos_traits::{AppPaths, PlatformError};
use std::path::PathBuf;

/// Native implementation of [`AppPaths`].
pub struct NativePaths {
    proj: ProjectDirs,
}

impl NativePaths {
    /// Construct a `NativePaths`.
    ///
    /// Fails if the OS does not report a home directory.
    pub fn new() -> Result<Self, PlatformError> {
        let proj = ProjectDirs::from("dev", "LocalOS", "LocalOS")
            .ok_or_else(|| PlatformError::Other("no home directory".into()))?;
        Ok(Self { proj })
    }
}

impl AppPaths for NativePaths {
    fn config_dir(&self) -> PathBuf {
        self.proj.config_dir().to_path_buf()
    }

    fn data_dir(&self) -> PathBuf {
        self.proj.data_dir().to_path_buf()
    }

    fn cache_dir(&self) -> PathBuf {
        self.proj.cache_dir().to_path_buf()
    }

    fn default_download_dir(&self) -> PathBuf {
        UserDirs::new()
            .and_then(|u| u.download_dir().map(|p| p.to_path_buf()))
            .unwrap_or_else(|| self.proj.data_dir().join("downloads"))
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn constructs() {
        let paths = NativePaths::new().expect("NativePaths::new");
        assert!(!paths.config_dir().as_os_str().is_empty());
        assert!(!paths.data_dir().as_os_str().is_empty());
        assert!(!paths.cache_dir().as_os_str().is_empty());
        assert!(!paths.default_download_dir().as_os_str().is_empty());
    }
}
