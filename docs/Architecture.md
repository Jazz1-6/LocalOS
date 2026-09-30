# Architecture.md — LocalOS v1

> LAN-first, offline-capable collaboration platform for developers.
>
> Status: v1 Specification
> Version: 1.0
> Platforms: Windows 11 · Linux · macOS
> Stack: Rust core · Tauri UI · QUIC · mDNS · SQLite · BLAKE3

---

## Table of Contents

1. Purpose
2. Scope
3. Design Principles
4. High-Level Architecture
5. Crate Layout
6. Layer Specification
7. Platform Abstraction
8. Data Flow
9. State Model
10. Storage
11. Security Model
12. Reliability Model
13. Performance Model
14. Concurrency Model
15. Protocol Overview
16. Identity Model
17. Session & Group Model
18. Discovery Model
19. Transfer Model
20. Integrity Model
21. Chat Model
22. Resource Model
23. Clipboard Model
24. Error Model
25. Logging & Telemetry
26. Build & CI
27. Packaging
28. Cross-Platform Matrix
29. Non-Goals
30. Acceptance Criteria

---

## 1. Purpose

LocalOS v1 is a local-first collaboration tool for rooms that do not have
internet. It enables nearby devices to discover each other, form temporary
groups, transfer files, share a clipboard, chat, and discover local
resources — all without accounts, cloud, or internet.

The system is designed for LAN environments: hostels, classrooms,
hackathons, offline offices, field work, and events where connectivity
to the public internet is unavailable, unreliable, or deliberately avoided.

LocalOS v1 is not a cloud product, not a messenger replacement, and not a
synchronization service. It is a temporary, session-scoped collaboration
layer that exists only while peers are physically near each other.

---

## 2. Scope

### 2.1 In Scope (v1)

| ID   | Feature                                    | Description                                            |
|------|--------------------------------------------|--------------------------------------------------------|
| F-01 | Peer discovery                             | Automatic nearby peer discovery over mDNS              |
| F-02 | Temporary identity                         | Ephemeral, session-scoped identity; no accounts        |
| F-03 | Session creation and join by code          | Host creates session; peers join with short code       |
| F-04 | Encrypted peer pairing                     | QUIC + TLS 1.3 + identity proof                        |
| F-05 | File transfer                              | Device-to-device file and folder transfer, no cloud    |
| F-06 | Chunked, parallel, resumable transfer      | Content-addressed chunks with resume                   |
| F-07 | Per-chunk and final integrity verification | BLAKE3 on every chunk and on the manifest              |
| F-08 | Ghost clipboard                            | Copy on one device, paste on another nearby device     |
| F-09 | Group chat                                 | Signed group chat over the session transport           |
| F-10 | Resource advertisement and discovery       | Advertise and discover files, tools, skills, hardware  |
| F-11 | Hostel Brain                               | Natural-language resource search within the local group|
| F-12 | Transfer dashboard and telemetry           | Real-time throughput, ETA, retries, verification state |
| F-13 | Pause / Resume / Cancel                    | Safe user control of running transfers                 |

### 2.2 Out of Scope (v1)

The following are explicitly excluded from v1. They do not appear in the
UI, the protocol, or the codebase:

- Temporary Computer
- Human Mesh
- Offline Internet
- Data That Follows You
- Room Computer
- One-Screen
- Digital DNA
- Local AI
- Emergency Mode
- Collaborative File Workspace
- Capability Map
- Local App Store
- Drop / Throw (visual polish, deferred to v2)
- Cloud relay
- Internet traversal
- Mobile clients
- Accounts and authentication servers

### 2.3 Supported Platforms

- Windows 11
- Linux (X11 and Wayland)
- macOS

One codebase. One protocol. One UI. Platform differences are isolated
behind traits.

---

## 3. Design Principles

1. **LAN-only.** No relay, no signaling server, no NAT traversal.
2. **Local-first.** Fully functional with zero internet.
3. **No accounts.** Identity is temporary and session-scoped.
4. **Core is OS-agnostic.** All OS specifics live behind traits.
5. **Every received value is untrusted input.**
6. **Disk writes are crash-safe.**
7. **No unbounded concurrency.**
8. **Correctness before throughput.**
9. **Performance changes require benchmarks.**
10. **Protocol is versioned.**
11. **State transitions are explicit.**
12. **UI contains no transfer or protocol logic.**
13. **Networking is cancellable at every await point.**
14. **Fail closed on malformed input.**
15. **Depth over breadth.** Ship one thing properly.

---

## 4. High-Level Architecture

