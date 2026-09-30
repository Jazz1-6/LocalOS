# Workflow — LocalOS v1

> Runtime behavior of LocalOS v1, from first launch to completed transfer.
>
> Status: v1 Specification
> Version: 1.0
> Platforms: Windows 11 · Linux · macOS
> Stack: Rust core · Tauri UI · QUIC · mDNS · SQLite · BLAKE3

---

## Table of Contents

1. Purpose
2. Actors & Roles
3. Lifecycle Overview
4. First Launch
5. Discovery Flow
6. Session & Group Flow
7. Pairing & Approval Flow
8. File Transfer Flow
9. Interruption & Resume Flow
10. Integrity Verification Flow
11. Collision Handling Flow
12. Clipboard Flow
13. Chat Flow
14. Resource Discovery Flow
15. Hostel Brain Query Flow
16. Pause / Resume / Cancel Flow
17. Failure Handling Flows
18. Reconnection Flow
19. Shutdown Flow
20. Cross-Platform Behavior
21. Telemetry & Logging Flow
22. Demo Script
23. Workflow Acceptance Checklist

---

## 1. Purpose

This document describes how LocalOS v1 behaves at runtime. It is written in terms of user-visible flows, system state transitions, and protocol interactions. It is the reference for implementation, testing, and demo.

It does not describe implementation internals. Those live in `Architecture.md`. This file describes *what happens, in what order, and under what conditions*.

---

## 2. Actors & Roles

| Actor       | Description                                                       |
|-------------|-------------------------------------------------------------------|
| Host        | Peer that creates a session and generates the group code          |
| Peer        | Any device that joins a session                                   |
| Sender      | Peer that initiates a transfer                                    |
| Receiver    | Peer that accepts a transfer                                      |
| Local user  | Human operating the device                                        |
| Local UI    | Tauri frontend                                                    |
| Local core  | Rust engine                                                       |

A single device can be Host and Sender at the same time. A single device can be Peer and Receiver at the same time. Roles are per-action, not per-device.

---

## 3. Lifecycle Overview

```text
┌─────────────┐
│  FIRST RUN  │ generate identity, open store, start discovery
└──────┬──────┘
       │
       ▼
┌─────────────┐
│  DISCOVERY  │ browse LAN, list peers
└──────┬──────┘
       │
       ▼
┌─────────────┐
│   SESSION   │ create or join group
└──────┬──────┘
       │
       ▼
┌─────────────┐
│   ACTIVE    │ transfer · clipboard · chat · resources
└──────┬──────┘
       │
       ▼
┌─────────────┐
│  SHUTDOWN   │ flush store, discard ephemeral identity
└─────────────┘
```

---

## 4. First Launch

### 4.1 Steps

1. Application starts.
2. Core generates an ephemeral Ed25519 keypair for the session.
3. Core derives peer id from the public key fingerprint.
4. Core assigns a display name: `<User>-<Device>`.
5. Core opens the local SQLite store and runs migrations.
6. Core constructs platform implementations (discovery, clipboard, paths, firewall) and injects them.
7. Platform layer starts mDNS advertise and browse.
8. UI renders the peer list view.
9. UI shows: `You: Chethan-MacBook` and nearby peers.

### 4.2 Guarantees

- No account creation.
- No login prompt.
- No network access to the public internet.
- No telemetry transmitted.

### 4.3 Failure Modes

| Failure                  | Behavior                                          |
|--------------------------|---------------------------------------------------|
| mDNS unavailable         | Show manual IP:port entry                         |
| Firewall blocks UDP      | Prompt user; fall back to manual mode             |
| Store cannot be opened   | Show error; do not start session                  |
| Keypair generation fails | Show error; do not start session                  |

---

## 5. Discovery Flow

### 5.1 Sequence

```text
Host / Peer A                                                  Peer B
      │                                                          │
      ├────────────────── mDNS advertise ───────────────────────►│
      │                  (service, peer id, name, session id)    │
      │                                                          │
      │◄───────────────── mDNS advertise ────────────────────────┤
      │                  (service, peer id, name, session id)    │
      │                                                          │
      │               both peers appear in each other's UI       │
      │                                                          │
```

