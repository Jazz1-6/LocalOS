# Protocol.md — LocalOS v1

> Wire protocol between two LocalOS peers on the same LAN.
>
> Status: Specification for v1 (target design)
> Version: 1
> Owner: Engineer A (`crates/core/protocol/`)
> Consumer: Engineer B (Tauri commands, UI)

---

## Table of Contents

1. Purpose
2. Status & Scope
3. Transport
4. Message Envelope
5. Message Types
6. Handshake Flow
7. Session Flow
8. Chat Flow
9. Transfer Flow
10. Integrity
11. Error Handling
12. Versioning
13. Security
14. Implementation Notes

---

## 1. Purpose

This document defines the wire protocol spoken between two LocalOS
peers. It is the authoritative reference for message formats, state
transitions, and error semantics.

Every message sent over the wire must conform to this specification.
Any peer that sends a non-conforming message is rejected.

---

## 2. Status & Scope

**This document describes the target v1 protocol.**

The current implementation in `crates/core/protocol/message.rs` uses
TCP + length-prefixed JSON as a working prototype. That prototype
implements the same message shapes (Hello, JoinRequest, Chat, Leave)
but over TCP and serialized as JSON.

When the real QUIC-based transport lands, the prototype module is
deleted and replaced by an implementation matching this document.
The message shapes do not change — only the framing and transport.

**Scope of v1 protocol:**

- In scope: handshake, session join, chat, file transfer, integrity
- Out of scope: resource advertisement, Hostel Brain (v2)
- Out of scope: internet relay, mesh routing (never)

---

## 3. Transport

### 3.1 QUIC

The protocol runs over **QUIC** (RFC 9000), implemented via the
`quinn` crate. QUIC was chosen over raw TCP for three reasons:

1. **Stream multiplexing.** Control, chat, and file transfer use
   independent streams and cannot head-of-line block each other.
2. **Native encryption.** TLS 1.3 is baked into QUIC; there is no
   separate handshake to write.
3. **Connection migration.** If a peer's IP changes (rare on LAN but
   possible with DHCP), the connection survives.

### 3.2 TLS

- **TLS 1.3** only. TLS 1.2 and below are rejected.
- **rustls** as the TLS implementation. No OpenSSL dependency.
- **Self-signed certificates** generated per session. No CA needed.
- Certificates are bound to the peer's Ed25519 identity key.

### 3.3 Ports

- **Listen port:** `51000` (UDP, temporary — may change in v2)
- **mDNS:** `5353` (UDP, standard mDNS port)
- Peers advertise their QUIC listen port in the mDNS TXT record.

### 3.4 Streams

Each QUIC connection uses four long-lived bidirectional streams,
identified by their first byte after connection establishment:

| Stream ID | Name      | Carries                        |
|-----------|-----------|--------------------------------|
| 0x01      | Control   | Handshake, acks, session state |
| 0x02      | Chat      | Chat messages                  |
| 0x03      | Transfer  | File chunk data                |
| 0x04      | Resource  | Resource advertisements (v2)   |

Messages on the Control stream are strictly ordered. Messages on
Chat, Transfer, and Resource streams are not — receivers must handle
out-of-order arrival (see § 11.4).

---

## 4. Message Envelope

Every message on every stream begins with this fixed 12-byte header:
┌─────────────┬─────────────┬─────────────┬─────────────┐
│ version │ type │ length │ flags │
│ u16 (BE) │ u16 (BE) │ u32 (BE) │ u32 (BE) │
└─────────────┴─────────────┴─────────────┴─────────────┘

text

### 4.1 Field definitions

| Field   | Size | Meaning                                        |
|---------|------|------------------------------------------------|
| version | 2    | Protocol version. Currently `0x0001`.           |
| type    | 2    | Message type ID (see § 5).                      |
| length  | 4    | Length of the payload in bytes.                 |
| flags   | 4    | Bit 0: response expected. Bit 1: final chunk.   |

### 4.2 Payload

After the header, exactly `length` bytes of payload follow. The
payload's format depends on `type`.

