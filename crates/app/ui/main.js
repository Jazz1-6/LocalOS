const { invoke } = window.__TAURI__.core;
const { listen } = window.__TAURI__.event;

// ─── State ──────────────────────────────────────────────────────
let peers = [];
let selectedPeerId = null;
let currentView = "peers";
let peerFilter = "";
let lastScan = Date.now();
let loadedSettings = null;

// ─── Window controls ────────────────────────────────────────────
function initWindow() {
    const w = window.__TAURI__.window.getCurrentWindow();
    document.getElementById("win-min").addEventListener("click", () => w.minimize());
    document.getElementById("win-max").addEventListener("click", () => w.toggleMaximize());
    document.getElementById("win-close").addEventListener("click", () => w.close());
}

// ─── Navigation ─────────────────────────────────────────────────
function initNav() {
    document.querySelectorAll(".nav-btn").forEach((btn) => {
        btn.addEventListener("click", () => switchView(btn.dataset.view));
    });
}

function switchView(view) {
    currentView = view;
    document.querySelectorAll(".nav-btn").forEach((b) =>
        b.toggleAttribute("aria-current", b.dataset.view === view)
    );
    document.querySelectorAll(".view").forEach((v) =>
        v.classList.toggle("active", v.id === `view-${view}`)
    );
    document.getElementById("title-context").textContent =
        document.querySelector(`.nav-btn[data-view="${view}"] span:not(.nav-pill)`).textContent;

    document.getElementById("toolbar").dataset.view = view;
    updateToolbar();

    if (view === "transfers") renderTransfers();
    if (view === "chat") renderChat();
    if (view === "resources") renderResources();
}

// ─── Toolbar ────────────────────────────────────────────────────
function updateToolbar() {
    const titleEl = document.getElementById("tb-title");
    const countEl = document.getElementById("tb-count");
    const primary = document.getElementById("tb-primary");
    const primaryLabel = primary.querySelector("span");

    const peersCount = peers.length;

    switch (currentView) {
        case "peers":
            titleEl.textContent = "Peers";
            countEl.textContent = peersCount === 0 ? "Listening…" : `${peersCount} on this LAN`;
            primaryLabel.textContent = "Start session";
            primary.disabled = true;
            primary.dataset.tip = "Requires session layer — Engineer A";
            break;
        case "transfers":
            titleEl.textContent = "Transfers";
            countEl.textContent = "0 active";
            primaryLabel.textContent = "Send files";
            primary.disabled = true;
            primary.dataset.tip = "Requires transfer engine — Engineer A";
            break;
        case "chat":
            titleEl.textContent = "Chat";
            countEl.textContent = "No session";
            primaryLabel.textContent = "Create room";
            primary.disabled = true;
            primary.dataset.tip = "Requires session layer — Engineer A";
            break;
        case "resources":
            titleEl.textContent = "Resources";
            countEl.textContent = "0 advertised";
            primaryLabel.textContent = "Advertise";
            primary.disabled = true;
            primary.dataset.tip = "Requires resource layer — Engineer A";
            break;
        case "settings":
            titleEl.textContent = "Settings";
            countEl.textContent = "";
            primaryLabel.textContent = "Save";
            primary.disabled = true;
            primary.dataset.tip = "No editable fields yet";
            break;
    }
}

// ─── Status polling ─────────────────────────────────────────────
async function refreshStatus() {
    try {
        const s = await invoke("get_status");
        setText("version", s.version);
        setText("data-dir", s.data_dir);
        setText("config-dir", s.config_dir);
        setText("sb-self", s.peer_id);
        setText("sb-fw-text", `Firewall: ${s.firewall_status}`);
        setText("settings-version", s.version);
        setText("settings-data-dir", s.data_dir);
        setText("settings-peer-id", s.peer_id);

        const fwDot = document.getElementById("sb-fw-dot");
        fwDot.classList.remove("live");
        const fw = String(s.firewall_status).toLowerCase();
        if (fw.includes("allowed")) fwDot.classList.add("live");
    } catch (e) {
        console.error("get_status failed", e);
    }
}

// ─── Settings ───────────────────────────────────────────────────
async function refreshSettings() {
    try {
        const s = await invoke("get_settings");
        loadedSettings = s;

        const nameInput = document.getElementById("settings-display-name");
        if (nameInput && document.activeElement !== nameInput) {
            nameInput.value = s.display_name;
        }
        updateSaveButton();

        const syncToggle = document.getElementById("settings-clipboard-sync");
        if (syncToggle) syncToggle.checked = !!s.clipboard_sync_enabled;

        const demoToggle = document.getElementById("settings-demo-mode");
        if (demoToggle) demoToggle.checked = !!s.demo_mode;

        applyDemoState();
        applyTheme();
    } catch (e) {
        console.error("get_settings failed", e);
    }
}

function applyDemoState() {
    const on = isDemo();
    document.body.classList.toggle("demo-on", on);
    const banner = document.getElementById("demo-banner");
    if (banner) banner.style.display = on ? "flex" : "none";

    if (currentView === "transfers") renderTransfers();
    if (currentView === "chat") renderChat();
    if (currentView === "resources") renderResources();
}

function updateSaveButton() {
    const input = document.getElementById("settings-display-name");
    const btn = document.getElementById("settings-save-name");
    if (!input || !btn || !loadedSettings) return;
    const current = input.value.trim();
    const original = (loadedSettings.display_name || "").trim();
    btn.disabled = current === original || current.length === 0;
}

async function saveDisplayName() {
    const input = document.getElementById("settings-display-name");
    if (!input || !loadedSettings) return;
    const name = input.value.trim();
    if (!name) return;

    try {
        await invoke("save_settings", {
            settings: {
                display_name: name,
                clipboard_sync_enabled: !!loadedSettings.clipboard_sync_enabled,
                demo_mode: !!loadedSettings.demo_mode,
                theme: loadedSettings.theme ?? "system",
            },
        });
        loadedSettings = { ...loadedSettings, display_name: name };
        updateSaveButton();
        toast("Display name saved");
        refreshStatus();
    } catch (e) {
        console.error("save_settings failed", e);
        toast(`Save failed: ${e}`);
    }
}

async function toggleClipboardSync(enabled) {
    if (!loadedSettings) return;
    try {
        await invoke("save_settings", {
            settings: {
                display_name: loadedSettings.display_name,
                clipboard_sync_enabled: enabled,
                demo_mode: !!loadedSettings.demo_mode,
                theme: loadedSettings.theme ?? "system",
            },
        });
        loadedSettings = { ...loadedSettings, clipboard_sync_enabled: enabled };
        toast(enabled ? "Clipboard sync enabled" : "Clipboard sync disabled");
    } catch (e) {
        console.error("save_settings failed", e);
        toast(`Save failed: ${e}`);
        document.getElementById("settings-clipboard-sync").checked =
            !!loadedSettings.clipboard_sync_enabled;
    }
}

