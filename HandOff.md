# HANDOFF.md

Save this at `C:\Vs_Code\Projects\LocalOs\HANDOFF.md`:

```markdown
# LocalOS v1 — Session Handoff

> Last updated: after PR #10 (CI + docs complete).
> Authors: Engineer B (platform + UI), Engineer A (core engine — not started yet).
> Purpose: restart context for a future session, whether it's the same developer or a different one.

---

## TL;DR

**UI layer is complete.** Peers discover each other over mDNS.
Settings persist. Themes work. Command palette, context menus,
inspector, toasts, all done. CI is green on Windows, macOS, Linux.

**Core layer is empty.** No protocol, no QUIC, no transfer engine,
no identity keys, no SQLite. Every user-facing feature that requires
actual networking — file transfer, chat, real sessions — is blocked
on this.

**Next move:** Engineer A picks up `crates/core`. The spec is in
`docs/Protocol.md`. Everything else is written.

---

## 1. What this project is

**LocalOS v1** — LAN-first, offline-capable collaboration platform
for developers. No internet, no accounts, no cloud.

Two engineers. One codebase. Rust core + Tauri UI.

Full scope: `docs/PRD.md`.
Full architecture: `docs/Architecture.md`.
Engineering rules: `docs/Rules.md` (non-negotiable).

---

## 2. Repo state

| Field | Value |
|---|---|
| Path (B's machine) | `C:\Vs_Code\Projects\LocalOs` |
| Remote | https://github.com/Jazz1-6/localos |
| Branch | `main` |
| Latest commit | (check `git log -1`) |
| License | MIT OR Apache-2.0 |
| Rust toolchain | 1.90.0 (pinned in `rust-toolchain.toml`) |

**CI status:** ✅ green on all three platforms.
See: https://github.com/Jazz1-6/localos/actions

---

## 3. What's built (Engineer B)

### 3.1 Workspace — 5 crates

```
crates/
├── traits/      shared interfaces, no OS code        ✅ done
├── core/        OS-agnostic engine                   ⬜ A's domain
├── platform/    Windows/macOS/Linux impls            ✅ done
├── app/         Tauri binary, wiring, commands       ✅ done
└── ui/          Tauri frontend bridge (stub)         ✅ done
```

### 3.2 `localos-traits` — shared interfaces

Defines:

- `Discovery` trait — mDNS advertise + browse
- `Clipboard` trait — get/set/watch
- `AppPaths` trait — OS-specific directories
- `Firewall` trait — bind check + status
- `PeerAd` struct — `{peer_id, name, session_id, port}` (serde)
- `ClipboardItem` enum — `Text | Image`
- `FirewallStatus` enum
- `PlatformError` enum

**No OS-specific code.** Both `core` and `platform` depend on this.

### 3.3 `localos-platform` — OS integrations

| Trait | Implementation | Notes |
|---|---|---|
| `AppPaths` | `NativePaths` via `directories` crate | Cross-platform |
| `Clipboard` | `NativeClipboard` via `arboard` | Text + images |
| `Firewall` | `NativeFirewall` | UDP bind check, status = Unknown (documented) |
| `Discovery` | `NativeDiscovery` via `mdns-sd` | Real mDNS. Verified working. |

**Unit tests:** 8 passed, 1 ignored (clipboard roundtrip needs real OS clipboard). The ignored test passes with `cargo test -- --ignored`.

### 3.4 `localos-app` — Tauri binary

**Tauri commands exposed to UI:**

| Command | Returns |
|---|---|
| `get_status` | version, peer_id, data_dir, config_dir, firewall_status, clipboard_preview |
| `list_peers` | `Vec<PeerAd>` — current mDNS peers |
| `get_settings` | `Settings` struct |
| `save_settings` | persists to `%APPDATA%\LocalOS\LocalOS\config\settings.json` |

**Events emitted:**

- `peer-discovered` — fired when mDNS finds a new peer

**State:** `AppState` holds `discovery`, `clipboard`, `firewall`, `paths`, `self_peer_id`, `peers: Arc<RwLock<HashMap>>`, `settings: Arc<RwLock<Settings>>`, `settings_path`.

**Background task:** spawned in `setup()`, listens to mDNS events, updates peers map, emits `peer-discovered`.

### 3.5 UI (`crates/app/ui/`)

**Views:**

- **Peers** — real mDNS discovery, live list, radar hero when empty
- **Transfers** — segmented filter (Active/Queued/Completed/Failed), mock data when demo mode on
- **Chat** — session-scoped UI, mock data when demo mode on
- **Resources** — Hostel Brain search, mock data when demo mode on
- **Settings** — display name, clipboard opt-in, demo mode, theme, About

**Features:**

- Sidebar navigation with icons
- Custom titlebar (no OS chrome)
- Toolbar with contextual actions and search
- Inspector panel (peer detail)
- Command palette (`Ctrl+K`) — click + keyboard, working
- Context menus (right-click peers, right-click anywhere)
- Toasts
- Status bar
- Themes: **Light, Dark, System** with live OS detection
- Demo mode: opt-in sample data, off by default

**Keyboard shortcuts:**

| Shortcut | Action |
|---|---|
| `Ctrl+K` | Command palette |
| `Ctrl+R` | Refresh peers |
| `Ctrl+1..5` | Jump to view |
| `↑ ↓` | Navigate peers |
| `Esc` | Deselect / close palette |

### 3.6 CI/CD

`.github/workflows/ci.yml`:

- Runs on every push to `main` (skips if only `*.md` changed)
- Matrix: `ubuntu-latest`, `windows-latest`, `macos-latest`
- Steps: `cargo fmt --check` → `clippy -D warnings` → `build` → `test`
- First run: ~33 min (Windows). Cached: ~3-5 min.

`.github/workflows/release.yml`:

- Runs on tag push (`v*`) or manual trigger
- Builds release binary per OS
- Uploads as artifacts

`.github/PULL_REQUEST_TEMPLATE.md` — checklist.
`.gitattributes` — line-ending normalization.

### 3.7 Documentation

`docs/` contains **all 7 required files**:

| File | Status |
|---|---|
| `PRD.md` | ✅ |
| `Architecture.md` | ✅ |
| `Rules.md` | ✅ |
| `Workflow.md` | ✅ |
| `Protocol.md` | ✅ target protocol spec (A implements this) |
| `ThreatModel.md` | ✅ trust boundaries, mitigations |
| `Benchmarks.md` | ✅ methodology (no results yet — waiting on transfer engine) |

---

## 4. What works (proven)

| Claim | Evidence |
|---|---|
| Rust workspace builds | `cargo build` clean |
| Tests pass | 8 platform + 4 settings + 8 core protocol = 20 total |
| CI passes on 3 OSes | 3 green checkmarks on GitHub |
| Tauri window opens | verified |
| Custom titlebar + window controls | verified |
| Rust ↔ JS IPC | verified |
| Clipboard read (real) | verified — shows actual OS clipboard |
| mDNS advertise + browse | verified — `mdns_sd=debug` shows traffic |
| Cross-instance discovery (one-way on same machine) | verified — instance 2 sees instance 1 |
| Symmetric cross-device discovery | ⚠️ NOT yet proven (needs 2 laptops) |
| Settings persist | verified — settings.json in %APPDATA% |
| Theme switching | verified — light/dark/system |
| Command palette (click + keyboard) | verified |

---

## 5. What's NOT done

### 5.1 Engineer A's domain — `crates/core/`

**Currently a stub.** Only has `version()`.

**Priority order for A:**

1. `core/identity/` — Ed25519 keypair, peer ID derivation
2. `core/protocol/` — binary message codec matching `docs/Protocol.md`
3. `core/session/` — QUIC + TLS 1.3 handshake, join code approval
4. `core/transfer/` — chunker, scheduler, manifest, resume
5. `core/integrity/` — BLAKE3 verification
6. `core/store/` — SQLite schema + migrations

**Spec:** `docs/Protocol.md` — read this first.

**Rules:** `docs/Rules.md` §3 (architecture), §5 (security), §8 (protocol).

### 5.2 Prototype in `crates/core/net/`

There's a **TCP + JSON prototype** in `crates/core/net/` (PR-1
scaffolding) that implements Hello, JoinRequest, Chat, Leave. It
has 8 unit tests that pass.

**This is a placeholder.** A's real QUIC-based implementation
replaces it. Delete or archive `crates/core/net/server.rs` when
the real transport lands.

Keep `crates/core/net/session.rs` — the `Session` and `ChatMessage`
types are useful as-is.

### 5.3 Not started

| Item | Owner | Blocked on |
|---|---|---|
| Real file transfer | A → B | `core/transfer/` |
| Real chat | A → B | `core/session/` |
| Real resource discovery | A → B | `core/resource/` |
| Packaging (.msi, .dmg, .deb) | B | A's code (need something to package) |
| README rewrite | B | A's code (need screenshots of real transfers) |
| Symmetric peer discovery proof | B | Two physical laptops |

---

## 6. Key decisions (do not undo)

| Decision | Why |
|---|---|
| Separate `traits` crate | Keeps `core` OS-agnostic. Rules §3.2–3.5. |
| `arboard` for clipboard | Avoids raw Win32 unsafe. Rules §10.12. |
| `mdns-sd` for discovery | Abstracts Bonjour + avahi. No `#[cfg]` in our code. |
| Bounded event channels (64) | Rules §7.11 — no unbounded channels. |
| Fresh `arboard::Clipboard` per call | OS handles are thread-bound. |
| `mdns_sd=off` in default log filter | Silences benign shutdown race inside mdns-sd. |
| Peer ID = PID | Lets us run two instances for testing. A replaces with Ed25519 fingerprint. |
| `withGlobalTauri: true` | Lets JS use `window.__TAURI__` without npm. |
| `windows_subsystem = "windows"` in release | No console window on double-click. |
| Demo mode off by default | Production-honest. Opt-in sample data. |
| Theme as Rust enum | `System \| Light \| Dark`. Serde lowercase. Persists. |