### 5.2 Advertised Fields

| Field       | Example            | Notes                          |
|-------------|--------------------|--------------------------------|
| service     | `_localos._udp`    | mDNS service type              |
| peer_id     | `b3:7f:...`        | fingerprint of public key      |
| name        | `Chethan-MacBook`  | display name                   |
| session_id  | `sess-9f2a`        | present only if hosting        |
| port        | `51000`            | QUIC listen port               |

### 5.3 Rules

1. Never advertise filenames, contents, keys, or resources.
2. Advertised data is untrusted until handshake completes.
3. Advertisement refreshes periodically.
4. Advertisement stops on session end or shutdown.
5. Manual IP:port entry is always available.

### 5.4 Failure Modes

| Failure              | Behavior                                       |
|----------------------|------------------------------------------------|
| No peers found       | Show empty state with manual entry option      |
| mDNS silent          | Continue browsing; do not block UI             |
| Duplicate peer id    | Show warning; prefer most recent advertisement |

---

## 6. Session & Group Flow

### 6.1 Host Creates Session

```text
Host
 │
 │ user clicks "Create Group"
 │
 ▼
Core generates session id + short group code
 │
 ▼
Core begins advertising session via mDNS
 │
 ▼
UI displays: "Group code: 7F3K-92QX"
 │
 ▼
Host awaits peers
```

**Steps:**

1. User clicks `Create Group`.
2. Core generates a session id.
3. Core generates a short group code (e.g. `7F3K-92QX`).
4. Core records the session in SQLite with an expiry.
5. Core begins advertising the session via mDNS.
6. UI shows the code and a live roster.

### 6.2 Peer Joins Session

```text
Peer                                                      Host
 │                                                         │
 │ selects host from list                                  │
 │ enters group code                                       │
 │                                                         │
 ├───────────────────── QUIC connect ─────────────────────►│
 ├───────────────────── handshake ────────────────────────►│
 │◄──────────────────── handshake ─────────────────────────┤
 │                                                         │
 ├───────────────────── group code ───────────────────────►│
 │                                                         │ validate code
 │                                                         │ approve peer
 │◄──────────────────── approval ──────────────────────────┤
 │                                                         │
 ├───────────────────── session active ───────────────────►│
```

**Steps:**

1. Peer selects host from nearby list.
2. Peer enters group code.
3. Peer initiates QUIC connection.
4. Handshake runs (see Section 7).
5. Peer submits group code.
6. Host validates code.
7. Host approves peer.
8. Peer enters roster on both sides.
9. Session is active.

### 6.3 Session End

Triggers:

- Host leaves the session.
- Group code expires.
- Host cancels the session.
- Host application shuts down.

On session end:

1. Core stops advertising the session.
2. Core closes active QUIC connections gracefully.
3. Core discards ephemeral session state.
4. Core removes session row from SQLite unless user saved it.
5. UI returns to discovery view.

### 6.4 Rules

1. No peer enters the roster without code validation.
2. No payload is accepted before approval.
3. Session state is ephemeral unless user opts to save.
4. Group codes expire after a configurable window.
5. Session end discards ephemeral state on all peers.

---

## 7. Pairing & Approval Flow

### 7.1 Handshake Sequence

```text
Initiator                                                 Responder
 │                                                            │
 ├─────────────────── hello {peer_id, pubkey} ───────────────►│
 │◄────────────────── hello {peer_id, pubkey} ────────────────┤
 │                                                            │
 ├─────────────────── key exchange (ephemeral) ──────────────►│
 │◄────────────────── key exchange (ephemeral) ───────────────┤
 │                                                            │
 │                    both derive session keys                │
 │                                                            │
 ├─────────────────── identity proof (signed) ───────────────►│
 │◄────────────────── identity proof (signed) ────────────────┤
 │                                                            │
 │                    both verify signatures                  │
 │                                                            │
 ├─────────────────── group code ────────────────────────────►│
 │                                                            │ validate
 │◄────────────────── approval (granted/denied) ──────────────┤
 │                                                            │
```