function initSettings() {
    const input = document.getElementById("settings-display-name");
    const saveBtn = document.getElementById("settings-save-name");
    const toggle = document.getElementById("settings-clipboard-sync");
    const copyPeerId = document.getElementById("settings-copy-peer-id");
    const copyRepo = document.getElementById("settings-copy-repo");
    const copyDataDir = document.getElementById("settings-copy-data-dir");

    if (input) {
        input.addEventListener("input", updateSaveButton);
        input.addEventListener("keydown", (e) => {
            if (e.key === "Enter") {
                e.preventDefault();
                if (!saveBtn.disabled) saveDisplayName();
            }
        });
    }
    if (saveBtn) saveBtn.addEventListener("click", saveDisplayName);
    if (toggle) toggle.addEventListener("change", (e) => toggleClipboardSync(e.target.checked));

    const demoToggle = document.getElementById("settings-demo-mode");
    if (demoToggle) {
        demoToggle.addEventListener("change", async (e) => {
            const enabled = e.target.checked;
            try {
                await invoke("save_settings", {
                    settings: {
                        display_name: loadedSettings.display_name,
                        clipboard_sync_enabled: !!loadedSettings.clipboard_sync_enabled,
                        demo_mode: enabled,
                        theme: loadedSettings.theme ?? "system",
                    },
                });
                loadedSettings = { ...loadedSettings, demo_mode: enabled };
                applyDemoState();
                toast(enabled ? "Demo mode on" : "Demo mode off");
            } catch (err) {
                console.error("save_settings failed", err);
                toast(`Save failed: ${err}`);
                e.target.checked = !!loadedSettings.demo_mode;
            }
        });
    }

    if (copyPeerId) {
        copyPeerId.addEventListener("click", async () => {
            const s = await invoke("get_status");
            copyText(s.peer_id, "Peer ID copied");
        });
    }
    if (copyRepo) {
        copyRepo.addEventListener("click", () => {
            copyText("https://github.com/Jazz1-6/localos", "Repository URL copied");
        });
    }
    if (copyDataDir) {
        copyDataDir.addEventListener("click", async () => {
            const s = await invoke("get_status");
            copyText(s.data_dir, "Data directory copied");
        });
    }
}

// ─── Theme ──────────────────────────────────────────────────────
const systemDark = window.matchMedia("(prefers-color-scheme: dark)");

function resolveTheme(choice) {
    if (choice === "light") return "light";
    if (choice === "dark") return "dark";
    return systemDark.matches ? "dark" : "light";
}

function applyTheme() {
    const choice = loadedSettings?.theme ?? "system";
    const resolved = resolveTheme(choice);
    document.documentElement.dataset.theme = resolved;

    document.querySelectorAll("[data-theme-choice]").forEach((btn) => {
        btn.setAttribute("aria-selected", btn.dataset.themeChoice === choice ? "true" : "false");
    });
}

systemDark.addEventListener("change", () => {
    if ((loadedSettings?.theme ?? "system") === "system") applyTheme();
});

async function setThemeChoice(choice) {
    if (!loadedSettings) return;
    try {
        await invoke("save_settings", {
            settings: {
                display_name: loadedSettings.display_name,
                clipboard_sync_enabled: !!loadedSettings.clipboard_sync_enabled,
                demo_mode: !!loadedSettings.demo_mode,
                theme: choice,
            },
        });
        loadedSettings = { ...loadedSettings, theme: choice };
        applyTheme();
        toast(choice === "system" ? "Following system theme" : `Theme: ${choice}`);
    } catch (e) {
        console.error("save_settings failed", e);
        toast(`Save failed: ${e}`);
    }
}

function initTheme() {
    document.querySelectorAll("[data-theme-choice]").forEach((btn) => {
        btn.addEventListener("click", () => setThemeChoice(btn.dataset.themeChoice));
    });
}

// ─── Peers ──────────────────────────────────────────────────────
async function refreshPeers() {
    try {
        peers = await invoke("list_peers");
        lastScan = Date.now();

        document.getElementById("peer-count").textContent = peers.length;
        document.getElementById("peer-count").classList.toggle("has-peers", peers.length > 0);

        const sbDot = document.getElementById("sb-peer-dot");
        const sbText = document.getElementById("sb-peer-text");
        if (peers.length === 0) {
            sbDot.className = "sb-dot idle";
            sbText.textContent = "No peers";
        } else {
            sbDot.className = "sb-dot live";
            sbText.textContent = `${peers.length} peer${peers.length === 1 ? "" : "s"} on LAN`;
        }

        renderPeers();
        updateToolbar();
    } catch (e) {
        console.error("list_peers failed", e);
    }
}

function renderPeers() {
    const ul = document.getElementById("peers");
    if (peers.length === 0) { ul.innerHTML = radarEmpty(); return; }

    const filtered = peers.filter((p) => {
        if (!peerFilter) return true;
        const q = peerFilter.toLowerCase();
        return p.name.toLowerCase().includes(q) || p.peer_id.toLowerCase().includes(q);
    });

    if (filtered.length === 0) {
        ul.innerHTML = `
            <li class="empty-state">
                <h3>No matches</h3>
                <p>No peer matches "${esc(peerFilter)}".</p>
            </li>`;
        return;
    }

    ul.innerHTML = filtered.map(peerCard).join("");

    ul.querySelectorAll(".peer-item").forEach((el) => {
        const id = el.dataset.peerId;
        el.addEventListener("click", () => selectPeer(id));
        el.addEventListener("contextmenu", (e) => {
            e.preventDefault();
            selectPeer(id);
            openCtxPeer(e.clientX, e.clientY, id);
        });
    });
}

function peerCard(p) {
    const initials = (p.name || "??").replace(/[^a-zA-Z0-9]/g, "").slice(0, 2) || "??";
    const selected = p.peer_id === selectedPeerId ? " selected" : "";
    return `
        <li class="peer-item${selected}" data-peer-id="${esc(p.peer_id)}">
            <div class="avatar">${esc(initials)}</div>
            <div class="peer-info">
                <span class="peer-name">${esc(p.name)}</span>
                <span class="peer-id">${esc(p.peer_id)}:${p.port}</span>
            </div>
            <div class="peer-actions">
                <button class="peer-action" data-tip="Send file — needs core" disabled>
                    <svg viewBox="0 0 24 24"><path d="M7 4v14"/><path d="M3.5 7.5 7 4l3.5 3.5"/><path d="M17 20V6"/><path d="M13.5 16.5 17 20l3.5-3.5"/></svg>
                </button>
                <button class="peer-action" data-tip="Message — needs core" disabled>
                    <svg viewBox="0 0 24 24"><path d="M21 12a8.5 8.5 0 0 1-12.3 7.6L3.5 21l1.4-5.1A8.5 8.5 0 1 1 21 12z"/></svg>
                </button>
            </div>
        </li>`;
}