- **Control-stream payloads:** CBOR (`ciborium` crate). Compact,
  schema-flexible, well-tooled.
- **Chat-stream payloads:** UTF-8 JSON for readability during v1.
  May move to CBOR in v2.
- **Transfer-stream payloads:** raw bytes. Metadata is sent
  separately on the Control stream.

### 4.3 Maximum message size

- Control stream: **64 KiB** maximum.
- Chat stream: **16 KiB** maximum per message.
- Transfer stream: **4 MiB** maximum per chunk (matches chunk size).

Any message exceeding these limits is rejected and the connection
is closed with error `0x8001 (MESSAGE_TOO_LARGE)`.

---

## 5. Message Types

Type IDs are grouped by category. Range determines routing.

### 5.1 Handshake (0x0001 – 0x00FF)

| ID     | Name             | Direction | Stream  | Payload               |
|--------|------------------|-----------|---------|-----------------------|
| 0x0001 | Hello            | both      | Control | `{peer_id, pubkey, name, version}` |
| 0x0002 | HelloAck         | both      | Control | `{peer_id, pubkey, name, version}` |
| 0x0003 | IdentityProof    | both      | Control | `{signature}`         |
| 0x0004 | HandshakeComplete| both      | Control | `{}`                  |

### 5.2 Session (0x0100 – 0x01FF)

| ID     | Name             | Direction | Stream  | Payload               |
|--------|------------------|-----------|---------|-----------------------|
| 0x0100 | JoinRequest      | peer→host | Control | `{session_code, peer_id, name}` |
| 0x0101 | JoinResponse     | host→peer | Control | `{accepted, reason?, session_id?}` |
| 0x0102 | RosterUpdate     | host→all  | Control | `{peers: [{peer_id, name, status}]}` |
| 0x0103 | SessionLeave     | both      | Control | `{}`                  |

### 5.3 Transfer (0x0200 – 0x02FF)

| ID     | Name             | Direction | Stream   | Payload               |
|--------|------------------|-----------|----------|-----------------------|
| 0x0200 | ManifestOffer    | sender→recv | Control | `{manifest_hash, file_count, total_bytes, signature}` |
| 0x0201 | ManifestResponse | recv→sender | Control | `{accepted, destination, conflict_policy}` |
| 0x0202 | ManifestBody     | sender→recv | Control | `{entries: [...]}` |
| 0x0203 | ChunkData        | sender→recv | Transfer | raw bytes             |
| 0x0204 | ChunkAck         | recv→sender | Control | `{chunk_id}`          |
| 0x0205 | ChunkNack        | recv→sender | Control | `{chunk_id, reason}`  |
| 0x0206 | TransferComplete | recv→sender | Control | `{transfer_id, verified: bool}` |
| 0x0207 | TransferAbort    | both      | Control | `{transfer_id, reason}` |

### 5.4 Chat (0x0300 – 0x03FF)

| ID     | Name             | Direction | Stream | Payload               |
|--------|------------------|-----------|--------|-----------------------|
| 0x0300 | ChatMessage      | both      | Chat   | `{session_id, from, text, ts, signature}` |

### 5.5 Control (0x0600 – 0x06FF)

| ID     | Name             | Direction | Stream  | Payload               |
|--------|------------------|-----------|---------|-----------------------|
| 0x0600 | Ping             | both      | Control | `{}`                  |
| 0x0601 | Pong             | both      | Control | `{}`                  |
| 0x0602 | Error            | both      | Control | `{code, message}`     |
| 0x0603 | GoAway           | both      | Control | `{reason}`            |

---

## 6. Handshake Flow

Before any other message can be sent, peers complete a handshake.
Initiator Responder
│ │
│ TCP: mDNS advertisement (peer_id, name, port) │
│ │
├──────────────── Hello ─────────────────────────────►│
│ {peer_id, pubkey (Ed25519), name, version} │
│ │
│◄─────────────── Hello ──────────────────────────────┤
│ │
│ TLS 1.3 handshake (QUIC native) │
│ Both peers present self-signed certificates │
│ bound to their Ed25519 public keys │
│ │
├──────────────── IdentityProof ─────────────────────►│
│ Signature over (pubkey_self || pubkey_peer) │
│ │
│◄─────────────── IdentityProof ──────────────────────┤
│ │
│ Both peers verify signatures │
│ │
├──────────────── HandshakeComplete ────────────────►│
│◄─────────────── HandshakeComplete ──────────────────┤
│ │