### 7.2 Rules

1. Both peers authenticate before any payload is accepted.
2. Unknown or malformed handshake messages are rejected.
3. Wrong group code results in denial, not retry.
4. Denied peers are disconnected immediately.
5. Session keys are ephemeral; no reuse across sessions.

### 7.3 Failure Modes

| Failure                | Behavior                                       |
|------------------------|------------------------------------------------|
| Malformed handshake    | Reject; close connection                       |
| Signature invalid      | Reject; close connection                       |
| Wrong group code       | Deny; close connection                         |
| Handshake timeout      | Close connection; log                          |
| Duplicate handshake    | Ignore; keep existing session                  |

---

## 8. File Transfer Flow

### 8.1 Overview

```text
Sender                                                   Receiver
 │                                                          │
 │ build manifest                                           │
 │ {paths, sizes, hashes}                                   │
 │                                                          │
 ├─────────────────── manifest ────────────────────────────►│
 │                                                          │ show summary
 │                                                          │ approve destination
 │                                                          │
 │◄────────────────── approval ─────────────────────────────┤
 │                                                          │
 ├─────────────────── chunk #N ────────────────────────────►│
 │                                                          │ verify hash
 │                                                          │ write to .part
 │                                                          │ persist chunk id
 │◄────────────────── ack #N ───────────────────────────────┤
 │                                                          │
 │              (up to 8 chunks in flight)                  │
 │                                                          │
 ├─────────────────── final chunk ─────────────────────────►│
 │                                                          │ reconstruct file
 │                                                          │ verify file hash
 │                                                          │ verify manifest
 │                                                          │ atomic rename
 │◄────────────────── COMPLETE ─────────────────────────────┤
```

### 8.2 Initiation

**Steps:**

1. User selects file(s) or folder in UI.
2. Core walks the selection recursively.
3. Core builds a manifest:
   - relative paths,
   - sizes,
   - per-file BLAKE3,
   - manifest BLAKE3.
4. Sender sends manifest to receiver.
5. Receiver UI shows summary: file count, total size, destination.
6. Receiver approves destination.
7. Transfer begins.

### 8.3 Chunk Scheduling

1. Sender computes the chunk list from the manifest.
2. Sender schedules up to `concurrency` chunks in flight.
3. Default concurrency: 8.
4. Default chunk size: 4 MiB.
5. Backpressure is applied when the in-flight window is full.

### 8.4 Chunk Transfer (single chunk)

```text
Sender                                                   Receiver
 │                                                          │
 ├─────────────────── chunk {id, off, len, hash} ──────────►│
 │                                                          │ receive bytes
 │                                                          │ compute BLAKE3
 │                                                          │ compare to hash
 │                                                          │
 │                                                          │ if match:
 │                                                          │ write to .part
 │                                                          │ persist chunk id
 │◄────────────────── ack {id} ─────────────────────────────┤
 │                                                          │
 │                                                          │ if mismatch:
 │◄────────────────── nack {id} ────────────────────────────┤
 │                                                          │
 │ retransmit on nack or timeout                            │
```

### 8.5 Completion

1. All chunks received and verified.
2. Receiver reconstructs the file from `.part`.
3. Receiver computes the file hash.
4. Receiver compares to manifest entry.
5. If match, receiver verifies the manifest hash.
6. If match, receiver verifies the manifest signature.
7. Receiver performs atomic rename `.part` → final name.
8. Receiver sends `COMPLETE`.
9. Sender marks transfer complete in UI.

**Rule:** COMPLETE is never sent before step 7.

### 8.6 Rules

1. Chunk id is content-derived, not offset-derived.
2. Receiver verifies every chunk before acking.
3. Receiver persists verified chunk ids to SQLite.
4. Sender retransmits on nack or timeout.
5. Out-of-order arrival is accepted.
6. No full-file buffering at any point.
7. Existing destination files are never silently overwritten.

### 8.7 Failure Modes