```
┌──────────────────────────────────────────────────────────┐
│ Tauri UI (TypeScript / React)                            │
│                                                          │
│  · Peer list       · Transfer dashboard                  │
│  · Group roster    · Chat view                           │
│  · Resource search · Settings                            │
└──────────────────────────┬───────────────────────────────┘
                           │ IPC (Tauri commands + events)
┌──────────────────────────▼───────────────────────────────┐
│ app crate                                                │
│                                                          │
│  · Wires core + platform + ui                            │
│  · Owns application lifecycle                            │
│  · Injects platform trait implementations into core      │
│  · Exposes Tauri commands                                │
│  · Emits UI events                                       │
└────────┬─────────────────────────────────┬───────────────┘
         │                                 │
┌────────▼─────────┐              ┌────────▼─────────────┐
│ core crate       │              │ platform crate       │
│                  │              │                      │
│ 100% OS-agnostic │              │ One impl per OS      │
│                  │              │                      │
│ · protocol       │              │ · discovery          │
│ · session        │              │ · clipboard          │
│ · transfer       │              │ · paths              │
│ · integrity      │              │ · firewall           │
│ · identity       │              │                      │
│ · chat           │              │ linux.rs             │
│ · resource       │              │ windows.rs           │
│ · store          │              │ macos.rs             │
│                  │              │                      │
│ depends on       │              │ implements           │
│ traits only      │              │ traits               │
│ never platform   │              │                      │
└────────┬─────────┘              └────────┬─────────────┘
         │                                 │
         └────────────┬────────────────────┘
                      │
               ┌──────▼──────────┐
               │ traits crate    │
               │                 │
               │ · Discovery     │
               │ · Clipboard     │
               │ · AppPaths      │
               │ · Firewall      │
               │ · shared types  │
               │                 │
               │ no OS code      │
               │ no cfg(target)  │
               └─────────────────┘
```

**Rule:** `core` never imports `platform`. The `app` crate wires them at
startup by constructing concrete platform implementations and passing
them to core as trait objects.

**Rule:** all shared trait definitions live in `localos-traits`. Both
`core` and `platform` depend on `localos-traits`. Neither depends on the
other.

---

## 5. Crate Layout

```
localos/
├── Cargo.toml                          # workspace manifest
├── rust-toolchain.toml                 # pinned toolchain
├── crates/
│   ├── traits/                         # OS-agnostic trait definitions
│   │   ├── Cargo.toml
│   │   └── src/
│   │       └── lib.rs                  # Discovery, Clipboard, AppPaths, Firewall
│   ├── core/                           # OS-agnostic engine
│   │   ├── Cargo.toml
│   │   └── src/
│   │       ├── lib.rs
│   │       ├── protocol/
│   │       │   ├── mod.rs
│   │       │   ├── header.rs           # version, type, length
│   │       │   ├── messages.rs         # schema-validated types
│   │       │   └── codec.rs            # encode/decode
│   │       ├── session/
│   │       │   ├── mod.rs
│   │       │   ├── handshake.rs        # key exchange, approval
│   │       │   ├── group.rs            # group code, roster
│   │       │   └── lifecycle.rs        # state transitions
│   │       ├── transfer/
│   │       │   ├── mod.rs
│   │       │   ├── chunker.rs          # content-addressed chunks
│   │       │   ├── manifest.rs         # file/dir manifest
│   │       │   ├── scheduler.rs        # bounded concurrency
│   │       │   ├── resume.rs           # missing chunk reconciliation
│   │       │   └── writer.rs           # atomic .part -> final
│   │       ├── integrity/
│   │       │   ├── mod.rs
│   │       │   ├── hash.rs             # BLAKE3 wrappers
│   │       │   └── verify.rs           # chunk + manifest verification
│   │       ├── identity/
│   │       │   ├── mod.rs
│   │       │   ├── keypair.rs          # Ed25519 session keys
│   │       │   └── peer_id.rs          # fingerprint derivation
│   │       ├── chat/
│   │       │   ├── mod.rs
│   │       │   ├── message.rs          # signed message type
│   │       │   └── history.rs          # local persistence
│   │       ├── resource/
│   │       │   ├── mod.rs
│   │       │   ├── ad.rs               # signed advertisements
│   │       │   ├── index.rs            # local search index
│   │       │   └── query.rs            # Hostel Brain query mapping
│   │       ├── clipboard/
│   │       │   ├── mod.rs
│   │       │   ├── item.rs             # payload type + TTL
│   │       │   └── sync.rs             # broadcast logic
│   │       ├── store/
│   │       │   ├── mod.rs
│   │       │   ├── schema.rs           # migrations
│   │       │   └── queries.rs          # typed accessors
│   │       └── error.rs                # core error types
│   ├── platform/                       # OS integrations
│   │   ├── Cargo.toml
│   │   └── src/
│   │       ├── lib.rs
│   │       ├── discovery.rs
│   │       ├── clipboard.rs
│   │       ├── paths.rs
│   │       ├── firewall.rs
│   │       ├── linux.rs                # cfg(target_os = "linux")
│   │       ├── windows.rs              # cfg(target_os = "windows")
│   │       └── macos.rs                # cfg(target_os = "macos")
│   ├── app/                            # binary, wiring, lifecycle
│   │   ├── Cargo.toml
│   │   └── src/
│   │       ├── main.rs
│   │       ├── wiring.rs               # dependency injection
│   │       ├── commands.rs             # Tauri command handlers
│   │       └── events.rs               # UI event emitters
│   └── ui/                             # Tauri frontend bridge
│       ├── Cargo.toml
│       └── src/
│           └── lib.rs
├── ui/                                 # TypeScript / React frontend
│   ├── package.json
│   ├── vite.config.ts
│   └── src/
│       ├── App.tsx
│       ├── views/
│       │   ├── Peers.tsx
│       │   ├── Transfers.tsx
│       │   ├── Chat.tsx
│       │   ├── Resources.tsx
│       │   └── Settings.tsx
│       └── lib/
│           └── ipc.ts                  # Tauri command bindings
├── docs/
│   ├── Architecture.md                 # this file
│   ├── Workflow.md
│   ├── Rules.md
│   ├── Protocol.md
│   ├── ThreatModel.md
│   └── Benchmarks.md
├── tests/
│   ├── integration/
│   │   ├── transfer_two_process.rs
│   │   ├── resume_after_kill.rs
│   │   ├── corrupt_chunk.rs
│   │   └── path_traversal.rs
│   └── fixtures/
└── .github/
    └── workflows/
        ├── ci.yml                      # 3-OS matrix
        └── bench.yml                   # manual trigger
```

