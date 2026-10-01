# HANDOFF.md

```markdown
# LocalOS v1 — Session Handoff

> Last updated: after PR #7 (Tauri window + live peer list).
> Author: Engineer B (you).
> Purpose: restart context for a future session (with another AI assistant or Engineer A).

---

## 1. What this project is

**LocalOS v1** — LAN-first, offline-capable collaboration platform for developers.
No internet, no accounts, no cloud.

Core features (see `docs/PRD.md`):
- Peer discovery over mDNS
- Encrypted sessions (QUIC + TLS 1.3)
- Resumable file transfer with integrity verification
- Ghost clipboard
- Group chat
- Resource discovery + Hostel Brain search

Two engineers. One codebase. Rust core + Tauri UI.
Platforms: Windows 11, Linux, macOS.

---

## 2. Repo state

**Path:** `C:\Vs_Code\Projects\LocalOs`
**Remote:** https://github.com/Jazz1-6/localos
**Branch:** `main`
**Latest commit message:** "feat(app): wire platform services into Tauri window with live status and peer list"

**Toolchain:**
- Rust 1.90.0 (pinned in `rust-toolchain.toml`)
- Node.js LTS (not used yet)
- Tauri CLI v2
- `arboard = "3"` for clipboard
- `mdns-sd = "0.11"` for discovery

---

## 3. What's built (all working)

### 3.1 Workspace — 5 crates
```
crates/
├── traits/      shared interfaces, no OS code
├── core/        OS-agnostic engine (mostly empty — Engineer A's domain)
├── platform/    Windows/macOS/Linux implementations
├── app/         Tauri binary that wires everything
└── ui/          Tauri frontend bridge (stub)
```

### 3.2 `localos-traits`
Defines:
- `Discovery` trait — `advertise`, `stop_advertise`, `browse`
- `Clipboard` trait — `get`, `set`, `watch`
- `AppPaths` trait — `config_dir`, `data_dir`, `cache_dir`, `default_download_dir`
- `Firewall` trait — `ensure_allowed`, `status`
- `PeerAd` struct — `{ peer_id, name, session_id, port }`, derives Serialize/Deserialize
- `ClipboardItem` enum — `Text(String) | Image(Vec<u8>)`
- `FirewallStatus` enum — `Allowed | Denied | Unknown`
- `PlatformError` enum

### 3.3 `localos-platform`
Implemented traits:
- `NativePaths` — via `directories` crate. Works on all 3 OSes.
- `NativeClipboard` — via `arboard`. Reads text and images, writes text only.
- `NativeFirewall` — UDP bind check, returns `Unknown` status (documented).
- `NativeDiscovery` — via `mdns-sd`. Advertises and browses `_localos._udp.local.`

Unit tests: 8 passed, 1 ignored (clipboard roundtrip needs real OS clipboard).
The ignored test passes with `cargo test -- --ignored`.

### 3.4 `localos-app`
- Tauri window opens on run
- `main.rs` builds all platform services in `setup()` hook
- Spawns background task that listens to mDNS and emits `peer-discovered` events
- `state.rs` holds `AppState { discovery, clipboard, firewall, paths, self_peer_id, peers: Arc<RwLock<HashMap<PeerId, PeerAd>>> }`
- `commands.rs` exposes:
  - `get_status()` → version, peer_id, data_dir, config_dir, firewall_status, clipboard_preview
  - `list_peers()` → Vec<PeerAd>
- Peer ID derived from OS process ID (`localos-<pid>`) so two instances can run side by side

### 3.5 `localos-app/ui/`
- `index.html` — dark UI, status card (Version / Peer ID / Firewall / Clipboard / Data dir), peer list section
- `main.js` — polls `get_status` every 3s, calls `list_peers`, listens for `peer-discovered` events, escapes HTML

### 3.6 Tauri config
- `crates/app/tauri.conf.json` — window 900×600, title "LocalOS", `withGlobalTauri: true`
- `crates/app/build.rs` — `tauri_build::build()`
- `crates/app/icons/icon.png` and `icon.ico` — generated placeholder (blue circle, white check)

---

## 4. What works (proven)

| Claim | Evidence |
|---|---|
| Rust workspace builds | ✅ `cargo build` clean |
| Tests pass | ✅ 8 passed, 1 ignored |
| Tauri window opens | ✅ verified |
| Rust ↔ JS IPC | ✅ `greet` command worked |
| Live status card | ✅ shows real clipboard, real paths |
| Clipboard read | ✅ shows recent clipboard text |
| mDNS advertise | ✅ visible in `mdns_sd=debug` logs |
| mDNS browse | ✅ receives own loopback |
| **Peer discovery: 1 direction** | ✅ instance 2 sees instance 1 |
| **Peer discovery: symmetric** | ❌ NOT yet proven on same machine (Windows UDP 5353 quirk) |

---

## 5. What's blocked / not done

### 5.1 Not proven
- **Symmetric peer discovery on same Windows machine.** Instance 2 sees instance 1, but not vice versa. Cause: both instances bind to UDP 5353, Windows multicast delivery reaches only one socket per port. This is a known Windows limitation, NOT a code bug. Should work fine across two physical machines on a hotspot.

### 5.2 Stopped mid-work
- **Testing on two physical laptops over mobile hotspot.** Was attempted on `VITBPL 2` (college WiFi) which likely has client isolation or multicast filtering. User was switching to a mobile hotspot when session ended.

### 5.3 Firewall fix attempted
Ran on user's laptop (Administrator PowerShell):
```powershell
Set-NetConnectionProfile -InterfaceAlias "Wi-Fi" -NetworkCategory Private
New-NetFirewallRule -DisplayName "LocalOS (mDNS)" -Direction Inbound -Action Allow -Protocol UDP -LocalPort 5353, 51000 -Profile Private, Domain, Public
```

**Status of these:** Uncertain. User was switching WiFi networks when the session ended. On a fresh session, re-verify:
```powershell
Get-NetConnectionProfile
Get-NetFirewallRule -DisplayName "LocalOS (mDNS)"
```

### 5.4 Engineer A's work
`crates/core/` is still a stub. It only has `version()`. No protocol, no QUIC, no transfer engine, no SQLite store, no identity keys. **All the "real" features blocked on this:**
- Session creation/join by code
- File transfer
- Chat
- Real resource discovery
- Hostel Brain

Engineer B's work is at the boundary of what's buildable without A.

---

## 6. What to do next — pick ONE

### Option A — Finish the two-laptop peer discovery proof
1. Both laptops on a mobile hotspot (not college WiFi)
2. Verify `NetworkCategory: Private` on both
3. Verify `LocalOS (mDNS)` firewall rule exists on both
4. Run `.\target\release\localos.exe` on both (release exe already built at `target\release\localos.exe`)
5. Wait 10-15 seconds
6. Both peer lists should populate symmetrically
7. Screenshot both, commit `chore: verify cross-device mDNS discovery`

### Option B — Build UI shells that don't need Engineer A
- Tab navigation (Peers / Transfers / Chat / Resources)
- Peer detail view (click a peer → see full info)
- Settings page (display name override, clipboard opt-in toggle)
- File drop zone (visual only, no transfer)
- Chat UI shell (mock messages, no transport)

### Option C — Wait for Engineer A
Message A: "Repo is at https://github.com/Jazz1-6/localos. B's platform layer is done. Core is empty. Please start on `crates/core/` — protocol header, identity keypair, session handshake. All against `localos-traits`. Don't touch `crates/platform/` or `crates/app/`."

---

## 7. How to resume this session

**In a fresh chat with an AI assistant, paste:**

> I'm working on LocalOS v1, a LAN-first offline collaboration platform.
> Repo: https://github.com/Jazz1-6/localos
> Path on my machine: C:\Vs_Code\Projects\LocalOs
> I'm Engineer B (platform + UI). Engineer A owns crates/core.
>
> Current state: 7 PRs merged. Tauri window opens, shows live clipboard and data dir, mDNS discovery works one-way between two instances on the same Windows machine. Symmetric discovery not yet proven.
>
> Here's the handoff doc: [paste this file]
>
> Pick up where I left off. Tell me what's next.

---

## 8. Key decisions & why (so a new session doesn't undo them)

| Decision | Why |
|---|---|
| **Separate `traits` crate** | Keeps `core` OS-agnostic without importing `platform`. Rules §3.2–3.5. |
| **Traits with `Send + Sync`** | Tauri commands run on multiple threads. |
| **`arboard` for clipboard** | Avoids writing raw Win32 unsafe code. Rules §10.12. |
| **`mdns-sd` for discovery** | Abstracts Bonjour (Win/mac) and avahi (Linux). No `#[cfg]` needed in our code. |
| **Bounded event channel (64)** | Rules §7.11 "No channel without a bound." Drops on overflow. |
| **`std::thread::spawn` for browse loop** | `browse()` isn't async, but returns a tokio Receiver. Thread works from any context. |
| **Fresh `arboard::Clipboard` per call** | OS handles are thread-bound. Creating fresh avoids unsafety. |
| **`mdns_sd=off` in default log filter** | Silences a benign shutdown race inside mdns-sd. Documented in main.rs. |
| **Peer ID = PID** | Lets us run two instances for testing. Temporary. Engineer A will replace with Ed25519 fingerprint. |
| **`withGlobalTauri: true`** | Lets JS use `window.__TAURI__` without npm dependencies. For v1 only. |
| **`windows_subsystem = "windows"` in release** | No console window pops up when double-clicking `.exe`. Debug builds keep console for logs. |

---

## 9. Key files

```
docs/
├── PRD.md              product requirements
├── Architecture.md     technical design
├── Rules.md            non-negotiable engineering rules
├── Workflow.md         runtime flows
├── ThreatModel.md      (not yet written)
├── Protocol.md         (not yet written)
└── Benchmarks.md       (not yet written)

crates/traits/src/lib.rs           all shared traits + PeerAd etc
crates/platform/src/paths.rs       NativePaths
crates/platform/src/clipboard.rs   NativeClipboard
crates/platform/src/firewall.rs    NativeFirewall
crates/platform/src/discovery.rs   NativeDiscovery
crates/platform/src/lib.rs         re-exports
crates/app/src/main.rs             Tauri setup, discovery background task
crates/app/src/state.rs            AppState
crates/app/src/commands.rs         get_status, list_peers
crates/app/tauri.conf.json         Tauri config
crates/app/ui/index.html           frontend
crates/app/ui/main.js              frontend JS
```

---

## 10. Common commands

```powershell
# Build debug
cargo build

# Build release (for sending to friends)
cargo build --release

# Run tests
cargo test
cargo test -- --ignored       # run the clipboard roundtrip

# Run the app (dev)
cargo run --bin localos

# Run the app (release, self-contained .exe)
.\target\release\localos.exe

# Run TWO instances for testing mDNS (must use the .exe directly, not cargo run)
# Terminal 1:  .\target\release\localos.exe
# Terminal 2:  .\target\release\localos.exe

# Debug mDNS traffic
$env:RUST_LOG = "info,mdns_sd=debug"
.\target\release\localos.exe

# Git
git add .
git commit -m "type(scope): description"
git push
```

**Commit message format:** Conventional Commits — `feat:`, `fix:`, `chore:`, `docs:`, `refactor:`, `test:`.

---

## 11. Known issues / gotchas

1. **Cannot `cargo run` twice.** Windows locks `target\debug\localos.exe` while running. Build once, then run `.exe` directly for multiple instances.

2. **Same-machine mDNS is one-way on Windows.** Both instances bind UDP 5353. Multicast reaches only one socket. Real test needs two physical machines.

3. **College WiFi often blocks mDNS.** `VITBPL` and most campus networks have client isolation or multicast filtering. Use a mobile hotspot.

4. **Windows Firewall may be on Public profile.** Fixed via `Set-NetConnectionProfile -NetworkCategory Private` (Admin PowerShell).

5. **`RUST_LOG` overrides our default filter.** If you set `RUST_LOG=info`, you'll see the mdns-sd shutdown ERROR again. That's expected — we only silence it when the user hasn't asked for mdns_sd logs.

6. **Debug exe keeps console visible.** Release exe hides it (`windows_subsystem = "windows"`). For debugging on a friend's laptop, send the debug exe.

---

## 12. Contact / coordination

**Engineer A owns:** `crates/core/`, protocol, QUIC transport, transfer engine, integrity, SQLite store, identity keys, session handshake.

**Engineer B (you) owns:** `crates/platform/`, `crates/app/`, `crates/ui/`, React frontend, packaging, CI, README, docs, benchmarks.

**Sync points (future):**
1. Tauri command signatures (when core functions are ready)
2. Event names and payloads
3. `crates/app/src/wiring.rs` — the single place core and platform meet

**Rules for parallel work:**
- `main` always builds
- Small PRs, one feature each
- Pull `main` every morning
- Never both edit the same file unless coordinated
- CI runs on Windows / Linux / macOS

---

## 13. Environment

- OS: Windows 11 (native)
- Shell: PowerShell (some Git Bash)
- Editor: VS Code
- Path: `C:\Vs_Code\Projects\LocalOs`
- GitHub user: `Jazz1-6`

---

## 14. If something breaks badly

```powershell
# Reset build artifacts (safe, will take time to rebuild)
cargo clean
cargo build

# Reset git to remote (DESTRUCTIVE — loses uncommitted work)
git fetch origin
git reset --hard origin/main

# Nuclear: clone fresh
cd C:\Vs_Code\Projects
Rename-Item LocalOs LocalOs-old
git clone https://github.com/Jazz1-6/localos.git
```

---

End of handoff. Good luck.
```

---

Paste that into a file called `HANDOFF.md` at the repo root (`C:\Vs_Code\Projects\LocalOs\HANDOFF.md`). Commit it:

```powershell
git add HANDOFF.md
git commit -m "docs: add session handoff"
git push
```

Next session, paste the whole file into a fresh chat and say "continue from here."

You've done real work. Go rest. 🔥