function radarEmpty() {
    return `
        <li class="radar-wrap">
            <div class="radar">
                <svg viewBox="0 0 260 260">
                    <defs>
                        <clipPath id="radarClip"><circle cx="130" cy="130" r="118"/></clipPath>
                    </defs>
                    <circle cx="130" cy="130" r="118" class="ring"/>
                    <circle cx="130" cy="130" r="88"  class="ring ring-inner"/>
                    <circle cx="130" cy="130" r="58"  class="ring ring-inner"/>
                    <circle cx="130" cy="130" r="28"  class="ring ring-inner"/>
                    <line x1="12"  y1="130" x2="248" y2="130" class="crosshair"/>
                    <line x1="130" y1="12"  x2="130" y2="248" class="crosshair"/>
                    <line x1="48"  y1="48"  x2="212" y2="212" class="crosshair" opacity="0.5"/>
                    <line x1="212" y1="48"  x2="48"  y2="212" class="crosshair" opacity="0.5"/>
                    <g clip-path="url(#radarClip)">
                        <g>
                            <animateTransform
                                attributeName="transform"
                                type="rotate"
                                from="0 130 130"
                                to="360 130 130"
                                dur="3.6s"
                                repeatCount="indefinite"/>
                            <path d="M130 130 L130 12 A118 118 0 0 1 235 92 Z" fill="var(--accent)" opacity="0.14"/>
                            <line x1="130" y1="130" x2="235" y2="92" stroke="var(--accent)" stroke-width="4" stroke-linecap="round" opacity="0.35"/>
                            <line x1="130" y1="130" x2="235" y2="92" stroke="var(--accent-bright)" stroke-width="1.6" stroke-linecap="round" opacity="0.95"/>
                        </g>
                    </g>
                    <circle cx="130" cy="130" r="3" class="center"/>
                    <circle cx="130" cy="130" r="3" class="center-pulse">
                        <animate attributeName="r" values="3;14" dur="2.4s" repeatCount="indefinite"/>
                        <animate attributeName="opacity" values="0.4;0" dur="2.4s" repeatCount="indefinite"/>
                    </circle>
                </svg>
            </div>
            <div class="radar-caption">
                <h3>Listening for peers</h3>
                <p>Scanning <code>_localos._udp.local</code> for LocalOS instances on this LAN. Nothing has responded yet.</p>
                <div class="radar-meta" id="radar-meta">Last scan: just now</div>
            </div>
        </li>`;
}

setInterval(() => {
    const el = document.getElementById("radar-meta");
    if (!el) return;
    const s = Math.round((Date.now() - lastScan) / 1000);
    el.textContent = s < 2 ? "Last scan: just now" : `Last scan: ${s}s ago`;
}, 1000);

// ─── Peer selection & inspector ─────────────────────────────────
function selectPeer(id) {
    selectedPeerId = id;
    document.querySelectorAll(".peer-item").forEach((el) => {
        el.classList.toggle("selected", el.dataset.peerId === id);
    });
    renderInspector();
}

function clearSelection() {
    selectedPeerId = null;
    document.querySelectorAll(".peer-item").forEach((el) => el.classList.remove("selected"));
    renderInspector();
}

function renderInspector() {
    const app = document.getElementById("app");
    const placeholder = document.getElementById("inspector-placeholder");
    const body = document.getElementById("inspector-body");

    const p = peers.find((x) => x.peer_id === selectedPeerId);
    if (!p) {
        app.classList.add("inspector-closed");
        placeholder.style.display = "flex";
        body.style.display = "none";
        return;
    }

    const initials = (p.name || "??").replace(/[^a-zA-Z0-9]/g, "").slice(0, 2) || "??";
    app.classList.remove("inspector-closed");
    placeholder.style.display = "none";
    body.style.display = "block";

    body.innerHTML = `
        <div class="inspector-head">
            <div class="inspector-avatar">${esc(initials)}</div>
            <div class="inspector-name">${esc(p.name)}</div>
            <div class="inspector-sub">${esc(p.peer_id)}</div>
            <span class="inspector-status"><span class="dot"></span>Online · mDNS</span>
        </div>
        <div>
            <div class="inspector-section-title">Details</div>
            <div class="inspector-field">
                <div><span class="k">Peer ID</span><span class="v">${esc(p.peer_id)}</span></div>
                <button class="inspector-copy" data-copy="${esc(p.peer_id)}" data-tip="Copy peer ID">
                    <svg viewBox="0 0 24 24"><rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15V5a2 2 0 0 1 2-2h10"/></svg>
                </button>
            </div>
            <div class="inspector-field">
                <div><span class="k">Port</span><span class="v">${p.port}</span></div>
                <button class="inspector-copy" data-copy="${p.port}" data-tip="Copy port">
                    <svg viewBox="0 0 24 24"><rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15V5a2 2 0 0 1 2-2h10"/></svg>
                </button>
            </div>
            <div class="inspector-field">
                <div><span class="k">Session</span><span class="v">${p.session_id ? esc(p.session_id) : "—"}</span></div>
            </div>
        </div>
        <div>
            <div class="inspector-section-title">Actions</div>
            <div class="inspector-actions">
                <button class="inspector-action" disabled data-tip="Requires transfer engine">
                    <svg viewBox="0 0 24 24"><path d="M7 4v14"/><path d="M3.5 7.5 7 4l3.5 3.5"/><path d="M17 20V6"/><path d="M13.5 16.5 17 20l3.5-3.5"/></svg>
                    Send file
                </button>
                <button class="inspector-action" disabled data-tip="Requires session layer">
                    <svg viewBox="0 0 24 24"><path d="M21 12a8.5 8.5 0 0 1-12.3 7.6L3.5 21l1.4-5.1A8.5 8.5 0 1 1 21 12z"/></svg>
                    Message
                </button>
            </div>
        </div>
        <button class="inspector-action" disabled data-tip="Not implemented yet" style="grid-column:1/-1">
            Hide from list
        </button>
    `;

    body.querySelectorAll("[data-copy]").forEach((btn) => {
        btn.addEventListener("click", () => {
            copyText(btn.dataset.copy, "Copied to clipboard");
        });
    });
}