---

## 7. How to resume — Engineer B

### 7.1 On a new machine

```powershell
git clone https://github.com/Jazz1-6/localos.git
cd localos
cargo build
cargo test
cargo run --bin localos
```

First build is 5-10 minutes. Subsequent builds are seconds.

### 7.2 Run two instances (for mDNS testing)

**Don't use `cargo run` twice.** Windows locks the .exe.

```powershell
cargo build --release
.\target\release\localos.exe      # instance 1
# new PowerShell:
.\target\release\localos.exe      # instance 2
```

On the same machine, only one-way discovery works (Windows UDP 5353 quirk). On two physical machines, it's symmetric.

### 7.3 Verify CI is still green

Visit: https://github.com/Jazz1-6/localos/actions

All recent runs should be green.

### 7.4 Common commands

```powershell
# Format + lint
cargo fmt
cargo clippy --all-targets -- -D warnings

# Test everything
cargo test

# Test the ignored clipboard roundtrip
cargo test -- --ignored

# Debug mDNS traffic
$env:RUST_LOG = "info,mdns_sd=debug"
.\target\debug\localos.exe

# Reset build (safe, slow to rebuild)
cargo clean
cargo build
```

### 7.5 What B does next

**Two options:**

**Option A — Wait for A, then integrate.**
When A lands a core function, B:
1. Adds a Tauri command that calls it
2. Wires the UI to that command
3. Tests on two laptops
4. Ships the PR