| Failure              | Behavior                                       |
|----------------------|------------------------------------------------|
| Chunk hash mismatch  | Retransmit that chunk                          |
| Chunk timeout        | Retransmit that chunk                          |
| Peer disconnect      | Checkpoint; hold; resume on reconnect          |
| Disk full            | Pause; surface error; preserve partial state   |
| Manifest mismatch    | Abort transfer; do not rename                  |
| Signature invalid    | Abort transfer; do not rename                  |

---

## 9. Interruption & Resume Flow

### 9.1 Sequence

```text
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

### 9.2 Steps

1. Network drops mid-transfer.
2. Sender detects connection loss.
3. Sender stops scheduling new chunks.
4. Sender checkpoints the set of acked chunk ids.
5. Receiver stops accepting new chunks.
6. Receiver checkpoints the set of verified chunk ids.
7. Both sides persist state to SQLite.
8. UI shows: `Paused — waiting for reconnect`.
9. When connection is restored:
   - Receiver sends its verified chunk id set.
   - Sender computes the missing chunk id set.
   - Sender resumes from the missing set.
10. Transfer continues from the last verified chunk.

### 9.3 Guarantees

- Verified chunks are never discarded on disconnect.
- Resume state survives application restart on both sides.
- Resume does not re-transfer verified chunks.
- Resume does not require user intervention if the peer reconnects.

### 9.4 Failure Modes

| Failure              | Behavior                                       |
|----------------------|------------------------------------------------|
| Peer never returns   | Transfer stays paused; user may cancel         |
| Store write fails    | Log error; attempt fallback; do not corrupt    |
| Chunk set diverges   | Receiver wins; sender re-queries              |
| Resume after upgrade | Reject if protocol version differs             |

---

## 10. Integrity Verification Flow

### 10.1 Levels

| Level           | Checked By | When                          |
|-----------------|------------|-------------------------------|
| Per-chunk hash  | Receiver   | On each chunk arrival         |
| Per-file hash   | Receiver   | After all chunks for that file|
| Manifest hash   | Receiver   | After all files received      |
| Manifest sig    | Receiver   | After manifest hash matches   |

### 10.2 Sequence

```text
Receive chunk
 │
 ▼
Compute BLAKE3
 │
 ▼
Compare to descriptor
 │
 ├── match → write to .part, persist chunk id, ack
 │
 └── mismatch → discard, nack, retransmit

All chunks in file received
 │
 ▼
Reconstruct file from .part
 │
 ▼
Compute file BLAKE3
 │
 ▼
Compare to manifest entry
 │
 ├── match → proceed
 │
 └── mismatch → abort transfer, do not rename

All files received
 │
 ▼
Verify manifest hash
 │
 ▼
Verify manifest signature
 │
 ├── both ok → atomic rename, COMPLETE
 │
 └── either fail → abort transfer, do not rename
```

### 10.3 Rules

1. No chunk is acked before hash verification.
2. No file is renamed before file hash verification.
3. No transfer is completed before manifest verification.
4. All hashing is streaming.
5. BLAKE3 is the default; SHA-256 is fallback.

---

## 11. Collision Handling Flow

### 11.1 Sequence

```text
Receiver detects existing file at destination path
 │
 ▼
UI prompts:
[ Replace ] [ Keep both ] [ Skip ] [ Cancel ]
 │
 ├── Replace → overwrite after verification
 ├── Keep both → append suffix to new file
 ├── Skip → skip this file, continue transfer
 └── Cancel → abort transfer, clean up
```

### 11.2 Rules

1. Never silently overwrite.
2. Prompt appears before writing the first byte of the file.
3. Policy can be applied per file or to all files.
4. Policy choice is logged.
5. Cancel aborts cleanly and removes partial state.

---

## 12. Clipboard Flow

### 12.1 Sequence

```text
Device A                                                 Device B
 │                                                          │
 │ user copies text                                         │
 │                                                          │
 │ platform layer emits event                               │
 │                                                          │
 ├─────────────────── clipboard item (TTL) ────────────────►│
 │                                                          │ if opt-in:
 │                                                          │ apply locally
 │                                                          │
 │ item expires after TTL                                   │
