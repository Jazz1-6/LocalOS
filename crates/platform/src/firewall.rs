//! Firewall integration.
//!
//! v1 does not modify OS firewall rules. On Windows, macOS, and Linux,
//! adding an inbound allow rule requires elevated privileges and an
//! OS-specific API (Windows Firewall COM, macOS `pfctl`, Linux
//! `ufw`/`firewalld`). None of those are safe or honest to invoke
//! silently from an application.
//!
//! Instead:
//!
//! - `ensure_allowed` verifies we can create a UDP socket. This catches
//!   obvious misconfigurations (no networking stack, permissions) early.
//! - `status` returns `Unknown`. The UI must treat this as "expect an
//!   OS prompt the first time we listen on a port".
//!
//! A follow-up PR may add elevated, opt-in firewall rule creation.

use localos_traits::{Firewall, FirewallStatus, PlatformError};

/// Native firewall integration.
pub struct NativeFirewall;

impl NativeFirewall {
    /// Construct a `NativeFirewall`.
    ///
    /// Never fails — kept as `Result` for API symmetry with other
    /// platform types.
    pub fn new() -> Result<Self, PlatformError> {
        Ok(Self)
    }
}

impl Firewall for NativeFirewall {
    fn ensure_allowed(&self) -> Result<(), PlatformError> {
        // Bind to an ephemeral UDP port to prove the socket layer works.
        // We immediately drop the socket; we are not reserving anything.
        //
        // This catches real failures: missing networking stack, denied
        // syscalls in a sandbox, etc. It does not prove the firewall
        // will allow inbound traffic — nothing portable can prove that.
        let socket = std::net::UdpSocket::bind("0.0.0.0:0").map_err(|e| {
            PlatformError::Other(format!("firewall: udp bind check failed: {e}"))
        })?;
        drop(socket);
        Ok(())
    }

    fn status(&self) -> FirewallStatus {
        // We cannot reliably determine firewall state without elevated
        // APIs. Returning `Unknown` forces the UI to warn the user
        // rather than promise anything false.
        FirewallStatus::Unknown
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn constructs() {
        NativeFirewall::new().expect("NativeFirewall::new");
    }

    #[test]
    fn ensure_allowed_succeeds_on_localhost() {
        let fw = NativeFirewall::new().unwrap();
        fw.ensure_allowed()
            .expect("udp bind should succeed in a normal environment");
    }

    #[test]
    fn status_is_unknown_in_v1() {
        let fw = NativeFirewall::new().unwrap();
        assert_eq!(fw.status(), FirewallStatus::Unknown);
    }
}