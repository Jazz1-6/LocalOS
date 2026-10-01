# ThreatModel.md — LocalOS v1

> What LocalOS defends against, what it explicitly does not, and why.
>
> Status: v1 Specification
> Version: 1.0
> Audience: engineers, reviewers, security auditors

---

## Table of Contents

1. Purpose
2. Scope
3. System Model
4. Trust Boundaries
5. Assets
6. Adversaries In Scope
7. Adversaries Out of Scope
8. Attack Surface
9. Mitigations by Threat
10. Residual Risk
11. Review & Updates

---

## 1. Purpose

This document defines the security posture of LocalOS v1. It is
written for engineers implementing the protocol, reviewers auditing
PRs, and any user evaluating whether LocalOS is safe for their
environment.

Where the protocol defines *how* things work, this document defines
*what we are defending against* and *what we accept as out of scope*.

If a threat is not listed here as in-scope, we do not defend against
it. That is a deliberate choice, not an oversight.

---

## 2. Scope

**In scope for v1:**

- Two or more peers on the same local network
- Untrusted or shared LAN environments (hostels, classrooms, cafés)
- Peers running the same protocol version
- Standard OS-level file permissions and process isolation

**Out of scope for v1:**

- Internet-facing deployments
- Cross-LAN communication (no relay, no NAT traversal)
- Mobile clients
- Multi-tenant or server-side hosting

---

## 3. System Model

LocalOS is a **peer-to-peer desktop application**. Each device runs
one process. Peers find each other via mDNS on the same subnet,
establish encrypted sessions, and exchange files, messages, and
clipboard entries.
┌──────────────┐ ┌──────────────┐ ┌──────────────┐
│ Peer A │ │ Peer B │ │ Peer C │
│ (Windows) │◄───────►│ (macOS) │◄───────►│ (Linux) │
└──────┬───────┘ QUIC └──────┬───────┘ QUIC └──────┬───────┘
│ │ │
└────────────────────────┴────────────────────────┘
Same LAN subnet
No internet, no relay

text

There is no server. There is no cloud. There is no central authority.

---

## 4. Trust Boundaries

### 4.1 What we trust

| Component            | Trust level | Rationale                          |
|----------------------|-------------|-------------------------------------|
| Local OS             | High        | If the OS is compromised, we're done |
| Rust standard library | High       | Audited, widely deployed           |
| `rustls`, `quinn`    | High        | Audited crypto and transport       |
| `ed25519-dalek`      | High        | Widely audited signature library   |
| `blake3`             | High        | Author designed BLAKE2 and BLAKE3  |
| Local user           | High        | They control the device            |

### 4.2 What we do NOT trust

| Component            | Trust level | Rationale                          |
|----------------------|-------------|-------------------------------------|
| Any peer             | Zero        | Malicious peer on the same LAN is in scope |
| Network traffic      | Zero        | Assume passive and active attackers |
| mDNS advertisements  | Zero        | Anyone can spoof                  |
| Filenames            | Zero        | May contain traversal              |
| Peer-provided data   | Zero        | Everything is untrusted input     |
| Session join code    | Low         | Shared secret with ~30 bits entropy |

### 4.3 Boundary crossings

Data crosses a trust boundary whenever it:

1. Arrives from a peer over the network (any message, any stream)
2. Is read from a file chosen by a peer (manifest entries, filenames)
3. Is stored on disk based on peer input (received files)
4. Is displayed in the UI based on peer input (names, messages)

**Every boundary crossing requires validation.** Rules.md §5.4.

---

## 5. Assets

What we are protecting:

| Asset                | Sensitivity | Impact if compromised          |
|----------------------|-------------|---------------------------------|
| File contents (in transit) | High  | Disclosure, tampering           |
| File contents (at rest)   | High  | Disclosure                     |
| Chat messages        | Medium      | Disclosure, impersonation      |
| Clipboard payloads   | Medium      | Disclosure of passwords, code  |
| Peer identity keys   | High        | Impersonation                  |
| Session join codes   | Medium      | Unauthorized session access    |
| Local device paths   | Low         | Information disclosure         |
| Network topology     | Low         | Information disclosure         |

---

## 6. Adversaries In Scope

### 6.1 Malicious peer on the same LAN

A device on the same subnet running a modified or hostile client.

**Capabilities:**