// ═══════════════════════════════════════════════════════════════════
// MOCK DATA LAYER
// ═══════════════════════════════════════════════════════════════════
// Mock data renders ONLY when the user has enabled "Demo mode" in
// Settings. Default is off, so a production build never shows fake
// data.

function isDemo() {
    return loadedSettings?.demo_mode === true;
}

const MOCK_TRANSFERS = [
    { id: "t1", name: "dataset-2024.tar.zst", peer: "LocalOS-7788", sizeBytes: 4_500_000_000, progress: 59, speedBps: 127_000_000, etaSeconds: 24, status: "active" },
    { id: "t2", name: "Photos 2024/", peer: "LocalOS-3344", sizeBytes: 890_000_000, progress: 32, speedBps: 0, etaSeconds: null, status: "paused" },
    { id: "t3", name: "presentation.pdf", peer: "LocalOS-7788", sizeBytes: 2_400_000, progress: 0, speedBps: 0, etaSeconds: null, status: "queued" },
    { id: "t4", name: "invoice-Q4.pdf", peer: "LocalOS-3344", sizeBytes: 180_000, progress: 100, speedBps: 0, etaSeconds: 0, status: "completed" },
    { id: "t5", name: "backup.sql", peer: "LocalOS-7788", sizeBytes: 12_000_000_000, progress: 78, speedBps: 0, etaSeconds: null, status: "failed", error: "Disk full on receiver" },
];

const MOCK_CHAT = {
    sessionId: "sess-a1b2c3",
    participants: [
        { id: "localos-self", name: "You", isSelf: true },
        { id: "localos-7788", name: "Arjun's Laptop", isSelf: false },
        { id: "localos-3344", name: "Priya-MBP", isSelf: false },
    ],
    messages: [
        { id: "m1", from: "localos-3344", text: "Session is up. Everyone seeing each other?", ts: Date.now() - 1000 * 60 * 12 },
        { id: "m2", from: "localos-7788", text: "Yep. Two peers on my side.", ts: Date.now() - 1000 * 60 * 11 },
        { id: "m3", from: "localos-self", text: "Same here. Sending the dataset in a sec.", ts: Date.now() - 1000 * 60 * 10, own: true },
        { id: "m4", from: "localos-3344", text: "Nice. Can you share the manifest hash once it starts?", ts: Date.now() - 1000 * 60 * 9 },
        { id: "m5", from: "localos-7788", text: "Also — anyone has DBMS notes for units 3-4?", ts: Date.now() - 1000 * 60 * 5 },
    ],
};

const MOCK_RESOURCES = [
    { id: "r1", kind: "note", label: "DBMS Notes — Units 3 & 4", owner: "Arjun's Laptop", ownerId: "localos-7788" },
    { id: "r2", kind: "hardware", label: "RTX 4090 — rendering jobs", owner: "Priya-MBP", ownerId: "localos-3344" },
    { id: "r3", kind: "file", label: "dataset-2024.tar.zst (4.5 GB)", owner: "Arjun's Laptop", ownerId: "localos-7788" },
    { id: "r4", kind: "skill", label: "Python / pandas tutoring", owner: "Karthik", ownerId: "localos-9911" },
    { id: "r5", kind: "hardware", label: "HP LaserJet — Room 204", owner: "Room 204", ownerId: "localos-5511" },
];

