//! mDNS-based peer discovery.
//!
//! Uses the `mdns-sd` crate. That crate abstracts away the OS-specific
//! mDNS implementation (Bonjour on Windows and macOS, avahi on Linux),
//! so this file does not need `#[cfg(target_os)]` blocks for v1.

use mdns_sd::{ServiceDaemon, ServiceEvent, ServiceInfo};
use std::sync::Mutex;
use tokio::sync::mpsc;

use localos_traits::{Discovery, PeerAd, PlatformError};

/// mDNS service type for LocalOS.
///
/// The trailing dot is required by the DNS-SD specification.
const SERVICE_TYPE: &str = "_localos._udp.local.";

/// Bounded buffer for incoming peer events.
///
/// If the caller is slow, mDNS events are dropped rather than growing
/// memory without bound (Rules §7.11).
const EVENT_BUFFER: usize = 64;

/// Native mDNS discovery.
pub struct NativeDiscovery {
    /// The mdns-sd daemon. Internally reference-counted, safe to clone.
    daemon: ServiceDaemon,

    /// Fullname of the currently advertised service, if any.
    ///
    /// `ServiceDaemon::unregister` requires the fullname (the fully
    /// qualified name including the service type), so we remember it.
    advertised_fullname: Mutex<Option<String>>,
}

impl NativeDiscovery {
    /// Construct a discovery instance.
    ///
    /// Starts the mdns-sd background thread.
    pub fn new() -> Result<Self, PlatformError> {
        let daemon = ServiceDaemon::new().map_err(map_err)?;
        Ok(Self {
            daemon,
            advertised_fullname: Mutex::new(None),
        })
    }
}

/// Convert an `mdns_sd::Error` into our `PlatformError`.
///
/// We do not `#[from]` this because `localos-traits` must not depend on
/// `mdns-sd` (Rules §3.5).
fn map_err(e: mdns_sd::Error) -> PlatformError {
    PlatformError::Other(format!("discovery: {e}"))
}

/// Extract a `PeerAd` from a resolved mDNS service.
///
/// Returns `None` if the required TXT properties are missing, which
/// means the service is not one of ours or is malformed.
fn peer_ad_from_service(info: &ServiceInfo) -> Option<PeerAd> {
    let peer_id = info.get_property_val_str("peer_id")?.to_string();
    let name = info.get_property_val_str("name")?.to_string();
    let session_id = info
        .get_property_val_str("session_id")
        .map(|s| s.to_string());
    let port = info.get_port();

    Some(PeerAd {
        peer_id,
        name,
        session_id,
        port,
    })
}

impl Discovery for NativeDiscovery {
    fn advertise(&self, ad: &PeerAd) -> Result<(), PlatformError> {
        // If we already advertised, unregister first. `mdns-sd` rejects
        // a duplicate registration with the same name.
        let mut guard = self
            .advertised_fullname
            .lock()
            .unwrap_or_else(|e| e.into_inner());
        if let Some(prev) = guard.take() {
            let _ = self.daemon.unregister(&prev);
        }

        // Build TXT properties. peer_id and name are required;
        // session_id is optional (present only when hosting).
        let mut props: Vec<(&str, &str)> =
            vec![("peer_id", ad.peer_id.as_str()), ("name", ad.name.as_str())];
        if let Some(sid) = &ad.session_id {
            props.push(("session_id", sid.as_str()));
        }

        let host_name = format!("{}.local.", ad.peer_id);

        let info = ServiceInfo::new(
            SERVICE_TYPE,
            &ad.peer_id,
            &host_name,
            "",
            ad.port,
            &props[..],
        )
        .map_err(map_err)?
        .enable_addr_auto();

        let fullname = info.get_fullname().to_string();
        self.daemon.register(info).map_err(map_err)?;
        *guard = Some(fullname);

        Ok(())
    }

    fn stop_advertise(&self) -> Result<(), PlatformError> {
        let mut guard = self
            .advertised_fullname
            .lock()
            .unwrap_or_else(|e| e.into_inner());
        if let Some(fullname) = guard.take() {
            self.daemon.unregister(&fullname).map_err(map_err)?;
        }
        Ok(())
    }

    fn browse(&self) -> Result<mpsc::Receiver<PeerAd>, PlatformError> {
        let events = self.daemon.browse(SERVICE_TYPE).map_err(map_err)?;
        let (tx, rx) = mpsc::channel::<PeerAd>(EVENT_BUFFER);

        // Spawn a plain OS thread, not a tokio task. This lets `browse`
        // be called from any context (sync or async). The thread exits
        // when the returned Receiver is dropped, because `blocking_send`
        // fails and we break the loop.
        std::thread::spawn(move || {
            while let Ok(event) = events.recv() {
                if let ServiceEvent::ServiceResolved(info) = event {
                    if let Some(ad) = peer_ad_from_service(&info) {
                        if tx.blocking_send(ad).is_err() {
                            // Caller dropped the receiver; stop.
                            break;
                        }
                    }
                }
                // Other event types (ServiceFound, ServiceRemoved,
                // ServiceResolved for non-LocalOS services, etc.) are
                // ignored. We only care about resolved LocalOS peers.
            }
        });

        Ok(rx)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn constructs() {
        NativeDiscovery::new().expect("NativeDiscovery::new");
    }

    #[test]
    fn browse_returns_receiver() {
        let disc = NativeDiscovery::new().unwrap();
        // Do not wait for events — this only proves the call succeeds
        // and hands back a receiver.
        let _rx = disc.browse().expect("browse should succeed");
    }

    #[test]
    fn stop_advertise_without_advertise_is_ok() {
        let disc = NativeDiscovery::new().unwrap();
        disc.stop_advertise()
            .expect("stop without prior advertise should be a no-op");
    }
}