- Send any malformed message
- Attempt to spoof mDNS advertisements
- Try to join sessions with guessed codes
- Send files with malicious filenames
- Attempt to exhaust memory or disk
- Attempt replay attacks within a session

**Goal (assumed):** disrupt, extract, or impersonate.

### 6.2 Passive network observer

A device on the same subnet capturing traffic (Wi-Fi monitor mode,
promiscuous Ethernet).

**Capabilities:**

- See all broadcast mDNS
- See packet metadata (peers, ports, timing)
- **Cannot** see encrypted payloads (QUIC + TLS 1.3)

**Goal (assumed):** passive reconnaissance.

### 6.3 Unprivileged local attacker

A non-admin user account on the same device.

**Capabilities:**

- Read files the local user can read
- Attempt to read LocalOS's config/data directories
- Modify user-owned files

**Goal (assumed):** privacy violation, tamper.

### 6.4 Dishonest peer

A peer who has valid credentials but acts in bad faith.

**Capabilities:**

- Ignore protocol rules
- Claim false identity (within session)
- Drop or forge messages
- Send chunks that fail verification

**Goal (assumed):** data loss, corruption, impersonation.

---

## 7. Adversaries Out of Scope

Explicitly **not** defended against in v1:

### 7.1 Nation-state adversaries

If a nation-state targets you, LocalOS is not the right tool. Use
Signal, Tor, and an air-gapped machine.

### 7.2 Physical device compromise

If an attacker has physical access to your unlocked device, they
have your files. LocalOS does not attempt to defend against this.

### 7.3 Supply-chain attacks

If a dependency is backdoored, we are compromised. We mitigate by
using well-audited crates and keeping dependencies minimal, but we
do not audit every transitive dependency.

### 7.4 Side-channel attacks

Timing, cache, and power analysis against Ed25519 or TLS 1.3 are
out of scope. We rely on the audited implementations to handle these.

### 7.5 Root/admin compromise

If an attacker has admin/root on your device, they can read your
keys, files, and memory. Nothing we do at the application layer
helps.

### 7.6 Traffic analysis

We do not hide metadata: peer identities, message timings, message
sizes. An observer on the LAN can infer who is talking to whom,
when, and roughly how much. This is acceptable for the LAN use case.

### 7.7 DoS from a peer with more resources

A peer with a faster network or CPU can flood us. We apply
backpressure and bounded queues, but a determined attacker with
more resources can degrade performance. This is out of scope for
v1.

---

## 8. Attack Surface

### 8.1 Network

| Surface              | Exposure    | Mitigation                       |
|----------------------|-------------|-----------------------------------|
| UDP 5353 (mDNS)      | Broadcast   | Read-only parsing, no state       |
| UDP 51000 (QUIC)     | Inbound     | TLS 1.3, handshake required      |
| Discovery metadata   | Broadcast   | Only non-sensitive fields         |

### 8.2 Input parsing

| Surface              | Exposure    | Mitigation                       |
|----------------------|-------------|-----------------------------------|
| Message headers      | Network     | Length-checked, version-checked   |
| Message payloads     | Network     | Schema-validated, size-bounded    |
| Filenames            | Peer data   | Sanitized, traversal rejected     |
| Manifest entries     | Peer data   | Verified, hashes checked          |
| Session join codes   | User input  | Bounded length, server-validated  |
| Clipboard payloads   | Peer data   | Size-capped, TTL, opt-in          |
| Chat messages        | Peer data   | Size-capped, signature-verified   |

### 8.3 Local storage

| Surface              | Exposure    | Mitigation                       |
|----------------------|-------------|-----------------------------------|
| SQLite database      | User-owned  | OS permissions, no secrets inside |
| Settings file        | User-owned  | No secrets inside                 |
| Received files       | User-owned  | Scoped to destination, atomic write |
| Temp files (`.part`) | User-owned  | Cleaned on startup, paired with record |

### 8.4 Cryptography

| Surface              | Exposure    | Mitigation                       |
|----------------------|-------------|-----------------------------------|
| TLS handshake        | Network     | rustls, TLS 1.3 only             |
| Ed25519 signatures   | Peer data   | ed25519-dalek, domain-separated   |
| BLAKE3 hashes        | Peer data   | Constant-time comparison          |
| Join codes           | User input  | Bounded length                    |

---

## 9. Mitigations by Threat