---

## 6. Layer Specification

### 6.1 Transport Layer

**Responsibility:** Move bytes between two peers securely and reliably.

**Technology:** QUIC over UDP via `quinn`. TLS 1.3 with ephemeral keys
derived during handshake.

**Properties:**

- One QUIC connection per peer per session.
- Multiplexed streams separated by purpose:
  - control stream (handshake, acks, state),
  - transfer stream (chunk data),
  - chat stream (messages),
  - resource stream (advertisements).
- Length-prefixed, schema-validated messages.
- Versioned protocol header on every message.
- Cancellable at every await point.

**Rules:**

- No payload accepted before handshake completes.
- No payload accepted before receiver approval.
- Unknown message types are rejected, never ignored.
- Unknown protocol versions are rejected.

### 6.2 Discovery Layer

**Responsibility:** Find peers on the same LAN without manual IP entry.

**Technology:** mDNS via `mdns-sd`. Manual IP:port fallback always available.

**Properties:**

- Advertises: service type, peer id, display name, session id.
- Never advertises filenames, contents, keys, or resources.
- Browse returns a stream of discovered peers.
- Advertisement is short-lived and refreshed periodically.

**Rules:**

- Discovery is best-effort. Failure degrades to manual entry.
- Advertised data is treated as untrusted until handshake.

### 6.3 Session Layer

**Responsibility:** Establish and manage an authenticated session between
peers, and manage group membership.

**Flow:**

1. Host creates session, generates short group code.
2. Host advertises session.
3. Peer connects, handshake runs.
4. Peer submits group code.
5. Host validates code, approves peer.
6. Session active; both peers enter roster.
7. Session ends when host leaves or code expires.

**Rules:**

- Handshake authenticates both peers.
- Receiver explicitly approves before accepting payload.
- Group code is validated server-side (host-side).
- Session state is ephemeral unless user opts to save.
- All state transitions are explicit and logged.

### 6.4 Transfer Layer

**Responsibility:** Move files and folders reliably, resumably, and with
verifiable integrity.

**Chunking:**

- Files split into content-addressed chunks.
- Default chunk size: 4 MiB (configurable).
- Chunk descriptor: `{ id, offset, length, hash }`.
- Chunk id is derived from content hash, not offset.

**Scheduling:**

- Bounded concurrency, default 8 (configurable).
- Backpressure applied at the scheduler.
- Retransmit on hash mismatch or timeout.
- Out-of-order arrival accepted.

**Resume:**

- Receiver persists verified chunk ids to SQLite.
- On reconnect, receiver sends missing chunk id set.
- Sender resumes from the missing set.
- Resume state survives application restart on both sides.

**Completion:**

- All chunks received and verified.
- Receiver reconstructs file.
- Receiver verifies file hash against manifest.
- Atomic rename from `.part` to final name.
- Only then is COMPLETE reported.

**Rules:**

- Never report COMPLETE before manifest verification.
- Never silently overwrite an existing file.
- Never leave `.part` files orphaned without a resume record.
- Never buffer a full file in memory.

### 6.5 Integrity Layer

**Responsibility:** Prove that what was received matches what was sent.

**Technology:** BLAKE3.

**Levels:**

- Per-chunk hash: verifies each chunk on arrival.
- Per-file hash: verifies reconstructed file.
- Manifest hash: verifies the directory structure and file set.
- Manifest signature: verifies the sender's identity.

**Rules:**

- A chunk that fails verification is discarded and retransmitted.
- A file that fails verification is never renamed.
- A manifest that fails verification aborts the transfer.
- All hashing is streaming; no full-file buffering.

### 6.6 Identity Layer