// ─── Formatters ─────────────────────────────────────────────────
function fmtBytes(bytes) {
    if (bytes < 1024) return `${bytes} B`;
    const units = ["KB", "MB", "GB", "TB"];
    let v = bytes / 1024;
    let i = 0;
    while (v >= 1024 && i < units.length - 1) { v /= 1024; i++; }
    return `${v.toFixed(v >= 100 ? 0 : 1)} ${units[i]}`;
}
function fmtSpeed(bps) { return bps === 0 ? "—" : `${fmtBytes(bps)}/s`; }
function fmtEta(seconds) {
    if (seconds === null || seconds === undefined) return "—";
    if (seconds < 60) return `${seconds}s`;
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return s > 0 ? `${m}m ${s}s` : `${m}m`;
}
function fmtTime(epochMs) {
    const d = new Date(epochMs);
    return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

// ─── Transfers ──────────────────────────────────────────────────
let transferFilter = "active";

function renderTransfers() {
    const root = document.getElementById("view-transfers");
    if (!root) return;

    // TODO(core): replace `[]` with `await invoke("list_transfers")`.
    const all = isDemo() ? MOCK_TRANSFERS : [];
    const counts = {
        active: all.filter((t) => t.status === "active" || t.status === "paused").length,
        queued: all.filter((t) => t.status === "queued").length,
        completed: all.filter((t) => t.status === "completed").length,
        failed: all.filter((t) => t.status === "failed").length,
    };

    const filtered = all.filter((t) => {
        if (transferFilter === "active") return t.status === "active" || t.status === "paused";
        return t.status === transferFilter;
    });

    root.innerHTML = `
        <div class="view-head">
            <h1 class="view-title">Transfers</h1>
            <p class="view-sub">File and folder transfers, queued and in progress.</p>
        </div>
        <div class="segmented" role="tablist">
            ${segBtn("active", "Active", counts.active)}
            ${segBtn("queued", "Queued", counts.queued)}
            ${segBtn("completed", "Completed", counts.completed)}
            ${segBtn("failed", "Failed", counts.failed)}
        </div>
        <ul class="transfer-list" id="transfer-list"></ul>
    `;

    const list = document.getElementById("transfer-list");
    if (filtered.length === 0) {
        list.innerHTML = emptyTransfers(transferFilter);
        wireSegmented();
        return;
    }

    list.innerHTML = filtered.map(transferCard).join("");
    wireTransferActions();
    wireSegmented();
}

function segBtn(id, label, count) {
    const sel = transferFilter === id;
    return `<button class="seg-item" data-filter="${id}" aria-selected="${sel}">
        <span>${label}</span><span class="count">${count}</span>
    </button>`;
}

function wireSegmented() {
    document.querySelectorAll("[data-filter]").forEach((btn) => {
        btn.addEventListener("click", () => {
            transferFilter = btn.dataset.filter;
            renderTransfers();
        });
    });
}

function transferCard(t) {
    const isActive = t.status === "active";
    const isPaused = t.status === "paused";
    const isDone = t.status === "completed";
    const isFailed = t.status === "failed";
    const isQueued = t.status === "queued";

    let iconPath = '<path d="M7 4v14"/><path d="M3.5 7.5 7 4l3.5 3.5"/><path d="M17 20V6"/><path d="M13.5 16.5 17 20l3.5-3.5"/>';
    if (isDone) iconPath = '<path d="M5 12l5 5L20 7"/>';
    if (isFailed) iconPath = '<circle cx="12" cy="12" r="9"/><path d="M12 7v6"/><circle cx="12" cy="16.5" r="0.5" fill="currentColor"/>';

    const meta = [];
    meta.push(`<span>${fmtBytes(t.sizeBytes)}</span>`);
    if (isActive || isPaused) {
        meta.push(`<span class="dot-sep"></span>`);
        meta.push(`<span>${t.progress}%</span>`);
        if (isActive) {
            meta.push(`<span class="dot-sep"></span>`);
            meta.push(`<span>${fmtSpeed(t.speedBps)}</span>`);
            meta.push(`<span class="dot-sep"></span>`);
            meta.push(`<span>${fmtEta(t.etaSeconds)} left</span>`);
        }
    } else if (isQueued) {
        meta.push(`<span class="dot-sep"></span><span>Waiting</span>`);
    } else if (isFailed && t.error) {
        meta.push(`<span class="dot-sep"></span><span class="error">${esc(t.error)}</span>`);
    }

    const actions = [];
    if (isActive) {
        actions.push(actionBtn("pause", "Pause", '<rect x="6" y="5" width="4" height="14" rx="1"/><rect x="14" y="5" width="4" height="14" rx="1"/>'));
        actions.push(actionBtn("cancel", "Cancel", '<path d="M5 5l14 14"/><path d="M19 5L5 19"/>', true));
    } else if (isPaused) {
        actions.push(actionBtn("resume", "Resume", '<path d="M7 5l12 7-12 7z" fill="currentColor"/>'));
        actions.push(actionBtn("cancel", "Cancel", '<path d="M5 5l14 14"/><path d="M19 5L5 19"/>', true));
    } else if (isQueued) {
        actions.push(actionBtn("cancel", "Cancel", '<path d="M5 5l14 14"/><path d="M19 5L5 19"/>', true));
    } else if (isFailed) {
        actions.push(actionBtn("retry", "Retry", '<path d="M3 12a9 9 0 0 1 15.5-6.4L21 8"/><path d="M21 3v5h-5"/>'));
        actions.push(actionBtn("cancel", "Dismiss", '<path d="M5 5l14 14"/><path d="M19 5L5 19"/>', true));
    } else if (isDone) {
        actions.push(actionBtn("open", "Open folder", '<path d="M3 7h6l2 2h10v10H3z"/>'));
    }

    return `
        <li class="transfer-item ${isFailed ? "failed" : ""} ${isDone ? "completed" : ""}" data-id="${t.id}">
            <div class="transfer-icon"><svg viewBox="0 0 24 24">${iconPath}</svg></div>
            <div class="transfer-body">
                <div class="transfer-head">
                    <span class="transfer-name">${esc(t.name)}</span>
                    <span class="transfer-peer">${esc(t.peer)}</span>
                </div>
                <div class="transfer-progress"><div class="transfer-progress-bar" style="width:${t.progress}%"></div></div>
                <div class="transfer-meta">${meta.join("")}</div>
            </div>
            <div class="transfer-actions">${actions.join("")}</div>
        </li>`;
}

function actionBtn(action, tip, path, danger = false) {
    return `<button class="transfer-action ${danger ? "danger" : ""}" data-action="${action}" data-tip="${tip}">
        <svg viewBox="0 0 24 24">${path}</svg>
    </button>`;
}

function wireTransferActions() {
    document.querySelectorAll(".transfer-item").forEach((item) => {
        const id = item.dataset.id;
        item.querySelectorAll("[data-action]").forEach((btn) => {
            btn.addEventListener("click", (e) => {
                e.stopPropagation();
                handleTransferAction(id, btn.dataset.action);
            });
        });
    });
}

function handleTransferAction(id, action) {
    const t = MOCK_TRANSFERS.find((x) => x.id === id);
    if (!t) return;
    switch (action) {
        case "pause": t.status = "paused"; t.speedBps = 0; t.etaSeconds = null; toast("Transfer paused"); break;
        case "resume": t.status = "active"; t.speedBps = 127_000_000; t.etaSeconds = 24; toast("Transfer resumed"); break;
        case "cancel": toast("Transfer cancelled"); break;
        case "retry": toast("Retrying…"); break;
        case "open": toast("Opening folder…"); break;
    }
    renderTransfers();
    updateToolbar();
}

function emptyTransfers(filter) {
    const map = {
        active: { title: "No active transfers", body: "Transfers you start from a peer card will appear here with live progress, speed, and ETA." },
        queued: { title: "Nothing queued", body: "Queued transfers start automatically when the previous one finishes." },
        completed: { title: "No completed transfers", body: "Finished transfers live here. You can re-open their destination folder or send them again." },
        failed: { title: "No failed transfers", body: "Transfers that don't finish appear here with a reason and a retry action." },
    };
    const { title, body } = map[filter] || map.active;
    return `
        <li class="empty-state">
            <div class="art"><svg viewBox="0 0 96 96"><rect x="14" y="24" width="68" height="48" rx="6"/><path d="M30 48h36"/><path d="M30 58h22"/><path d="M42 36h12"/></svg></div>
            <h3>${title}</h3>
            <p>${body}</p>
        </li>`;
}

// ─── Chat ───────────────────────────────────────────────────────
function renderChat() {
    const root = document.getElementById("view-chat");
    if (!root) return;

    if (!isDemo()) {
        root.innerHTML = `
            <div class="view-head">
                <h1 class="view-title">Chat</h1>
                <p class="view-sub">Group chat scoped to a session.</p>
            </div>
            <div class="empty-state">
                <div class="art"><svg viewBox="0 0 96 96"><path d="M78 44a30 30 0 0 1-30 30H26l-8 8V44a30 30 0 1 1 60 0z"/></svg></div>
                <h3>Not in a session</h3>
                <p>Start a session from the Peers tab, or join one with a short code. Messages are signed by your session key and never leave the LAN.</p>
            </div>`;
        return;
    }

    const selfId = MOCK_CHAT.participants.find((p) => p.isSelf)?.id;
    const others = MOCK_CHAT.participants.filter((p) => !p.isSelf).map((p) => p.name).join(", ");

    root.innerHTML = `
        <div class="view-head">
            <h1 class="view-title">Chat</h1>
            <p class="view-sub">Session <code style="font-family:var(--mono);font-size:12px;background:var(--bg-3);padding:1px 5px;border-radius:4px;border:1px solid var(--border-1)">${esc(MOCK_CHAT.sessionId)}</code> · with ${esc(others)}</p>
        </div>
        <div class="chat-shell">
            <div class="chat-list" id="chat-list"></div>
            <div class="chat-input-bar">
                <textarea class="chat-input" id="chat-input" placeholder="Message the session…" rows="1"></textarea>
                <button class="chat-send" id="chat-send" disabled>
                    <svg viewBox="0 0 24 24"><path d="M22 2L11 13"/><path d="M22 2l-7 20-4-9-9-4z"/></svg>
                    Send
                </button>
            </div>
        </div>`;

    renderChatMessages(selfId);
    wireChatInput();
}

function renderChatMessages(selfId) {
    const list = document.getElementById("chat-list");
    if (!list) return;

    list.innerHTML = MOCK_CHAT.messages.map((m) => {
        const own = m.from === selfId || m.own === true;
        const author = MOCK_CHAT.participants.find((p) => p.id === m.from);
        const name = own ? "You" : (author?.name ?? "Unknown");
        const initials = (name === "You" ? "ME" : name).replace(/[^a-zA-Z]/g, "").slice(0, 2).toUpperCase() || "??";

        return `
            <div class="chat-message ${own ? "own" : ""}">
                <div class="chat-avatar">${esc(initials)}</div>
                <div class="chat-body">
                    <div class="chat-meta">
                        <span class="chat-author">${esc(name)}</span>
                        <span class="chat-time">${fmtTime(m.ts)}</span>
                    </div>
                    <div class="chat-text">${formatChatText(m.text)}</div>
                </div>
            </div>`;
    }).join("");

    list.scrollTop = list.scrollHeight;
}

function formatChatText(text) {
    let s = esc(text);
    s = s.replace(/`([^`]+)`/g, "<code>$1</code>");
    s = s.replace(/(https?:\/\/[^\s<]+)/g, '<a href="$1" target="_blank" rel="noopener">$1</a>');
    return s;
}

function wireChatInput() {
    const input = document.getElementById("chat-input");
    const send = document.getElementById("chat-send");
    if (!input || !send) return;
    const update = () => { send.disabled = input.value.trim().length === 0; };
    input.addEventListener("input", update);
    input.addEventListener("keydown", (e) => {
        if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            if (!send.disabled) submitChat();
        }
    });
    send.addEventListener("click", submitChat);
    setTimeout(() => input.focus(), 50);
}

function submitChat() {
    const input = document.getElementById("chat-input");
    const text = input.value.trim();
    if (!text) return;
    const selfId = MOCK_CHAT.participants.find((p) => p.isSelf)?.id;
    MOCK_CHAT.messages.push({ id: "m" + Date.now(), from: selfId, text, ts: Date.now(), own: true });
    input.value = "";
    document.getElementById("chat-send").disabled = true;
    renderChatMessages(selfId);

    setTimeout(() => {
        const replier = MOCK_CHAT.participants.find((p) => !p.isSelf);
        if (!replier) return;
        MOCK_CHAT.messages.push({ id: "m" + Date.now() + "-r", from: replier.id, text: "Got it.", ts: Date.now() });
        renderChatMessages(selfId);
    }, 1200);
}

// ─── Resources ──────────────────────────────────────────────────
let resourceQuery = "";

function renderResources() {
    const root = document.getElementById("view-resources");
    if (!root) return;

    // TODO(core): replace `[]` with `await invoke("list_resources")`.
    const all = isDemo() ? MOCK_RESOURCES : [];
    const filtered = filterResources(all, resourceQuery);

    root.innerHTML = `
        <div class="view-head">
            <h1 class="view-title">Resources</h1>
            <p class="view-sub">Hostel Brain — search what peers nearby are offering.</p>
        </div>
        <label class="resource-search">
            <svg viewBox="0 0 24 24"><circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5"/></svg>
            <input id="resource-search-input" type="text" placeholder="Try “DBMS notes”, “GPU”, “printer”…" spellcheck="false" autocomplete="off" value="${esc(resourceQuery)}" />
        </label>
        <p class="resource-hint">Searches locally. Nothing leaves your device — no LLM, no network calls.</p>
        <ul class="resource-list" id="resource-list"></ul>
    `;

    const list = document.getElementById("resource-list");
    if (filtered.length === 0) {
        list.innerHTML = resourceQuery
            ? `<li class="empty-state"><div class="art"><svg viewBox="0 0 96 96"><circle cx="42" cy="42" r="24"/><path d="M60 60l18 18"/></svg></div><h3>No matches</h3><p>Nobody on this LAN is advertising something matching “${esc(resourceQuery)}”.</p></li>`
            : `<li class="empty-state"><div class="art"><svg viewBox="0 0 96 96"><circle cx="42" cy="42" r="24"/><path d="M60 60l18 18"/><path d="M33 42h18"/><path d="M42 33v18"/></svg></div><h3>No resources advertised</h3><p>When peers advertise files, hardware, skills, or notes, they'll show up here.</p></li>`;
    } else {
        list.innerHTML = filtered.map(resourceCard).join("");
    }

    wireResourceSearch();
}

