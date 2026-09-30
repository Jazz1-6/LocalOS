# LocalOS v1 — Product Requirements Document

> LAN-first collaboration for rooms without internet.

| Field | Value |
|---|---|
| Product | LocalOS |
| Version | 1.0 (v1) |
| Status | Proposed |
| Scope | Portfolio-grade production engineering project |
| Platforms | Windows 11, Linux, macOS |
| Team | 2 engineers |
| Working name | LocalOS |

---

## 1. Product Overview

LocalOS is a cross-platform desktop application that lets devices on the
same local network discover each other, transfer files, share a clipboard,
chat in temporary sessions, and discover nearby resources — without the
internet, without accounts, and without cloud storage.

The system is built on four principles:

1. **Local by default.** All traffic stays on the LAN. No relay, no cloud,
   no external signaling.
2. **No accounts.** Identity is generated locally and scoped to a session.
   Sessions are joined by a short code, not by login.
3. **Fast and resumable.** File transfers are chunked, parallel, encrypted,
   and survive disconnects and application restarts.
4. **Verifiable.** The receiver can prove the reconstructed file matches the
   sender's file.

LocalOS is not a Discord replacement. It is the collaboration layer for
situations where Discord, Slack, and Google Drive cannot work: hackathons
with bad WiFi, hostel rooms, offline classrooms, field work, and events.

---

## 2. Problem Statement

A group of people in the same room frequently needs to:

- move large files between devices;
- share text, links, and code between devices;
- talk in a group without using a phone-group or a cloud chat;
- find out who nearby has a resource (GPU, storage, notes, a charger);
- do all of the above when the internet is slow, unavailable, or untrusted.

Existing tools fail in this situation:

- Cloud tools (Drive, Dropbox, Slack, Discord) require the internet.
- AirDrop / Nearby Share handle one file at a time and one platform.
- LAN messengers exist but are disconnected from file transfer and
  resource discovery.
- Pendrives and cables are slow and manual.

LocalOS treats this as a distributed-systems and UX problem, not as a
file-sharing utility.

---

## 3. Goals

### Primary goals

- Discover peers on the same LAN without manual IP entry.
- Establish encrypted, authenticated sessions with no accounts.
- Transfer files and folders with chunked, parallel, resumable transport.
- Verify every chunk and the final file/directory.
- Provide group chat scoped to a temporary session.
- Provide a shared clipboard between session peers.
- Allow peers to advertise and discover nearby resources.
- Expose telemetry to benchmark and diagnose performance.
- Work identically on Windows, Linux, and macOS from one codebase.

### Secondary goals

- Automatic network-interface selection.
- Adaptive chunk size and concurrency.
- CLI in addition to the desktop UI.
- Transfer history and queue.

---

## 4. Non-Goals

LocalOS v1 will **not** attempt to be:

- a cloud storage product;
- a permanent file synchronization system;
- a backup service;
- a torrent client;
- an anonymous public file-sharing network;
- a media streaming platform;
- a remote desktop system;
- an internet-facing service of any kind;
- a mobile application.

Internet traversal, cloud relay, mobile clients, distributed compute, mesh
routing, and local LLM inference are explicitly out of scope for v1.

---

## 5. Target Users

Primary user:

- student, developer, researcher, or technical user working with other
  people in the same physical space, on a network without reliable internet.

Example scenarios:

- A hackathon team sharing code, files, and notes over venue WiFi.
- A hostel floor transferring a 50 GB dataset between laptops.
- A classroom where the instructor distributes files to 30 students.
- A field team collaborating with no internet access.
- Two developers pairing on the same LAN.

---

## 6. Scope

### In scope for v1

| ID   | Feature                                                        |
|------|----------------------------------------------------------------|
| F-01 | Peer discovery (mDNS)                                          |
| F-02 | Temporary identity (no accounts)                               |
| F-03 | Session creation and join by code                              |
| F-04 | Encrypted peer pairing                                         |
| F-05 | File transfer (single, multi, folder)                          |
| F-06 | Chunked, parallel, resumable transfer                          |
| F-07 | Per-chunk and final integrity verification                     |
| F-08 | Ghost clipboard (text, links, code, small images)              |
| F-09 | Group chat within a session                                    |
| F-10 | Resource advertisement and discovery                           |
| F-11 | Hostel Brain — query nearby resources                          |
| F-12 | Transfer dashboard and telemetry                               |
| F-13 | Pause / Resume / Cancel for transfers                          |

### Out of scope for v1