**Responsibility:** Provide a temporary, session-scoped identity for each
peer.

**Properties:**

- No accounts. No login. No persistence by default.
- Per-session Ed25519 keypair. Ephemeral by default.
- Optional persistent identity in the OS keychain for display-name
  continuity. Ephemeral session keys are never reused.
- Peer id derived from public key fingerprint.
- Display name auto-generated: `<User>-<Device>`.
- Display name editable locally; not globally unique.
- Identity discarded at session end unless user opts to save.

**Rules:**

- Private keys never leave the device.
- Private keys never logged.
- Private keys never committed.
- Session keys are ephemeral; no reuse across sessions.

### 6.7 Chat Layer

**Responsibility:** Group chat over the session transport.

**Properties:**

- Messages addressed to group id.
- Each message signed by sender's session key.
- Local history in SQLite; optional auto-expiry.
- No global relay; messages exist only on session peers.

**Rules:**

- Chat only exists within a session.
- No message leaves the LAN.
- Invalid signatures are rejected.
- History respects user-configured expiry.

### 6.8 Resource Layer

**Responsibility:** Advertise, discover, and search local resources.

**Properties:**

- Resources: files, tools, skills, hardware, availability.
- Advertisements signed by session key.
- Ads gossiped within session only.
- Ads stored locally; searchable.
- Ads expire after 10 minutes by default.
- Hostel Brain maps natural-language query to local search.

**Rules:**

- Unsigned ads are rejected.
- Ads never leave the LAN.
- Ads expire after configurable TTL (default 10 minutes).
- Query never leaves the LAN.

### 6.9 Clipboard Layer

**Responsibility:** Sync clipboard items between session peers.

**Properties:**

- Supports text, links, small images, code.
- Payload capped by size limit.
- TTL enforced (default 10 minutes).
- Receiver opt-in required.

**Rules:**

- Payload size is bounded before broadcast.
- Receiver applies only if opt-in is enabled.
- Expired items are never applied.

### 6.10 Persistence Layer

**Responsibility:** Store durable state across restarts.

**Technology:** SQLite via `rusqlite` (bundled).

**Properties:**

- All writes transactional.
- Schema versioned with migrations.
- Resume state survives restart.
- Chat history and resource ads stored locally.

**Rules:**

- No partial state persisted.
- No write outside a transaction.
- Every stored record carries a schema version.

---

## 7. Platform Abstraction

All OS-specific behavior is defined as a trait in the **`localos-traits`**
crate. The `platform` crate implements those traits once per supported OS.
The `core` crate depends only on `localos-traits` and never on `platform`.
The `app` crate constructs concrete implementations and injects them into
`core`.

### 7.1 Traits (defined in `crates/traits/src/lib.rs`)

```rust
pub trait Discovery: Send + Sync {
    fn advertise(&self, ad: &PeerAd) -> Result<()>;
    fn stop_advertise(&self) -> Result<()>;
    fn browse(&self) -> Result<Receiver<PeerAd>>;
}

pub trait Clipboard: Send + Sync {
    fn get(&self) -> Result<ClipboardItem>;
    fn set(&self, item: &ClipboardItem) -> Result<()>;
    fn watch(&self, cb: Box<dyn Fn(ClipboardItem) + Send + Sync>) -> Result<()>;
}

pub trait AppPaths: Send + Sync {
    fn config_dir(&self) -> PathBuf;
    fn data_dir(&self) -> PathBuf;
    fn cache_dir(&self) -> PathBuf;
    fn default_download_dir(&self) -> PathBuf;
}

pub trait Firewall: Send + Sync {
    fn ensure_allowed(&self) -> Result<()>;
    fn status(&self) -> FirewallStatus;
}
```

### 7.2 Implementations

| Trait     | Defined in       | Implemented in              | Linux            | Windows           | macOS             |
|-----------|------------------|-----------------------------|------------------|-------------------|-------------------|
| Discovery | `localos-traits` | `localos-platform` (per OS) | avahi / mdns-sd  | Bonjour / mdns-sd | Bonjour / mdns-sd |
| Clipboard | `localos-traits` | `localos-platform` (per OS) | X11 / Wayland    | Win32 clipboard   | NSPasteboard      |
| AppPaths  | `localos-traits` | `localos-platform` (per OS) | `~/.local/share` | `%APPDATA%`       | `~/Library/...`   |
| Firewall  | `localos-traits` | `localos-platform` (per OS) | ufw / none       | Defender prompt   | Gatekeeper prompt |

### 7.3 Rules

1. `core` must never import `platform`.
2. `core` may import `localos-traits`.
3. `#[cfg(target_os)]` is allowed only inside `platform`.
4. Every trait has exactly one implementation per supported OS.
5. The `app` crate constructs implementations and injects them into core.
6. All paths go through `AppPaths`. No hardcoded separators.
7. Firewall denial is handled gracefully; the app never crashes.
8. `localos-traits` contains no OS-specific code and no `#[cfg(target_os)]`.

---