```

### 12.2 Steps

1. Local clipboard changes.
2. Platform layer emits a clipboard event.
3. Core checks size against cap.
4. Core attaches a TTL.
5. Core broadcasts the item to session peers.
6. Receivers check opt-in setting.
7. If enabled, receivers apply the item to local clipboard.
8. Item expires after TTL.

### 12.3 Rules

1. Payload size is bounded before broadcast.
2. Receiver applies only if opt-in is enabled.
3. Expired items are never applied.
4. Clipboard sync never blocks transfer traffic.
5. Only text, links, small images, and code in v1.

### 12.4 Failure Modes

| Failure              | Behavior                                       |
|----------------------|------------------------------------------------|
| Payload too large    | Drop; log; do not broadcast                    |
| Receiver opt-out     | Drop silently on receiver                      |
| Platform unavailable | Disable clipboard feature; log                 |
| TTL expired in flight| Drop on arrival                                |

---

## 13. Chat Flow

### 13.1 Sequence

```text
Peer A                                                   Peer B
 │                                                          │
 │ user types message                                       │
 │ sign with session key                                    │
 │                                                          │
 ├─────────────────── signed message ──────────────────────►│
 │                                                          │ verify signature
 │                                                          │ append to history
 │                                                          │ render in UI
```

### 13.2 Steps

1. User types a message in the group view.
2. Core signs the message with the sender's session key.
3. Core broadcasts the message over the session stream.
4. Receivers verify the signature.
5. Receivers append to local SQLite history.
6. UI renders the message.

### 13.3 Rules

1. Messages are signed by sender's session key.
2. Invalid signatures are rejected.
3. History respects user-configured expiry.
4. No message leaves the LAN.
5. Chat ends with the session.
6. No message is relayed beyond session peers.

### 13.4 Failure Modes

| Failure              | Behavior                                       |
|----------------------|------------------------------------------------|
| Invalid signature    | Reject; log; do not render                     |
| Store write fails    | Log; show message in memory only               |
| Peer disconnect      | Message delivered to remaining peers           |
| Session ends         | History respects expiry; no further delivery   |

---

## 14. Resource Discovery Flow

### 14.1 Advertise Sequence

```text
Peer A                                                   Peer B
 │                                                          │
 │ user adds resource                                       │
 │ sign advertisement                                       │
 │                                                          │
 ├─────────────────── signed ad ───────────────────────────►│
 │                                                          │ validate signature
 │                                                          │ store in local index
```

### 14.2 Steps

1. User adds a resource: kind, description, availability.
2. Core signs the advertisement with the peer's session key.
3. Core broadcasts the ad to session peers.
4. Receivers validate the signature.
5. Receivers store the ad in the local index.
6. Ads expire after configurable TTL.

### 14.3 Rules

1. Unsigned ads are rejected.
2. Ads expire after TTL.
3. Ads never leave the LAN.
4. Ads are validated before storing.
5. Ads are searchable locally.

### 14.4 Failure Modes

| Failure              | Behavior                                       |
|----------------------|------------------------------------------------|
| Invalid signature    | Reject; log                                    |
| Malformed ad         | Reject; log                                    |
| Store write fails    | Log; keep in memory for session                |
| TTL expired          | Remove from index                              |

---

## 15. Hostel Brain Query Flow

### 15.1 Sequence

```text
User
 │
 │ types: "who has DBMS notes?"
 │
 ▼
Core tokenizes query
 │
 ▼
Core searches local ad index
 │
 ▼
Core ranks results by match + availability
 │
 ▼