| ID   | Feature                       | Reason                                       |
|------|-------------------------------|----------------------------------------------|
| X-01 | Temporary Computer            | Remote desktop is a separate product         |
| X-02 | Human Mesh                    | Pointless when all peers share one subnet    |
| X-03 | Offline Internet              | Different product; content preloading needed |
| X-04 | Data That Follows You         | Undefined scope                              |
| X-05 | Room Computer                 | Distributed compute is research-grade        |
| X-06 | One-Screen                    | Miracast / Chromecast already solve this     |
| X-07 | Digital DNA                   | Undefined scope                              |
| X-08 | Local AI                      | Adds weight without adding depth             |
| X-09 | Emergency Mode                | Low relevance on LAN                         |
| X-10 | Collaborative File Workspace  | CRDT work is out of v1                       |
| X-11 | Capability Map                | UI polish; revisit in v2                     |
| X-12 | Local App Store               | Glue; no depth                               |
| X-13 | Drop / Throw UI               | Visual polish; deferred to v2                |

---

## 7. Functional Requirements

### FR-01 — Peer Discovery

Peers on the same LAN must be discoverable without manual IP entry.

- Discover peers using mDNS (`_localos._udp.local`).
- Advertise a short-lived, non-sensitive peer identity.
- Do not advertise filenames, message content, or resource contents
  beyond a coarse type and a user-authored label.
- Provide manual IP/port connection as a fallback.

### FR-02 — Temporary Identity

- Generate an Ed25519 keypair per session. Ephemeral by default.
- Optionally persist an identity in the OS keychain for display-name
  continuity. Ephemeral session keys are never reused across sessions.
- Derive a short device ID from the public key fingerprint.
- Default display name auto-generated from hostname and OS
  (e.g., `Chethan-MacBook`, `Room-204-TV`).
- Allow the user to override the display name.
- No account, no email, no phone number, no cloud registration.

### FR-03 — Session Creation and Join

- A host creates a session and receives a short join code.
- Join code must be human-transferable (speakable or typeable).
- Recommended format: six-word phrase or Crockford base32, 6–8 chars.
- Joiners may discover the session via mDNS or join by entering the code.
- The host approves or rejects each joiner.
- A session has a scope: chat room, file drop, resource pool.

### FR-04 — Secure Pairing

- Use QUIC with TLS 1.3 (`rustls`).
- Each peer presents a self-signed certificate bound to its session key.
- Session join code acts as the shared secret for admission.
- Reject unknown or malformed handshake messages.
- No file data is accepted before pairing completes.

### FR-05 — File and Folder Selection

- Single file, multiple files, and directories.
- Recursive directory traversal.
- Preservation of relative paths.
- Symlinks are not followed by default.

### FR-06 — Chunked Transfer

Files are divided into independently addressable, content-addressed chunks.

- Each chunk has a BLAKE3 hash, byte length, and file-relative offset.
- Chunk size default: 4 MiB. Adjustable.
- Retransmission of missing or failed chunks.
- Receiver persists a verified-chunk bitmap to SQLite.

### FR-07 — Parallelism

- Multiple chunks in flight per transfer.
- Concurrency bounded and adjustable.
- Default concurrency: 8 streams. Maximum: 16.

### FR-08 — Resume

- Interrupted transfers resume from verified chunks.
- Resume state survives application restart.
- Sender queries receiver's bitmap on reconnect.
- Only missing chunks are retransmitted.

### FR-09 — Integrity Verification

- Per-chunk BLAKE3 verification on arrival.
- Final file hash (BLAKE3) verification before completion.
- Directory manifest verification (per-file hashes + structure).
- Atomic rename from temp file to final filename after verification.

### FR-10 — Progress and Telemetry

The UI must report:

- bytes transferred and total bytes;
- percentage;
- instantaneous and smoothed speed;
- ETA;
- active streams;
- verification state;
- errors and retries.

### FR-11 — Ghost Clipboard

- Copy text, links, code, and small images on one session device.
- Paste on another session device.
- Clipboard entries are session-scoped and expire.
- Default TTL: 10 minutes. Configurable.
- No clipboard data leaves the LAN.

### FR-12 — Group Chat

- Chat is scoped to a session.
- Messages are signed by the sender's session key.
- Each peer stores its own copy of the session chat.
- Messages are ephemeral by default; configurable retention.
- Support text, links, and file references.

### FR-13 — Resource Discovery

- Peers may advertise resources they own.
- Resource types: file, hardware, skill, note, other.
- Advertisements are signed by the peer's session key.
- Advertisements are session-scoped.
- Advertisements expire after a configurable TTL. Default: 10 minutes.
- A peer may revoke an advertisement at any time.

### FR-14 — Hostel Brain

- Provide a single text input to query session resources.
- Parse the query into terms and match against the resource index.
- Rank results by term overlap, resource type, and recency.
- Return a list of matching resources with owning peer.
- No LLM required for v1.

### FR-15 — Cancellation and Pause

- Users may cancel a transfer safely.
- Pause and resume preserve state.
- Cancellation leaves verified chunks in place for future resume.

### FR-16 — Collision Handling

If a destination file already exists, the UI must provide:

- replace;
- keep both (auto-suffixed name);
- skip;
- cancel.

The application must never silently overwrite.

---

## 8. Non-Functional Requirements