## 8. Data Flow

### 8.1 Discovery to Join

```
Host                                  Peer
  │                                    │
  │  create session                    │
  │  generate group code               │
  │  advertise via mDNS                │
  │                                    │
  │◄──────────── mDNS browse ──────────│
  │                                    │
  │◄──────────── QUIC connect ─────────│
  │                                    │
  │◄──────────── handshake ────────────│
  │   key exchange                     │
  │   identity exchange                │
  │                                    │
  │◄──────────── group code ───────────│
  │   validate                         │
  │   approve                          │
  │                                    │
  │──────────── session active ───────►│
```

### 8.2 File Transfer

```
Sender                                Receiver
  │                                       │
  │  build manifest                       │
  │  {paths, sizes, hashes}               │
  │                                       │
  │──────────── manifest ────────────────►│
  │                                       │  show summary
  │                                       │  approve destination
  │                                       │
  │◄──────────── approval ────────────────│
  │                                       │
  │──────────── chunk #N ────────────────►│
  │                                       │  verify hash
  │                                       │  write to .part
  │                                       │  persist chunk id
  │◄──────────── ack #N ──────────────────│
  │                                       │
  │  (up to 8 chunks in flight)           │
  │                                       │
  │  ...                                  │
  │                                       │
  │──────────── final chunk ─────────────►│
  │                                       │  reconstruct file
  │                                       │  verify file hash
  │                                       │  verify manifest
  │                                       │  atomic rename
  │◄──────────── COMPLETE ────────────────│
```

### 8.3 Interruption and Resume

```
Transfer running at 78%
        │
        ▼
Connection lost
        │
        ▼
Sender checkpoints acked chunk set
Receiver checkpoints verified chunk set
        │
        ▼
Connection restored
        │
        ▼
Receiver sends missing chunk id set
        │
        ▼
Sender resumes from missing set
        │
        ▼
Transfer continues at 78%
```

State survives application restart on both sides.

### 8.4 Clipboard

```
Device A                              Device B
  │                                      │
  │  user copies text                    │
  │                                      │
  │──────────── clipboard item (TTL) ───►│
  │                                      │  if opt-in:
  │                                      │    apply locally
  │                                      │
  │        item expires after TTL        │
```

### 8.5 Chat

```
Peer A                                Peer B
  │                                      │
  │  user types message                  │
  │  sign with session key               │
  │                                      │
  │──────────── signed message ─────────►│
  │                                      │  verify signature
  │                                      │  append to history
  │                                      │  render in UI
```

### 8.6 Resource Discovery and Hostel Brain

```
Peer A                                Peer B
  │                                      │
  │  user adds resource                  │
  │  sign advertisement                  │
  │                                      │
  │──────────── signed ad ──────────────►│
  │                                      │  validate signature
  │                                      │  store in local index
  │                                      │
  │                                      │  user queries:
  │                                      │  "who has DBMS notes?"
  │                                      │
  │                                      │  search local index
  │                                      │  rank results
  │                                      │  render matches
```

---

## 9. State Model

### 9.1 Session States

```
IDLE
  │
  ▼
DISCOVERING
  │
  ▼
CONNECTING
  │
  ▼
HANDSHAKE
  │
  ▼
PAIRED
  │
  ├──► TRANSFERRING <-> PAUSED
  │         │
  │         ▼
  │      VERIFYING
  │         │
  │         ▼
  │      COMPLETE
  │
  ├──► FAILED
  │
  └──► CANCELLED
```

### 9.2 Transfer States

```
PENDING -> RUNNING -> PAUSED -> RUNNING -> VERIFYING -> COMPLETE
              │
              ├──► FAILED
              └──► CANCELLED
```

### 9.3 Rules

1. Every transition is explicit.
2. Every transition is logged.
3. No implicit state changes.
4. No state is inferred from side effects.
5. COMPLETE is unreachable without verification.

---

## 10. Storage

### 10.1 Schema (abridged)

```sql
CREATE TABLE schema_version (
    version INTEGER PRIMARY KEY
);

CREATE TABLE sessions (
    id          TEXT PRIMARY KEY,
    code        TEXT,
    created_at  INTEGER NOT NULL,
    expires_at  INTEGER NOT NULL
);

CREATE TABLE peers (
    id          TEXT PRIMARY KEY,
    name        TEXT NOT NULL,
    pubkey      BLOB NOT NULL,
    last_seen   INTEGER NOT NULL
);

CREATE TABLE transfers (
    id          TEXT PRIMARY KEY,
    peer_id     TEXT NOT NULL,
    path        TEXT NOT NULL,
    state       TEXT NOT NULL,
    total_bytes INTEGER NOT NULL,
    done_bytes  INTEGER NOT NULL DEFAULT 0,
    created_at  INTEGER NOT NULL
);

CREATE TABLE chunks (
    transfer_id TEXT NOT NULL,
    chunk_id    TEXT NOT NULL,
    verified    INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (transfer_id, chunk_id)
);

CREATE TABLE messages (
    id          TEXT PRIMARY KEY,
    session_id  TEXT NOT NULL,
    sender      TEXT NOT NULL,
    body        BLOB NOT NULL,
    sent_at     INTEGER NOT NULL,
    expires_at  INTEGER
);

CREATE TABLE resources (
    id          TEXT PRIMARY KEY,
    peer_id     TEXT NOT NULL,
    kind        TEXT NOT NULL,
    payload     BLOB NOT NULL,
    signature   BLOB NOT NULL,
    expires_at  INTEGER
);
```