UI renders matching peers + contact action
```

### 15.2 Steps

1. User types a natural-language query.
2. Core tokenizes the query.
3. Core searches the local ad index.
4. Core ranks results by match strength and availability.
5. UI renders matches with peer name and contact action.

### 15.3 Rules

1. Query never leaves the LAN.
2. Query is never sent to any peer; it runs locally.
3. Only locally stored ads are searched.
4. Expired ads are excluded.
5. Results show peer name and resource description.

### 15.4 Failure Modes

| Failure              | Behavior                                       |
|----------------------|------------------------------------------------|
| No results           | Show empty state with suggestions              |
| Index empty          | Show hint to add resources                     |
| Malformed query      | Show empty state; do not crash                 |

---

## 16. Pause / Resume / Cancel Flow

### 16.1 Pause

1. User clicks `Pause`.
2. Sender stops scheduling new chunks.
3. In-flight chunks complete or timeout.
4. Sender checkpoints state.
5. Receiver checkpoints state.
6. UI shows `Paused`.

### 16.2 Resume

1. User clicks `Resume`.
2. Sender queries receiver for missing chunk ids.
3. Receiver responds with its verified set.
4. Sender resumes from the missing set.
5. UI shows `Running`.

### 16.3 Cancel

1. User clicks `Cancel`.
2. Sender stops scheduling.
3. In-flight chunks are abandoned.
4. Receiver stops accepting.
5. Receiver removes `.part` files for this transfer.
6. Both sides clear resume records for this transfer.
7. UI shows `Cancelled`.

### 16.4 Rules

1. Pause preserves all verified chunks.
2. Resume never re-transfers verified chunks.
3. Cancel removes partial state cleanly.
4. Cancel never leaves orphaned `.part` files.
5. All three actions are cancellable and idempotent.

---

## 17. Failure Handling Flows

### 17.1 Network Loss

```text
Connection lost
 │
 ▼
Sender stops scheduling
Receiver stops accepting
 │
 ▼
Both checkpoint state
 │
 ▼
UI shows "Reconnecting…"
 │
 ▼
On reconnect: resume flow (Section 9)
```

### 17.2 Application Restart

```text
App crashes or is closed
 │
 ▼
On next launch:
· reload state from SQLite
· detect incomplete transfers
· detect orphan .part files
· clean orphans without resume records
· resume transfers with valid records
```

### 17.3 Corrupted Chunk

```text
Chunk arrives
 │
 ▼
Hash mismatch
 │
 ▼
Discard chunk
 │
 ▼
Send nack
 │
 ▼
Sender retransmits
```

### 17.4 Peer Disconnect

```text
Peer disconnects
 │
 ▼
Mark peer offline
 │
 ▼
Hold active transfers
 │
 ▼
On reconnect: resume flow
 │
 ▼
If peer never returns: user may cancel
```

### 17.5 Disk Full

```text
Write fails: no space
 │
 ▼
Pause transfer
 │
 ▼
Surface error in UI
 │
 ▼
Preserve partial state
 │
 ▼
On user action: retry or cancel
```

### 17.6 Duplicate Request

```text
Chunk id already verified
 │
 ▼
Ignore duplicate
 │
 ▼
Re-send ack
```

### 17.7 Out-of-Order Arrival

```text
Chunk arrives out of order
 │
 ▼
Verify hash
 │
 ▼
Store by chunk id
 │
 ▼
Ack
```

### 17.8 Malformed Message

```text
Message received
 │
 ▼
Length check fails or schema invalid
 │
 ▼
Reject message
 │
 ▼
Log error (no contents)
 │
 ▼
Do not crash
```

### 17.9 Path Traversal

```text
Filename contains ../ or absolute path
 │
 ▼
Reject file
 │
 ▼
Log security event
 │
 ▼
Do not write
 │
 ▼
Do not crash
```

---

## 18. Reconnection Flow

### 18.1 Sequence

```text
Peer goes offline
 │
 ▼
Local core marks peer offline
 │
 ▼
Local core keeps transfer records
 │
 ▼
Peer comes back online
 │
 ▼
Local core sees mDNS advertisement
 │
 ▼
Local core reconnects via QUIC
 │
 ▼
Handshake runs again
 │
 ▼
Both sides re-verify session state
 │
 ▼
If session still valid: resume transfers
 │
 ▼