### NFR-01 — Platform

- Windows 11, Linux (X11 and Wayland), macOS.
- Single codebase, single Rust core, single UI codebase.

### NFR-02 — Performance

- Sustain high utilization of a 1 GbE or faster LAN.
- Never load a whole file into memory.
- Bounded memory usage regardless of file size.
- A 100 GB transfer must complete on a fast LAN.
- Resume after a short disconnect must not restart from zero.

### NFR-03 — Security

- All payloads encrypted in transit.
- No private key material in the repository.
- Peer authentication before file data is accepted.
- Receiver explicitly approves transfers.
- Filenames sanitized against path traversal.
- Temp files scoped to the intended destination.
- Length-checked, schema-validated messages.
- Fail-closed on malformed input.
- Logs never contain file content, keys, or credentials.

### NFR-04 — Reliability

Tolerate:

- temporary network loss;
- application restart;
- partial writes;
- corrupted chunks;
- peer disconnects;
- disk-full errors;
- duplicate requests;
- out-of-order chunk arrival.

A completed transfer is never reported before verification succeeds.

### NFR-05 — Maintainability

- Core engine independent of the GUI.
- Protocol versioned and documented.
- Every externally received value treated as untrusted input.
- All OS-specific code isolated behind traits.

---

## 9. Performance Requirements

Measure at minimum:

- effective throughput (Mbps);
- CPU utilization (%);
- memory utilization (RSS);
- disk read and write throughput;
- network utilization;
- chunk retry rate;
- time to resume;
- hashing overhead.

Exact targets are reported per hardware and network configuration.
No targets are claimed without measurement.

---

## 10. Security Requirements

- TLS 1.3 for all transport.
- Ed25519 session identity. Ephemeral per session.
- Session join code as shared admission secret.
- Receiver-side approval for transfers.
- Path traversal rejection.
- Schema validation on every network message.
- Fail-closed behavior on malformed peers.
- No secrets in logs, crash dumps, or telemetry.

---

## 11. Reliability Requirements

- Crash-safe disk writes (temp file, verify, atomic rename).
- Persistent resume state in SQLite.
- Idempotent chunk application on the receiver.
- Session state survives host crash where possible.
- Explicit state machine for every transfer.

---

## 12. Acceptance Criteria

v1 is complete only when all of the following are demonstrated:

1. Two supported computers discover each other on a LAN.
2. A user creates a session and a second user joins by code.
3. A directory containing nested files transfers successfully.
4. Large files stream without loading fully into memory.
5. Multiple chunks transfer concurrently.
6. A forced disconnect does not corrupt completed chunks.
7. Restarting the application resumes the transfer.
8. A corrupted chunk is detected and retransmitted.
9. Final integrity verification passes before completion is reported.
10. Destination path traversal attempts are rejected.
11. Existing destination files are never silently overwritten.
12. All network payloads are encrypted.
13. Ghost clipboard works between two session peers.
14. Group chat delivers messages to all session peers.
15. Resource advertisements are discoverable via Hostel Brain.
16. Benchmark results are reproducible and documented.
17. The application builds and runs on Windows, Linux, and macOS from
    a single codebase.

---

## 13. Phases

### Phase 1 — Transport (weeks 1–8)

- Crate skeleton and CI on three OSes.
- mDNS discovery.
- QUIC transport with TLS 1.3.
- Session-scoped identity generation.
- Session creation and join.
- Handshake and approval.

### Phase 2 — Files (weeks 9–16)

- Manifest exchange.
- Chunked transfer.
- Parallel streams.
- Resume with SQLite bitmap.
- Integrity verification.
- Atomic writes.
- Transfer dashboard.
- Benchmarks.

### Phase 3 — Collaboration (weeks 17–22)

- Ghost clipboard.
- Group chat.
- Resource advertisement.
- Hostel Brain query.
- Polish and docs.

### Phase 4 — Release (weeks 23–24)

- Installers for three platforms.
- Demo video.
- Threat model and protocol docs.
- Benchmark report.

---

## 14. Success Definition

LocalOS v1 is successful when a stranger can clone the repository, build
it from the README on any of the three supported platforms, run it on two
devices on the same LAN, transfer a directory, drop the network, reconnect,
resume, verify, and see benchmark numbers — without an account, without
the internet, and without reading source code.

---

## 15. Portfolio Demonstration

The final demo must show:

1. Two laptops discover each other.
2. A session is created and joined by code.
3. A 100 GB test dataset is selected.
4. Transfer starts with real-time throughput displayed.
5. Network is deliberately killed.
6. Network is restored; transfer resumes from the last verified chunk.
7. A test chunk is corrupted; detection and retransmission are shown.
8. Transfer finishes with cryptographic verification.
9. Chat and ghost clipboard are demonstrated between peers.
10. Hostel Brain answers "who has DBMS notes?" from advertised resources.
11. Benchmark results are displayed.