### 10.2 Rules

1. All writes are transactional.
2. No partial state persisted.
3. Every table has a schema version.
4. Migrations are forward-only.
5. Resume state survives restart.
6. Orphan `.part` files are cleaned on startup.

---

## 11. Security Model

### 11.1 Transport Security

- QUIC with TLS 1.3.
- Ephemeral keys per session.
- Mutual authentication during handshake.
- No plaintext payload on the wire.

### 11.2 Peer Authentication

- Both peers present identity keys during handshake.
- Receiver explicitly approves before accepting payload.
- Group code is validated by host.
- Unknown or malformed handshake messages are rejected.

### 11.3 Input Validation

- All received values are untrusted.
- All messages are length-checked.
- All messages are schema-validated.
- Filenames are sanitized.
- Path traversal attempts are rejected.
- Temporary files stay within destination scope.
- Malformed peers fail closed; the app never crashes.

### 11.4 Secrets

- Private keys never committed.
- Private keys never logged.
- Logs never contain file contents.
- Logs never contain credentials or tokens.
- Session keys are ephemeral; no reuse.

### 11.5 Threat Assumptions

In scope:

- Malicious peer on the same LAN.
- Malformed protocol messages.
- Path traversal attempts.
- Corrupted chunks in transit.
- Replay of signed ads within a session.

Out of scope (v1):

- Nation-state adversaries.
- Physical device compromise.
- Supply-chain attacks on dependencies.
- Side-channel attacks on cryptography.

---

## 12. Reliability Model

### 12.1 Must Tolerate

- Network loss mid-transfer.
- Application restart mid-transfer.
- Partial writes.
- Corrupted chunks.
- Peer disconnects.
- Destination disk full.
- Duplicate requests.
- Out-of-order chunk arrival.
- Malformed messages.

### 12.2 Rules

1. Never report COMPLETE before verification.
2. Never silently overwrite an existing file.
3. Never leave `.part` files orphaned without a resume record.
4. Never corrupt verified chunks on disconnect.
5. Never assume ordered arrival.
6. Never assume idempotent retries; deduplicate by id.
7. Never block on a peer that has disconnected.

### 12.3 Recovery Behavior

| Failure              | Response                                         |
|----------------------|--------------------------------------------------|
| Network loss         | Checkpoint; await reconnect; resume              |
| App restart          | Reload from SQLite; resume                       |
| Corrupted chunk      | Detect via hash; retransmit                      |
| Peer disconnect      | Mark offline; hold transfer; resume on reconnect |
| Disk full            | Pause; surface error; preserve partial state     |
| Duplicate request    | Deduplicate by chunk id                          |
| Out-of-order arrival | Accept and store by chunk id                     |
| Malformed message    | Reject; log; do not crash                        |
| Path traversal       | Reject; log; do not write                        |

---

## 13. Performance Model

### 13.1 Targets

- Saturate 1 GbE on modern SSDs.
- Saturate 2.5 GbE where available.
- Bounded memory regardless of file size.
- Streaming chunk reads; no full-file buffering.
- Configurable concurrency (default 8).
- Configurable chunk size (default 4 MiB).

### 13.2 Metrics

- Effective throughput (bytes/sec).
- CPU utilization (percent).
- Memory utilization (peak RSS).
- Disk read/write throughput.
- Network utilization.
- Chunk retry rate.
- Time to resume after reconnect.
- Hashing overhead (percent of total CPU).

### 13.3 Rules

1. No performance change without a benchmark.
2. Benchmarks record hardware, OS, network, chunk size, concurrency.
3. Benchmarks are reproducible and documented in `Benchmarks.md`.
4. Correctness has priority over throughput.
5. Regressions are caught in CI or in a documented benchmark run.
6. No optimization is merged on intuition.

---

## 14. Concurrency Model

### 14.1 Principles

- No unbounded task spawning.
- All concurrency has a hard cap.
- All async tasks have a cancellation path.
- Locks are never held across `.await`.
- Backpressure is applied at the scheduler.

### 14.2 Defaults

| Setting              | Default    |
|----------------------|------------|
| Transfer concurrency | 8          |
| Chunk size           | 4 MiB      |
| Chat buffer          | 256        |
| Resource ad TTL      | 10 minutes |
| Clipboard TTL        | 10 minutes |

### 14.3 Rules