text

### 6.1 Rules

1. **No payload is accepted before HandshakeComplete.** Any
   non-handshake message before this point closes the connection
   with error `0x8002 (EARLY_MESSAGE)`.
2. **Version mismatch** closes the connection with
   `0x8003 (VERSION_MISMATCH)`.
3. **Signature failure** closes the connection with
   `0x8004 (INVALID_SIGNATURE)`.
4. **Duplicate handshake** on an established connection is ignored,
   not an error.
5. Handshake must complete within **5 seconds**. Otherwise the
   connection is closed with `0x8005 (HANDSHAKE_TIMEOUT)`.

---

## 7. Session Flow

A session is a temporary group joined by code.

### 7.1 Host creates session

1. Host generates a session ID (UUIDv4) and a 6-char join code
   (Crockford base32, no ambiguous letters).
2. Host advertises the session via mDNS with the join code in a
   short-lived TXT record.
3. Host awaits `JoinRequest` messages from peers.

### 7.2 Peer joins session
Peer Host
│ │
├──────────── JoinRequest ───────────────────────────►│
│ {session_code, peer_id, name} │
│ │ validate code
│ │ apply approval policy
│◄─────────── JoinResponse ───────────────────────────┤
│ {accepted: true, session_id} │
│ │
├──────────── RosterUpdate ──────────────────────────►│
│◄─────────── RosterUpdate ───────────────────────────┤
│ (broadcast to all connected peers) │

text

### 7.3 Rules

1. **Join code is validated by the host** before any peer is admitted.
2. **Wrong join code** returns `JoinResponse { accepted: false, reason: "invalid_code" }`. Peer is disconnected after.
3. **Duplicate join attempts** from the same peer_id are ignored.
4. **Host denies a peer** by replying with `accepted: false`. The
   peer is closed after the response is sent.
5. Session ends when the host leaves. All peers receive
   `SessionLeave` and transition to `IDLE`.

---

## 8. Chat Flow

Chat messages are signed, session-scoped, and stored locally on
each peer.
Peer A Peer B
│ │
├──────────── ChatMessage ───────────────────────────►│
│ {session_id, from, text, ts, signature} │
│ │
│ │ verify signature
│ │ store locally
│ │ emit to UI

text

### 8.1 Signature

The signature is Ed25519 over:
SHA-256(
"localos.chat.v1" ||
session_id ||
from_peer_id ||
timestamp_be_u64 ||
text_utf8
)

text

Domain-separated by the literal prefix `"localos.chat.v1"` to prevent
cross-protocol signature reuse.

### 8.2 Rules

1. **Invalid signature** → message rejected, logged, not stored.
2. **Session ID mismatch** → message rejected.
3. **Peer not in roster** → message rejected.
4. Messages are ordered by `timestamp_ms`. Ties broken by
   signature bytes lexicographically.
5. **History is bounded** to 500 messages per session in memory.
   Persistence to SQLite is optional in v1.

---

## 9. Transfer Flow

File transfer is the most complex flow. It is chunked, parallel,
resumable, and verified end-to-end.

### 9.1 Manifest exchange

Before any file bytes move, the sender sends a manifest describing
what will be transferred.
Sender Receiver
│ │
├──────────── ManifestOffer ─────────────────────────►│
│ {manifest_hash, file_count, total_bytes, sig} │
│ │ show summary to user
│ │ await approval
│◄─────────── ManifestResponse ───────────────────────┤
│ {accepted: true, destination, conflict_policy} │
│ │
├──────────── ManifestBody ──────────────────────────►│
│ {entries: [{path, size, hash}, ...]} │
│ │ verify manifest hash
│ │ verify signature

text

### 9.2 Chunk transfer