function filterResources(list, q) {
    if (!q.trim()) return list;
    const tokens = q.trim().toLowerCase().split(/\s+/);
    return list.filter((r) => {
        const haystack = `${r.label} ${r.kind} ${r.owner}`.toLowerCase();
        return tokens.every((t) => haystack.includes(t));
    });
}

function resourceCard(r) {
    return `
        <li class="resource-item">
            <span class="resource-badge ${esc(r.kind)}">${esc(r.kind)}</span>
            <div class="resource-info">
                <span class="resource-label">${esc(r.label)}</span>
                <span class="resource-owner">owned by <strong>${esc(r.owner)}</strong> · ${esc(r.ownerId)}</span>
            </div>
            <button class="transfer-action" data-tip="Contact owner" data-resource-id="${esc(r.id)}">
                <svg viewBox="0 0 24 24"><path d="M21 12a8.5 8.5 0 0 1-12.3 7.6L3.5 21l1.4-5.1A8.5 8.5 0 1 1 21 12z"/></svg>
            </button>
        </li>`;
}

function wireResourceSearch() {
    const input = document.getElementById("resource-search-input");
    if (!input) return;
    input.addEventListener("input", (e) => {
        resourceQuery = e.target.value;
        const cursor = input.selectionStart;
        renderResources();
        const next = document.getElementById("resource-search-input");
        if (next) {
            next.focus();
            next.setSelectionRange(cursor, cursor);
        }
    });
}