1. Every pool has a documented maximum.
2. Every task is cancellable.
3. Every shared structure is `Send + Sync` or scoped.
4. No busy loops. No polling without backoff.
5. Memory usage is bounded independent of file size.

---

## 15. Protocol Overview

### 15.1 Message Envelope

Every message on the wire has the following envelope:

```
┌────────────┬────────────┬────────────┬──────────────┐
│ version    │ type       │ length     │ payload      │
│ (u16)      │ (u16)      │ (u32)      │ (N bytes)    │
└────────────┴────────────┴────────────┴──────────────┘
```

### 15.2 Message Types

| Range         | Category   |
|---------------|------------|
| 0x0001–0x00FF | Handshake  |
| 0x0100–0x01FF | Session    |
| 0x0200–0x02FF | Transfer   |
| 0x0300–0x03FF | Chat       |
| 0x0400–0x04FF | Resource   |
| 0x0500–0x05FF | Clipboard  |
| 0x0600–0x06FF | Control    |

### 15.3 Rules

1. Every message has a version header.
2. Every message has a type tag.
3. Every message has a length prefix.
4. Every message is schema-validated on receipt.
5. Unknown types are rejected.
6. Unknown versions are rejected.
7. Protocol changes require a version bump.
8. Protocol changes require an update to `Protocol.md`.

---

## 16. Identity Model

### 16.1 Properties

- No accounts. No login. No servers.
- Per-session Ed25519 keypair. Ephemeral by default.
- Optional persistent identity in OS keychain for display-name
  continuity. Ephemeral session keys are never reused across sessions.
- Peer id derived from public key fingerprint.
- Display name auto-generated: `<User>-<Device>`.
- Display name editable locally; not globally unique.
- Identity discarded at session end unless user saves it.

### 16.2 Rules

1. Private keys never leave the device.
2. Private keys never logged.
3. Private keys never committed.
4. Session keys are ephemeral.
5. Peer id is stable within a session, not across sessions.
6. Saved identities are opt-in and user-controlled.

---

## 17. Session and Group Model

### 17.1 Properties

- Host creates a session and a short group code.
- Peers join by entering the code.
- Host validates the code before admitting a peer.
- Session roster tracks active peers.
- Session ends when host leaves or code expires.

### 17.2 Rules

1. No peer enters the roster without code validation.
2. No peer receives payload without explicit approval.
3. Session state is ephemeral unless user saves it.
4. Session end discards ephemeral state.
5. Group codes expire after a configurable window.

---

## 18. Discovery Model

### 18.1 Properties

- mDNS-based automatic discovery.
- Manual IP:port fallback.
- Advertises only: service type, peer id, display name, session id.

### 18.2 Rules

1. Never advertise filenames or contents.
2. Never advertise resource payloads.
3. Advertised data is untrusted until handshake.
4. Discovery failure degrades to manual entry, never blocks the app.

---

## 19. Transfer Model

### 19.1 Properties

- Content-addressed chunks.
- Bounded concurrency.
- Retransmission on failure.
- Resume from verified chunk set.
- Atomic rename after verification.

### 19.2 Rules

1. Chunk id is content-derived, not offset-derived.
2. Receiver verifies every chunk before acking.
3. Receiver persists verified chunk ids.
4. Sender resumes from missing chunk id set.
5. Final file is verified before rename.
6. COMPLETE is reported only after verification.
7. Existing files are never silently overwritten.
8. No full-file buffering.

---

## 20. Integrity Model

### 20.1 Levels

| Level          | Purpose                                 |
|----------------|-----------------------------------------|
| Per-chunk hash | Verify each chunk on arrival            |
| Per-file hash  | Verify reconstructed file               |
| Manifest hash  | Verify directory structure and file set |
| Manifest sig   | Verify sender identity                  |

### 20.2 Rules

1. Failed chunk verification triggers retransmission.
2. Failed file verification aborts the rename.
3. Failed manifest verification aborts the transfer.
4. All hashing is streaming.
5. BLAKE3 is the default hash.
6. SHA-256 is supported as a fallback for interop.

---

## 21. Chat Model

### 21.1 Properties

- Group chat within a session.
- Signed messages.
- Local history with optional expiry.
- No global relay.

### 21.2 Rules

1. Messages are signed by sender's session key.
2. Invalid signatures are rejected.
3. History respects user-configured expiry.
4. No message leaves the LAN.
5. Chat ends with the session.

---

## 22. Resource Model

### 22.1 Properties

- Advertisements for files, tools, skills, hardware.
- Signed by session key.
- Stored locally; searchable.
- Hostel Brain maps NL query to local search.

### 22.2 Rules

1. Unsigned ads are rejected.
2. Ads expire after configurable TTL (default 10 minutes).
3. Ads never leave the LAN.
4. Queries never leave the LAN.
5. Ads are validated before storing.

---

## 23. Clipboard Model

### 23.1 Properties

- Text, links, small images, code.
- Payload capped.
- TTL enforced (default 10 minutes).
- Receiver opt-in.