### 9.1 Message tampering

**Threat:** peer modifies bytes in transit.

**Mitigation:** TLS 1.3 provides authenticated encryption. Any
tampering fails MAC verification and the connection closes.

### 9.2 Message forgery

**Threat:** attacker sends a message claiming to be another peer.

**Mitigation:** every peer proves possession of its Ed25519 private
key during handshake. Chat messages carry per-message signatures.
Messages without valid signatures are rejected.

### 9.3 Replay attacks

**Threat:** attacker replays a previously-captured message.

**Mitigation:**

- Session keys are ephemeral per connection (TLS 1.3)
- Chat messages carry timestamps and message IDs
- Duplicate message IDs within a session are ignored
- Advertisements have bounded TTLs

### 9.4 Path traversal

**Threat:** peer sends a manifest with a filename like
`../../../../etc/passwd`.

**Mitigation:**

- All filenames are sanitized on receipt
- Any `..` component is rejected (Rules.md §5.5)
- Absolute paths are rejected
- Symlinks pointing outside destination are rejected
- All writes are confined to the receiver's chosen destination
  directory

### 9.5 Resource exhaustion

**Threat:** peer floods us with messages, chunks, or connections.

**Mitigation:**

- Message size caps (1 MiB general, 16 KiB chat, 4 MiB chunk)
- Bounded event channels (64 slots)
- Bounded chat history (500 messages)
- Bounded in-flight chunks (8 per transfer)
- Connection cap per peer
- Backpressure applied by scheduler

### 9.6 Disk exhaustion

**Threat:** peer sends a 1 TB file to fill our disk.

**Mitigation:**

- Receiver must **explicitly approve** every transfer before any
  bytes are written (Rules.md §5.3)
- Manifest shows total size before user approves
- Disk-full errors pause the transfer and preserve partial state
- No transfer starts without approval

### 9.7 Identity spoofing

**Threat:** attacker claims to be a trusted peer.

**Mitigation:**

- Ed25519 signature over `(pubkey_self || pubkey_peer)` during handshake
- Peer ID is derived from public key fingerprint
- Session join code required as second factor for admission
- No "trust on first use" without explicit user consent
  (Rules.md §5.20)

### 9.8 Malformed input

**Threat:** peer sends garbage to crash or confuse the parser.

**Mitigation:**

- Length-prefix checked against maximum before allocating
- Schema-validated on every message
- Unknown types rejected, not ignored
- All parsers return `Result`, never panic
- Fail-closed: any parse error closes the connection

### 9.9 Log leakage

**Threat:** logs leak sensitive data to disk or to log collectors.

**Mitigation:**

- Logs are local only (Rules.md §14.9)
- No file contents in logs (Rules.md §14.4)
- No clipboard payloads (Rules.md §14.5)
- No private keys (Rules.md §14.7)
- No chat bodies at info level (Rules.md §14.6)

### 9.10 Clipboard exfiltration

**Threat:** clipboard contents leak to unintended peers.

**Mitigation:**

- Clipboard sync is **opt-in** on the receiver (default off)
- Payload capped by size (small images, text, links only)
- TTL enforced (default 10 minutes)
- Never leaves the LAN

---

## 10. Residual Risk

Risks we accept after mitigations:

| Risk                                    | Acceptance rationale                |
|-----------------------------------------|-------------------------------------|
| LAN peer can see your device is running LocalOS | Necessary for discovery    |
| LAN peer can see your display name       | Required for UX                    |
| Message timing reveals activity patterns | Acceptable on LAN                  |
| Approximate message size reveals file size | Acceptable on LAN                  |
| Join code brute-forceable in ~2³⁰ tries  | Rate-limited; sessions short-lived |
| Session join code visible in mDNS TXT    | Sessions are ephemeral by design   |
| Peer with admin on their own device can forge identity | Out of scope           |

---

## 11. Review & Updates

This document is reviewed:

- **On any protocol change** (update § 8, § 9)
- **On any new dependency** (update § 4.1 if it's trusted)
- **On any new threat category** (add to § 6)
- **On any new mitigation** (add to § 9)
- **Annually**, as a security hygiene pass

Any change to this document requires:

1. A PR with a clear description of the change
2. Review by at least one other engineer
3. An update to `docs/Protocol.md` if the change is protocol-affecting

---

End of threat model.