Files are split into **4 MiB** chunks. Each chunk is:

- Identified by its **BLAKE3 hash** (content-addressed, not offset-addressed).
- Verified by the receiver before acking.
- Retransmitted on nack or timeout.
- Persisted in the receiver's local bitmap (SQLite).
Sender Receiver
│ │
├──────────── ChunkData ────────────────────────────►│
│ (raw bytes, header has chunk_id + offset) │
│ │ compute BLAKE3
│ │ compare to expected
│ │
│◄─────────── ChunkAck ───────────────────────────────┤
│ {chunk_id} │
│ │
│ OR │
│ │
│◄─────────── ChunkNack ──────────────────────────────┤
│ {chunk_id, reason: "hash_mismatch"} │
│ │
├──────────── ChunkData (retransmit) ───────────────►│
│ │

text

### 9.3 Concurrency

- Up to **8 chunks in flight** per transfer (configurable).
- Backpressure applied by the sender's scheduler.
- No chunk is sent before the previous window's acks arrive.

### 9.4 Completion

1. All chunks received and individually verified.
2. Receiver reconstructs the file from `.part` chunks.
3. Receiver computes the file's BLAKE3 hash.
4. Receiver compares to the manifest entry.
5. If match: receiver verifies the manifest hash and signature.
6. If both match: receiver atomically renames `.part` → final name.
7. Receiver sends `TransferComplete { verified: true }`.
8. **Only then** does the sender mark the transfer complete in its UI.

### 9.5 Rules

1. **COMPLETE is never sent before step 6 above.** (Rules.md §18.8)
2. **Chunks are content-addressed**, not offset-addressed.
3. **Existing destination files are never silently overwritten.**
   The `ManifestResponse` carries a conflict policy:
   `replace | keep_both | skip | cancel`.
4. **Resume** uses the receiver's verified chunk bitmap.
   On reconnect, receiver sends `{missing_chunk_ids}` and sender
   resumes from that set.
5. **Path traversal** is rejected: any entry with `..`, absolute
   paths, or symlinks pointing outside the destination is refused.

---

## 10. Integrity

Three levels of integrity verification:

| Level    | Algorithm | Verified by | When                     |
|----------|-----------|-------------|--------------------------|
| Chunk    | BLAKE3    | Receiver    | On each chunk arrival    |
| File     | BLAKE3    | Receiver    | After all chunks arrive  |
| Manifest | BLAKE3    | Receiver    | After all files received |
| Signature| Ed25519   | Receiver    | After manifest hash matches |

**Algorithm choice:** BLAKE3 for speed (10+ GB/s on modern CPUs) and
resistance to length-extension attacks. SHA-256 is supported as a
fallback for interop with non-LocalOS clients (v2).

**Hashing is always streaming.** No file is ever fully buffered in
memory.

---

## 11. Error Handling

### 11.1 Error codes

| Range       | Category     |
|-------------|--------------|
| 0x8001–0x80FF | Transport   |
| 0x8100–0x81FF | Protocol    |
| 0x8200–0x82FF | Security    |
| 0x8300–0x83FF | Session     |
| 0x8400–0x84FF | Transfer    |

### 11.2 Common errors

| Code   | Name                | Meaning                              |
|--------|---------------------|--------------------------------------|
| 0x8001 | MESSAGE_TOO_LARGE   | Exceeds configured maximum           |
| 0x8002 | EARLY_MESSAGE       | Message before handshake complete    |
| 0x8003 | VERSION_MISMATCH    | Protocol versions incompatible       |
| 0x8004 | INVALID_SIGNATURE   | Ed25519 verification failed          |
| 0x8005 | HANDSHAKE_TIMEOUT   | Handshake took > 5s                  |
| 0x8101 | MALFORMED_MESSAGE   | CBOR/JSON decode failed              |
| 0x8102 | UNKNOWN_TYPE        | Unknown message type ID              |
| 0x8201 | PATH_TRAVERSAL      | Filename attempted to escape scope   |
| 0x8202 | UNAUTHORIZED        | Peer not permitted for this action   |
| 0x8301 | INVALID_JOIN_CODE   | Wrong session code                   |
| 0x8302 | SESSION_FULL        | Host has reached peer limit          |
| 0x8401 | CHUNK_HASH_MISMATCH | Received chunk failed verification   |
| 0x8402 | DISK_FULL           | Receiver cannot write                |

