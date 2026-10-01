//! Clipboard implementation.
//!
//! Uses the `arboard` crate for cross-platform clipboard access.
//! Currently supports reading text and images, and writing text.
//! Real-time watching is not yet implemented; see `watch` for details.

use arboard::Clipboard as ArClipboard;
use localos_traits::{Clipboard, ClipboardItem, PlatformError};

/// Native clipboard backed by `arboard`.
///
/// A fresh `arboard::Clipboard` is created on each call. This avoids
/// holding an OS handle across threads, which is not safe on Linux X11
/// and can be flaky on Windows. The cost is negligible.
pub struct NativeClipboard;

impl NativeClipboard {
    /// Construct a `NativeClipboard`.
    ///
    /// Never fails — kept as `Result` for API symmetry with other
    /// platform types.
    pub fn new() -> Result<Self, PlatformError> {
        Ok(Self)
    }
}

/// Convert an `arboard::Error` into our `PlatformError`.
///
/// We do not `#[from]` this because `localos-traits` must not depend
/// on `arboard` (Rules §3.5).
fn map_err(e: arboard::Error) -> PlatformError {
    PlatformError::Other(format!("clipboard: {e}"))
}

impl Clipboard for NativeClipboard {
    fn get(&self) -> Result<ClipboardItem, PlatformError> {
        let mut cb = ArClipboard::new().map_err(map_err)?;

        // Try text first — that is the common case.
        if let Ok(text) = cb.get_text() {
            return Ok(ClipboardItem::Text(text));
        }

        // Fall back to image.
        if let Ok(img) = cb.get_image() {
            return Ok(ClipboardItem::Image(img.bytes.into_owned()));
        }

        Err(PlatformError::Other(
            "clipboard: no text or image available".into(),
        ))
    }

    fn set(&self, item: &ClipboardItem) -> Result<(), PlatformError> {
        let mut cb = ArClipboard::new().map_err(map_err)?;

        match item {
            ClipboardItem::Text(t) => cb.set_text(t.clone()).map_err(map_err),
            ClipboardItem::Image(_bytes) => {
                // arboard needs width and height to set an image.
                // Our trait does not carry them yet. Follow-up PR.
                Err(PlatformError::NotSupported)
            }
        }
    }

    fn watch(&self, _cb: Box<dyn Fn(ClipboardItem) + Send + Sync>) -> Result<(), PlatformError> {
        // `arboard` does not expose clipboard change events.
        // A real implementation would poll on an interval, or use
        // OS-specific event hooks. Follow-up PR.
        Err(PlatformError::NotSupported)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    /// Round-trip: set text, then get it back.
    ///
    /// This test touches the real OS clipboard. It is safe to run
    /// locally but is ignored by default because CI runners may not
    /// have a clipboard.
    #[test]
    #[ignore = "touches real OS clipboard; run with `cargo test -- --ignored`"]
    fn text_roundtrip() {
        let cb = NativeClipboard::new().unwrap();
        let payload = "localos-clipboard-test";

        cb.set(&ClipboardItem::Text(payload.into())).unwrap();
        let got = cb.get().unwrap();

        match got {
            ClipboardItem::Text(s) => assert_eq!(s, payload),
            ClipboardItem::Image(_) => panic!("expected text, got image"),
        }
    }

    /// `watch` is expected to return `NotSupported` in v1.
    #[test]
    fn watch_returns_not_supported() {
        let cb = NativeClipboard::new().unwrap();
        let result = cb.watch(Box::new(|_| {}));
        assert!(matches!(result, Err(PlatformError::NotSupported)));
    }
}