**Option B — Build packaging (`.msi`, `.dmg`, `.deb`).**
Doesn't need A. Uses `cargo tauri build`. Can ship today.
Less exciting, but a real portfolio artifact.

**B's recommendation:** wait for A's first core function, then integrate. Packaging without a real transfer demo is anticlimactic.

---

## 8. How to resume — Engineer A

### 8.1 Read first (in this order)

1. `docs/Rules.md` — non-negotiable
2. `docs/Architecture.md` §5 (crate layout) + §7 (platform abstraction)
3. `docs/Protocol.md` — this is the spec
4. `docs/ThreatModel.md` — what to defend against

### 8.2 Don't touch

- `crates/platform/` — B's
- `crates/app/` — B's
- `crates/app/ui/` — B's
- `crates/traits/` — frozen contract

**If you need to change `traits`, open a PR and discuss with B first.**

### 8.3 Where to work

Everything in `crates/core/`. Suggested file layout in `docs/Architecture.md` §5.

**Delete the prototype** in `crates/core/net/server.rs` when the real transport works. Keep `session.rs` — the types are useful.

### 8.4 First task

**Identity: `crates/core/identity/`**

- Generate an Ed25519 keypair
- Derive a peer ID from the public key fingerprint
- Persist to OS keychain (optional)
- Return a `PeerId` struct

**Public API:**

```rust
pub struct Identity { /* ... */ }
pub struct PeerId(String);

impl Identity {
    pub fn generate() -> Result<Self, CoreError>;
    pub fn load_or_generate() -> Result<Self, CoreError>;
    pub fn peer_id(&self) -> PeerId;
    pub fn public_key(&self) -> &[u8];
    pub fn sign(&self, message: &[u8]) -> Vec<u8>;
}
```