### 11.3 Fail-closed behavior

Any malformed message, unverifiable signature, or unknown type
**closes the connection**. There is no "ignore and continue" path.
This is a deliberate choice: LocalOS runs on untrusted networks, and
tolerance for bad input is tolerance for exploitation.

### 11.4 Out-of-order arrival

Chat, Transfer, and Resource streams can deliver messages out of
order. Receivers must handle:

- **Chat:** sort by timestamp, deduplicate by message ID.
- **Transfer:** store chunks in the receiver's bitmap, apply by ID.
- **Resource:** merge into local index, newest advertisement wins.

Control-stream messages are strictly ordered by QUIC.

---

## 12. Versioning

The `version` field in every message envelope is a `u16`.

- **Same major version:** compatible. Any optional-field additions
  are backwards-compatible.
- **Different major version:** connection is closed with
  `VERSION_MISMATCH`. No downgrade path.

**Bumping rules:**

- Adding a new message type: **no bump needed** (receivers reject
  unknown types, but old peers still work for known types).
- Adding an optional field to an existing message: **minor bump**
  (`0x0001` → `0x0002`, still compatible).
- Changing a field's type or removing a field: **major bump**
  (`0x0001` → `0x0100`, incompatible). Requires updating
  `Protocol.md` and `Architecture.md`.

---

## 13. Security

### 13.1 Threat model

In scope:

- Malicious peer on the same LAN
- Malformed messages
- Path traversal attempts
- Corrupted chunks in transit
- Replay attacks within a session

Out of scope (v1):

- Nation-state adversaries
- Physical device compromise
- Supply-chain attacks on dependencies
- Side-channel attacks on Ed25519

### 13.2 Cryptographic primitives

| Primitive | Algorithm   | Purpose                     |
|-----------|-------------|-----------------------------|
| Transport | TLS 1.3     | Confidentiality, integrity  |
| Identity  | Ed25519     | Peer authentication         |
| Hashing   | BLAKE3      | Chunk and file integrity    |
| Session ID| UUIDv4      | Session uniqueness          |
| Join code | Crockford32 | Human-transferable secret   |

**No custom cryptography.** All primitives are from audited crates:
`rustls`, `ed25519-dalek`, `blake3`.

### 13.3 Key lifetime

- Session identity keys are **ephemeral**. Discarded at session end.
- Optional persistent identity is stored in the OS keychain only
  with explicit user consent. Never used for session keys.
- TLS session keys are ephemeral by construction (QUIC).

---

## 14. Implementation Notes

### 14.1 For Engineer A

- The protocol module lives in `crates/core/protocol/`.
- The transport module lives in `crates/core/net/`.
- All message types must `#[derive(Serialize, Deserialize)]`.
- Every message has a `round_trip` unit test.
- Every state transition is logged at `debug`.
- Networking must be cancellable at every `.await` (Rules.md §3.12).

### 14.2 For Engineer B

- Protocol changes require a version bump and an update to this file.
- Tauri commands consume `crates/core`'s public API, never the wire
  format directly.
- The UI never sees raw protocol messages. It sees domain objects:
  `Peer`, `ChatMessage`, `Transfer`, `Resource`.

### 14.3 Testing requirements

The following tests are mandatory (Rules.md §11):

1. `hello_round_trip` — encode/decode symmetry
2. `version_mismatch_rejected` — wrong version closes connection
3. `signature_failure_rejected` — invalid signature closes connection
4. `path_traversal_rejected` — `../` in filename is refused
5. `out_of_order_chunks_accepted` — chunks stored by ID
6. `oversized_message_rejected` — 1 MiB+ message fails
7. `duplicate_join_ignored` — same peer_id joins twice
8. `manifest_verification_required` — no complete without hash match

---

End of protocol specification.