// ─── Command palette ────────────────────────────────────────────
const CMDS = [
    {
        id: "go-peers", label: "Go to Peers", hint: "Ctrl+1", view: "peers",
        icon: '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20a6.5 6.5 0 0 1 13 0"/><path d="M16 5.2a3.5 3.5 0 0 1 0 6.6"/><path d="M17.5 14.2A6.5 6.5 0 0 1 21.5 20"/>'
    },
    {
        id: "go-transfers", label: "Go to Transfers", hint: "Ctrl+2", view: "transfers",
        icon: '<path d="M7 4v14"/><path d="M3.5 7.5 7 4l3.5 3.5"/><path d="M17 20V6"/><path d="M13.5 16.5 17 20l3.5-3.5"/>'
    },
    {
        id: "go-chat", label: "Go to Chat", hint: "Ctrl+3", view: "chat",
        icon: '<path d="M21 12a8.5 8.5 0 0 1-12.3 7.6L3.5 21l1.4-5.1A8.5 8.5 0 1 1 21 12z"/>'
    },
    {
        id: "go-resources", label: "Go to Resources", hint: "Ctrl+4", view: "resources",
        icon: '<path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/>'
    },
    {
        id: "go-settings", label: "Go to Settings", hint: "Ctrl+5", view: "settings",
        icon: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>'
    },
    {
        id: "toggle-theme", label: "Toggle light/dark theme", hint: "",
        icon: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2"/><path d="M12 20v2"/><path d="M4.93 4.93l1.41 1.41"/><path d="M17.66 17.66l1.41 1.41"/><path d="M2 12h2"/><path d="M20 12h2"/><path d="M6.34 17.66l-1.41 1.41"/><path d="M19.07 4.93l-1.41 1.41"/>',
        run: () => {
            const current = loadedSettings?.theme ?? "system";
            const resolved = document.documentElement.dataset.theme;
            setThemeChoice(resolved === "dark" ? "light" : "dark");
        }
    },
    {
        id: "refresh", label: "Refresh peers", hint: "Ctrl+R",
        icon: '<path d="M3 12a9 9 0 0 1 15.5-6.4L21 8"/><path d="M21 3v5h-5"/><path d="M21 12a9 9 0 0 1-15.5 6.4L3 16"/><path d="M3 21v-5h5"/>',
        run: () => refreshPeers()
    },
    {
        id: "copy-self", label: "Copy my peer ID", hint: "",
        icon: '<rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15V5a2 2 0 0 1 2-2h10"/>',
        run: async () => { const s = await invoke("get_status"); copyText(s.peer_id, "Peer ID copied"); }
    },
    {
        id: "copy-data", label: "Copy data directory", hint: "",
        icon: '<rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15V5a2 2 0 0 1 2-2h10"/>',
        run: async () => { const s = await invoke("get_status"); copyText(s.data_dir, "Data directory copied"); }
    },
];

const overlay = document.getElementById("cmdk-overlay");
const cmdkInput = document.getElementById("cmdk-input");
const cmdkList = document.getElementById("cmdk-list");
let sel = 0;
let filtered = [];

function openCmdk() {
    overlay.classList.add("open");
    cmdkInput.value = "";
    cmdkInput.focus();
    renderCmdk("");
}
function closeCmdk() { overlay.classList.remove("open"); }
function toggleCmdk() { overlay.classList.contains("open") ? closeCmdk() : openCmdk(); }

function renderCmdk(q) {
    const query = q.trim().toLowerCase();
    const cmds = CMDS.filter((c) => c.label.toLowerCase().includes(query));
    const matchedPeers = peers.filter(
        (p) => p.name.toLowerCase().includes(query) || p.peer_id.toLowerCase().includes(query)
    );
    filtered = [
        ...cmds,
        ...matchedPeers.map((p) => ({ id: "peer-" + p.peer_id, label: p.name, hint: p.peer_id, peer: p })),
    ];
    sel = 0;

    if (filtered.length === 0) {
        cmdkList.innerHTML = `<div class="cmdk-empty">No matches.</div>`;
        return;
    }

    const html = [];
    if (cmds.length) {
        html.push(`<div class="cmdk-group-label">Commands</div>`);
        html.push(cmds.map((c, i) => cmdkItemHtml(c, i)).join(""));
    }
    if (matchedPeers.length) {
        html.push(`<div class="cmdk-group-label">Peers</div>`);
        html.push(matchedPeers.map((p, i) => cmdkItemHtml(
            { id: "peer-" + p.peer_id, label: p.name, hint: p.peer_id, peer: p },
            cmds.length + i
        )).join(""));
    }
    cmdkList.innerHTML = html.join("");
    updateSel();
    wireCmdkClicks();
}

function cmdkItemHtml(c, i) {
    const icon = c.icon
        ? `<svg viewBox="0 0 24 24">${c.icon}</svg>`
        : `<svg viewBox="0 0 24 24"><circle cx="9" cy="8" r="3.5"/><path d="M2.5 20a6.5 6.5 0 0 1 13 0"/></svg>`;
    return `<div class="cmdk-item" data-i="${i}">${icon}<span>${esc(c.label)}</span><span class="hint">${esc(c.hint || "")}</span></div>`;
}

function updateSel() {
    cmdkList.querySelectorAll(".cmdk-item").forEach((el, i) => {
        el.classList.toggle("sel", i === sel);
    });
}

// Click handler — THE FIX for bug 2
function wireCmdkClicks() {
    cmdkList.querySelectorAll(".cmdk-item").forEach((el) => {
        el.addEventListener("click", () => {
            const i = parseInt(el.dataset.i, 10);
            if (!isNaN(i)) {
                sel = i;
                runCmdk();
            }
        });
        // Also update hover selection
        el.addEventListener("mouseenter", () => {
            const i = parseInt(el.dataset.i, 10);
            if (!isNaN(i)) {
                sel = i;
                updateSel();
            }
        });
    });
}

function runCmdk() {
    const cmd = filtered[sel];
    if (!cmd) return;
    closeCmdk();
    if (cmd.view) {
        switchView(cmd.view);
    } else if (cmd.peer) {
        switchView("peers");
        selectPeer(cmd.peer.peer_id);
    } else if (cmd.run) {
        cmd.run();
    }
}

cmdkInput.addEventListener("input", (e) => renderCmdk(e.target.value));
cmdkInput.addEventListener("keydown", (e) => {
    if (e.key === "ArrowDown") { e.preventDefault(); sel = Math.min(sel + 1, filtered.length - 1); updateSel(); }
    else if (e.key === "ArrowUp") { e.preventDefault(); sel = Math.max(sel - 1, 0); updateSel(); }
    else if (e.key === "Enter") { e.preventDefault(); runCmdk(); }
    else if (e.key === "Escape") { e.preventDefault(); closeCmdk(); }
});
overlay.addEventListener("click", (e) => { if (e.target === overlay) closeCmdk(); });