### 23.2 Rules

1. Payload size bounded before broadcast.
2. Receiver applies only if opt-in enabled.
3. Expired items are never applied.
4. Clipboard sync never blocks transfer traffic.

---

## 24. Error Model

### 24.1 Error Categories

| Category      | Example                            |
|---------------|------------------------------------|
| Network       | Connection lost, timeout           |
| Protocol      | Malformed message, unknown version |
| Security      | Invalid signature, path traversal  |
| Storage       | Disk full, write failure           |
| Integrity     | Hash mismatch, manifest mismatch   |
| Session       | Code rejected, peer left           |
| Configuration | Invalid setting, missing path      |

### 24.2 Rules

1. All public APIs return `Result<T, E>` where failure is possible.
2. No `unwrap()` on fallible I/O in core.
3. No `panic!` on externally received input.
4. Errors are typed, not stringly-typed.
5. Errors are logged with context, not contents.
6. Malformed peers fail closed.

---

## 25. Logging and Telemetry

### 25.1 Properties

- Structured logs.
- Local only. No telemetry leaves the device.
- Log levels: error, warn, info, debug, trace.

### 25.2 Rules

1. Logs never contain file contents.
2. Logs never contain credentials or tokens.
3. Logs never contain private keys.
4. Logs never contain clipboard payloads.
5. Logs never contain chat message bodies at info level.
6. Logs are rotated and bounded in size.

---

## 26. Build and CI

### 26.1 CI Matrix

- `ubuntu-latest`
- `windows-latest`
- `macos-latest`

### 26.2 Every Commit

- `cargo fmt --check`
- `cargo clippy -- -D warnings`
- `cargo build`
- `cargo test`
- UI: `tsc --noEmit`, `eslint`

### 26.3 Integration Tests

- Two-process local transfer.
- Resume after simulated kill.
- Corrupt chunk detection and retransmit.
- Path traversal rejection.
- Malformed message rejection.
- Disk-full handling.

### 26.4 Benchmarks

- Separate workflow.
- Manual trigger.
- Results committed to `Benchmarks.md`.

---

## 27. Packaging

| Platform | Format              | Notes                        |
|----------|---------------------|------------------------------|
| Linux    | `.deb`, `.AppImage` | Build-from-source documented |
| Windows  | `.msi`              | Unsigned for v1              |
| macOS    | `.dmg`              | Unsigned for v1              |

One Tauri configuration, three targets. No code changes between platforms.

---

## 28. Cross-Platform Matrix

| Concern      | Linux               | Windows           | macOS             |
|--------------|---------------------|-------------------|-------------------|
| Discovery    | avahi / mdns-sd     | Bonjour / mdns-sd | Bonjour / mdns-sd |
| Clipboard    | X11 / Wayland       | Win32             | NSPasteboard      |
| Paths        | `~/.local/share`    | `%APPDATA%`       | `~/Library/...`   |
| Firewall     | ufw / none          | Defender prompt   | Gatekeeper prompt |
| Packaging    | `.deb`, `.AppImage` | `.msi`            | `.dmg`            |
| File system  | case-sensitive      | case-insensitive  | case-insensitive  |
| Permissions  | Unix modes          | Windows ACLs      | POSIX + ACLs      |
| Line endings | LF                  | CRLF              | LF                |

Behavior from the user's perspective is identical on all three platforms.
Only the integration layer differs.

---

## 29. Non-Goals

The following are explicitly not goals of LocalOS v1:

- Cloud storage or synchronization.
- Internet traversal or relay.
- Permanent accounts.
- Mobile clients.
- Distributed compute.
- Mesh routing.
- Local LLM inference.
- Media streaming.
- Remote desktop.
- App store or plugin ecosystem.
- Anonymous public file sharing.

---

## 30. Acceptance Criteria

LocalOS v1 is considered complete only when all of the following are
demonstrated:

1. Two devices on the same LAN discover each other automatically.
2. A user transfers a directory containing nested files.
3. Large files stream without full-memory load.
4. Multiple chunks transfer concurrently with bounded concurrency.
5. A forced disconnect does not corrupt verified chunks.
6. Restarting the application resumes from the last verified chunk.
7. A corrupted chunk is detected and retransmitted.
8. Final integrity check passes before COMPLETE is reported.
9. Path traversal attempts are rejected.
10. Existing destination files are never silently overwritten.
11. All network payloads are encrypted.
12. Clipboard syncs between two devices with TTL and opt-in.
13. Group chat works with no internet.
14. Resource ads are signed, stored, and searchable locally.
15. Hostel Brain returns ranked local results for a natural-language query.
16. Benchmarks are reproducible and documented.
17. Runs on Windows, Linux, and macOS from one codebase.
18. Demo video recorded and linked in the README.
19. `docs/` contains Architecture, Workflow, Rules, Protocol, ThreatModel,
    and Benchmarks.
20. A stranger can clone the repository and build from the README.

If any item is false, v1 is not done.