If session expired: user must rejoin
```

### 18.2 Rules

1. Reconnection is automatic when the peer reappears.
2. Session validity is checked before resuming.
3. Expired sessions require the user to rejoin.
4. Verified chunks are preserved across reconnects.
5. Reconnection never blocks the UI.

---

## 19. Shutdown Flow

### 19.1 Steps

1. User closes the application.
2. Core stops mDNS advertise.
3. Core stops mDNS browse.
4. Core closes active QUIC connections gracefully.
5. Core flushes SQLite.
6. Core removes `.part` files without resume records.
7. Core discards ephemeral identity unless user saved it.
8. Application exits.

### 19.2 Rules

1. No data is written after flush begins.
2. No `.part` file is left orphaned without a resume record.
3. Ephemeral identity is discarded unless saved.
4. Saved identity is persisted only if user opted in.
5. Shutdown is idempotent.

---

## 20. Cross-Platform Behavior

| Aspect        | Linux              | Windows            | macOS              |
|---------------|--------------------|--------------------|--------------------|
| Paths         | `~/.local/share`   | `%APPDATA%`        | `~/Library/...`    |
| Discovery     | avahi / mdns-sd    | Bonjour / mdns-sd  | Bonjour / mdns-sd  |
| Clipboard     | X11 / Wayland      | Win32              | NSPasteboard       |
| Firewall      | ufw / none         | Defender prompt    | Gatekeeper prompt  |
| Packaging     | `.deb`, `.AppImage`| `.msi`             | `.dmg`             |

Behavior from the user's perspective is identical on all three platforms. Only the integration layer differs.

---

## 21. Telemetry & Logging Flow

### 21.1 What Is Logged

- State transitions (session, transfer, pairing).
- Errors with context.
- Security events (rejected traversal, invalid signature).
- Performance counters (throughput, retry rate).

### 21.2 What Is Never Logged

- File contents.
- Clipboard payloads.
- Chat message bodies (at info level).
- Private keys.
- Credentials or tokens.

### 21.3 Flow

```text
Event occurs
 │
 ▼
Structured record built
 │
 ▼
Redaction pass
 │
 ▼
Write to local log file
 │
 ▼
Rotate when size limit reached
```

### 21.4 Rules

1. Logs are local only.
2. No telemetry leaves the device.
3. Logs are rotated and bounded.
4. Redaction is applied before write.

---

## 22. Demo Script

1. Two laptops on one LAN, no internet.
2. Both open LocalOS, discover each other.
3. Host creates a group; peer joins with code.
4. Send a 100 GB folder.
5. Show real-time throughput.
6. Kill the network connection at ~78%.
7. Reconnect.
8. Resume from last verified chunk.
9. Corrupt a test chunk; show detection and retransmit.
10. Finish; show manifest verification passed.
11. Send a chat message.
12. Copy text on one device; paste on the other.
13. Query: `who has DBMS notes?`; show result.
14. Show benchmark table.

---

## 23. Workflow Acceptance Checklist

The following must be demonstrable for v1:

- [ ] First launch generates identity without accounts.
- [ ] Two devices discover each other over mDNS.
- [ ] Host creates a group with a short code.
- [ ] Peer joins with the code.
- [ ] Wrong code is rejected.
- [ ] A directory with nested files transfers successfully.
- [ ] Large files stream without full-memory load.
- [ ] Multiple chunks transfer concurrently.
- [ ] A forced disconnect does not corrupt verified chunks.
- [ ] Restarting the app resumes from the last verified chunk.
- [ ] A corrupted chunk is detected and retransmitted.
- [ ] Final integrity check passes before COMPLETE.
- [ ] Path traversal attempts are rejected.
- [ ] Existing destination files are never silently overwritten.
- [ ] Clipboard syncs between two devices with TTL and opt-in.
- [ ] Group chat works with no internet.
- [ ] Resource ads are signed, stored, and searchable locally.
- [ ] Hostel Brain returns ranked local results.
- [ ] Pause, resume, and cancel all preserve destination state.
- [ ] Logs contain no contents, credentials, or keys.
- [ ] Shutdown leaves no orphan `.part` files without a record.
- [ ] All flows run on Windows, Linux, and macOS.

If any item is false, v1 is not done.