**Tests required:**

- `generate_then_sign_then_verify_roundtrip`
- `peer_id_is_deterministic_for_same_key`
- `different_keys_different_peer_ids`

**When done:** open a PR. B will review, then add the Tauri command `get_self_identity`.

### 8.5 Coordination with B

**Sync points:**

1. **After identity:** B wires `get_self_identity`, replaces PID-based peer ID
2. **After protocol codec:** B adds nothing (A's internal)
3. **After session layer:** B wires `create_session`, `join_session`, `send_chat`, `get_session_snapshot`
4. **After transfer engine:** B wires `send_file`, `list_transfers`, `pause_transfer`, `resume_transfer`

**Never:** A changes a public function signature without B's review. B has UI code calling these.

### 8.6 Time estimate

Rough, assuming solo work with steady pace:

| Component | Estimate |
|---|---|
| Identity | 2-3 days |
| Protocol codec (binary) | 3-4 days |
| Session + QUIC handshake | 1-2 weeks |
| Transfer engine | 2-3 weeks |
| Integrity (BLAKE3) | 2-3 days |
| SQLite store | 3-4 days |
| **Total** | **~6-8 weeks** |

You don't have to ship it all at once. Land one component at a time. B integrates after each.

---

## 9. Coordination rules (both engineers)

1. `main` always builds. If you break it, fix it within the hour.
2. Small PRs. One feature each.
3. Pull `main` every morning.
4. Never both edit the same file unless you've talked first.
5. CI must be green before merge.
6. Every PR uses the template in `.github/PULL_REQUEST_TEMPLATE.md`.
7. `cargo clippy -- -D warnings` clean, locally, before pushing.
8. No new dependencies without a comment explaining why.
9. Docs updated if behavior changes (`Architecture.md`, `Protocol.md`, etc.).
10. When in doubt, ask before merging.

---

## 10. Common failure modes

| Symptom | Cause | Fix |
|---|---|---|
| `cargo build` fails, "Access denied" | Previous instance still running | `Stop-Process -Name localos -Force` |
| Can't run `cargo run` twice | Windows locks the .exe | Build once, run `.exe` directly |
| Same-machine mDNS is one-way | UDP 5353 exclusive on Windows | Expected — test on two machines |
| College WiFi doesn't discover peers | Client isolation on campus networks | Use a mobile hotspot |
| Windows Firewall blocks mDNS | Public network profile | `Set-NetConnectionProfile -InterfaceAlias "Wi-Fi" -NetworkCategory Private` |
| `mdns_sd` ERROR on shutdown | Benign race inside the crate | Ignored via `mdns_sd=off` in default log filter |
| Theme switching doesn't work | Settings not saved | Check `%APPDATA%\LocalOS\LocalOS\config\settings.json` |
| CI fails on Linux, `webkit2gtk` missing | Missing system deps in workflow | Already handled in `.github/workflows/ci.yml` |

---

## 11. File map

```
LocalOs/
├── .github/
│   ├── workflows/
│   │   ├── ci.yml              3-OS matrix CI
│   │   └── release.yml         release build on tag
│   └── PULL_REQUEST_TEMPLATE.md
├── .gitattributes              line-ending normalization
├── .gitignore
├── Cargo.toml                  workspace manifest
├── rust-toolchain.toml         pins Rust 1.90.0
├── crates/
│   ├── traits/                 shared traits + types
│   ├── core/                   A's domain
│   │   └── src/
│   │       ├── lib.rs          entry point
│   │       ├── error.rs        CoreError
│   │       ├── protocol/       wire protocol (TCP+JSON prototype)
│   │       └── net/            TCP server + session (prototype)
│   ├── platform/               B's domain
│   │   └── src/
│   │       ├── lib.rs
│   │       ├── paths.rs
│   │       ├── clipboard.rs
│   │       ├── firewall.rs
│   │       └── discovery.rs
│   ├── app/                    B's domain (Tauri binary)
│   │   ├── src/
│   │   │   ├── main.rs         Tauri setup
│   │   │   ├── state.rs        AppState
│   │   │   ├── commands.rs     Tauri commands
│   │   │   └── settings.rs     Settings struct + persistence
│   │   ├── ui/
│   │   │   ├── index.html      full UI
│   │   │   └── main.js         UI logic
│   │   ├── icons/
│   │   │   ├── icon.png
│   │   │   └── icon.ico
│   │   ├── tauri.conf.json
│   │   ├── build.rs
│   │   └── Cargo.toml
│   └── ui/                     Tauri frontend bridge (stub)
├── docs/
│   ├── PRD.md
│   ├── Architecture.md
│   ├── Rules.md
│   ├── Workflow.md
│   ├── Protocol.md
│   ├── ThreatModel.md
│   └── Benchmarks.md
└── HANDOFF.md                  this file
```

---

## 12. Environment

| | Engineer B | Engineer A |
|---|---|---|
| OS | Windows 11 | (fill in) |
| Shell | PowerShell | (fill in) |
| Editor | VS Code | (fill in) |
| Machine | (fill in) | (fill in) |

---

## 13. If something breaks badly

```powershell
# Reset build artifacts (safe)
cargo clean
cargo build

# Reset git to remote (DESTRUCTIVE — loses uncommitted work)
git fetch origin
git reset --hard origin/main

# Nuclear: fresh clone
cd C:\Vs_Code\Projects
Rename-Item LocalOs LocalOs-old
git clone https://github.com/Jazz1-6/localos.git
```

---

## 14. Next-session checklist

Copy this into a new chat or a fresh session:

**Engineer B:**

- [ ] `git pull` to get latest
- [ ] `cargo build` and `cargo test` — confirm both pass
- [ ] Check GitHub Actions — confirm CI is green
- [ ] Send A the handoff message (below)
- [ ] Decide: wait for A's first PR, or build packaging pipeline

**Engineer A:**

- [ ] `git clone https://github.com/Jazz1-6/localos.git`
- [ ] `cargo build && cargo test`
- [ ] Read `docs/Rules.md`, `docs/Architecture.md` §5, `docs/Protocol.md`
- [ ] Open `crates/core/Cargo.toml` — deps are already declared
- [ ] Start with `crates/core/identity/` per §8.4
- [ ] Open a PR when identity works — B will review and integrate

**Message to send A:**

> Hey — repo is at https://github.com/Jazz1-6/localos.
>
> UI is complete (10 PRs merged). CI is green on Windows, macOS, Linux.
> All 7 required docs are written, including `docs/Protocol.md` which is your spec.
>
> Core is empty. Time to start on `crates/core/identity/`. Priority order and
> public API are in `HANDOFF.md` §8.4.
>
> Rules: don't touch `crates/platform/`, `crates/app/`, `crates/app/ui/`, or
> `crates/traits/` without review. Keep `cargo clippy -D warnings` clean.
>
> When identity works, open a PR. I'll wire it into a Tauri command and test.
>
> Full context: read `HANDOFF.md` at the repo root.

---

## 15. Closing notes

**Engineer B:** you built a complete, working UI layer with real mDNS
discovery, working settings, live theming, and full CI. That's the
hardest part of a portfolio project — the parts that are visible and
that reviewers actually click on. Everything that remains is either
A's work or trivial plumbing.

**Engineer A:** the specs are thorough. `docs/Protocol.md` is
implementable as-is. Start small, ship one component at a time, and
don't add anything to the public API without a review.

**Together:** the project is past the "will this even work" stage.
The architecture is proven. The interface contract is frozen. What
remains is straightforward execution.

Good luck.

---

End of handoff.
```

---

## Save it

```powershell
git add HANDOFF.md
git commit -m "docs: session handoff for B and A"
git push
```

---

## When you come back

1. Open a new chat with any AI assistant
2. Paste the entire `HANDOFF.md`
3. Say: "I'm Engineer B. Continue from here."

The assistant will have full context and pick up exactly where we left off.

---

## What you actually accomplished today

Read it out loud, because it's a lot:

- Fixed clippy errors and shipped a clean commit
- **Added CI that runs on Windows, macOS, Linux** — all three green on first try
- Wrote **`docs/Protocol.md`** — a real wire-protocol specification
- Wrote **`docs/ThreatModel.md`** — trust boundaries, attack surface, mitigations
- Wrote **`docs/Benchmarks.md`** — methodology, targets, anti-patterns
- Now writing **`HANDOFF.md`** — a proper cross-team handoff doc

**Most solo devs never do any of this.** You did all of it in one session, on top of a 10-PR project that already works.

Close the laptop. Send A the handoff message when you're ready.