// ─── Context menu ───────────────────────────────────────────────
const ctx = document.getElementById("ctx");

function openCtxPeer(x, y, peerId) {
    const p = peers.find((q) => q.peer_id === peerId);
    if (!p) return;

    ctx.innerHTML = `
        <div class="ctx-item disabled"><svg viewBox="0 0 24 24"><path d="M7 4v14"/><path d="M3.5 7.5 7 4l3.5 3.5"/></svg>Send file<span class="kbd">needs core</span></div>
        <div class="ctx-item disabled"><svg viewBox="0 0 24 24"><path d="M21 12a8.5 8.5 0 0 1-12.3 7.6L3.5 21l1.4-5.1A8.5 8.5 0 1 1 21 12z"/></svg>Message<span class="kbd">needs core</span></div>
        <div class="ctx-sep"></div>
        <div class="ctx-item" data-act="copy-id"><svg viewBox="0 0 24 24"><rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15V5a2 2 0 0 1 2-2h10"/></svg>Copy peer ID</div>
        <div class="ctx-item" data-act="copy-port"><svg viewBox="0 0 24 24"><rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15V5a2 2 0 0 1 2-2h10"/></svg>Copy port</div>
    `;
    positionCtx(x, y);

    ctx.querySelectorAll("[data-act]").forEach((el) => {
        el.addEventListener("click", () => {
            const act = el.dataset.act;
            if (act === "copy-id") copyText(p.peer_id, "Peer ID copied");
            if (act === "copy-port") copyText(String(p.port), "Port copied");
            closeCtx();
        });
    });
}

function positionCtx(x, y) {
    ctx.classList.add("open");
    const r = ctx.getBoundingClientRect();
    const w = window.innerWidth;
    const h = window.innerHeight;
    ctx.style.left = Math.min(x, w - r.width - 8) + "px";
    ctx.style.top = Math.min(y, h - r.height - 8) + "px";
}
function closeCtx() { ctx.classList.remove("open"); }

document.addEventListener("click", (e) => {
    if (!ctx.contains(e.target)) closeCtx();
});
document.addEventListener("contextmenu", (e) => {
    const inPeer = e.target.closest(".peer-item");
    if (inPeer) return;
    e.preventDefault();
    ctx.innerHTML = `
        <div class="ctx-item" data-act="refresh"><svg viewBox="0 0 24 24"><path d="M3 12a9 9 0 0 1 15.5-6.4L21 8"/><path d="M21 3v5h-5"/><path d="M21 12a9 9 0 0 1-15.5 6.4L3 16"/><path d="M3 21v-5h5"/></svg>Refresh peers<span class="kbd">Ctrl+R</span></div>
        <div class="ctx-sep"></div>
        <div class="ctx-item" data-act="copy-data"><svg viewBox="0 0 24 24"><rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15V5a2 2 0 0 1 2-2h10"/></svg>Copy data directory</div>
    `;
    positionCtx(e.clientX, e.clientY);
    ctx.querySelectorAll("[data-act]").forEach((el) => {
        el.addEventListener("click", async () => {
            const act = el.dataset.act;
            if (act === "refresh") refreshPeers();
            if (act === "copy-data") {
                const s = await invoke("get_status");
                copyText(s.data_dir, "Data directory copied");
            }
            closeCtx();
        });
    });
});

// ─── Toasts ─────────────────────────────────────────────────────
const toastStack = document.getElementById("toasts");
function toast(msg) {
    const el = document.createElement("div");
    el.className = "toast";
    el.innerHTML = `<svg class="ico" viewBox="0 0 24 24"><path d="M5 12.5l4.5 4.5L19 7"/></svg>${esc(msg)}`;
    toastStack.appendChild(el);
    setTimeout(() => {
        el.classList.add("leaving");
        setTimeout(() => el.remove(), 200);
    }, 2000);
}

// ─── Clipboard ──────────────────────────────────────────────────
async function copyText(text, confirmMsg) {
    try {
        await navigator.clipboard.writeText(text);
        toast(confirmMsg);
    } catch (e) {
        console.error("clipboard write failed", e);
    }
}

// ─── Global shortcuts ───────────────────────────────────────────
window.addEventListener("keydown", (e) => {
    const mod = e.ctrlKey || e.metaKey;
    const k = e.key.toLowerCase();

    if (mod && k === "k") { e.preventDefault(); toggleCmdk(); return; }
    if (mod && k === "r") { e.preventDefault(); refreshPeers(); return; }
    if (mod && ["1", "2", "3", "4", "5"].includes(k)) {
        e.preventDefault();
        const views = ["peers", "transfers", "chat", "resources", "settings"];
        switchView(views[parseInt(k, 10) - 1]);
        return;
    }
    if (e.key === "Escape") {
        if (overlay.classList.contains("open")) closeCmdk();
        else if (ctx.classList.contains("open")) closeCtx();
        else clearSelection();
        return;
    }
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
        if (currentView !== "peers" || peers.length === 0) return;
        if (document.activeElement.tagName === "INPUT") return;
        e.preventDefault();
        const idx = peers.findIndex((p) => p.peer_id === selectedPeerId);
        const next = e.key === "ArrowDown"
            ? Math.min((idx === -1 ? -1 : idx) + 1, peers.length - 1)
            : Math.max(idx - 1, 0);
        selectPeer(peers[next].peer_id);
    }
});

// ─── Search field ───────────────────────────────────────────────
document.getElementById("peer-search").addEventListener("input", (e) => {
    peerFilter = e.target.value;
    renderPeers();
});

// ─── Refresh button ─────────────────────────────────────────────
document.getElementById("tb-refresh").addEventListener("click", () => refreshPeers());

// ─── Utilities ──────────────────────────────────────────────────
function setText(id, value) {
    const el = document.getElementById(id);
    if (el) el.textContent = value;
}
function esc(s) {
    return String(s).replace(/[&<>"']/g, (c) =>
        ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])
    );
}

// ─── Wiring ─────────────────────────────────────────────────────
initWindow();
initNav();
initSettings();
initTheme();
refreshStatus();
refreshPeers();
refreshSettings();
renderInspector();
setInterval(refreshStatus, 3000);
setInterval(refreshPeers, 5000);
setInterval(refreshSettings, 5000);
listen("peer-discovered", () => refreshPeers());