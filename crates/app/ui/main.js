const { invoke } = window.__TAURI__.core;
const { listen } = window.__TAURI__.event;

// ─── State ──────────────────────────────────────────────────────
let peers = [];
let selectedPeerId = null;
let currentView = "peers";
let peerFilter = "";
let lastScan = Date.now();

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
            countEl.textContent = peersCount === 0
                ? "Listening…"
                : `${peersCount} on this LAN`;
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
let loadedSettings = null;

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
    } catch (e) {
        console.error("get_settings failed", e);
    }
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

// ─── Peers ──────────────────────────────────────────────────────
async function refreshPeers() {
    try {
        peers = await invoke("list_peers");
        lastScan = Date.now();

        document.getElementById("peer-count").textContent = peers.length;
        document.getElementById("peer-count").classList.toggle("has-peers", peers.length > 0);

        // status bar
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

    if (peers.length === 0) {
        ul.innerHTML = radarEmpty();
        return;
    }

    const filtered = peers.filter((p) => {
        if (!peerFilter) return true;
        const q = peerFilter.toLowerCase();
        return (
            p.name.toLowerCase().includes(q) || p.peer_id.toLowerCase().includes(q)
        );
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
              <path d="M130 130 L130 12 A118 118 0 0 1 235 92 Z" fill="#4facfe" opacity="0.14"/>
              <line x1="130" y1="130" x2="235" y2="92" stroke="#4facfe" stroke-width="4"   stroke-linecap="round" opacity="0.35"/>
              <line x1="130" y1="130" x2="235" y2="92" stroke="#7ec2ff" stroke-width="1.6" stroke-linecap="round" opacity="0.95"/>
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

// Update the radar meta every second
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
        id: "refresh", label: "Refresh peers", hint: "Ctrl+R",
        icon: '<path d="M3 12a9 9 0 0 1 15.5-6.4L21 8"/><path d="M21 3v5h-5"/><path d="M21 12a9 9 0 0 1-15.5 6.4L3 16"/><path d="M3 21v-5h5"/>', run: () => refreshPeers()
    },
    {
        id: "copy-self", label: "Copy my peer ID", hint: "",
        icon: '<rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15V5a2 2 0 0 1 2-2h10"/>', run: async () => {
            const s = await invoke("get_status");
            copyText(s.peer_id, "Peer ID copied");
        }
    },
    {
        id: "copy-data", label: "Copy data directory", hint: "",
        icon: '<rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15V5a2 2 0 0 1 2-2h10"/>', run: async () => {
            const s = await invoke("get_status");
            copyText(s.data_dir, "Data directory copied");
        }
    },
];

const overlay = document.getElementById("cmdk-overlay");
const input = document.getElementById("cmdk-input");
const list = document.getElementById("cmdk-list");
let sel = 0;
let filtered = [];

function openCmdk() {
    overlay.classList.add("open");
    input.value = "";
    input.focus();
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
        ...matchedPeers.map((p) => ({
            id: "peer-" + p.peer_id,
            label: p.name,
            hint: p.peer_id,
            peer: p,
        })),
    ];
    sel = 0;

    if (filtered.length === 0) {
        list.innerHTML = `<div class="cmdk-empty">No matches.</div>`;
        return;
    }

    const html = [];
    if (cmds.length) {
        html.push(`<div class="cmdk-group-label">Commands</div>`);
        html.push(cmds.map((c, i) => item(c, i)).join(""));
    }
    if (matchedPeers.length) {
        html.push(`<div class="cmdk-group-label">Peers</div>`);
        html.push(matchedPeers.map((p, i) => item({
            id: "peer-" + p.peer_id, label: p.name, hint: p.peer_id, peer: p,
        }, cmds.length + i)).join(""));
    }
    list.innerHTML = html.join("");
    updateSel();
}

function item(c, i) {
    const icon = c.icon
        ? `<svg viewBox="0 0 24 24">${c.icon}</svg>`
        : `<svg viewBox="0 0 24 24"><circle cx="9" cy="8" r="3.5"/><path d="M2.5 20a6.5 6.5 0 0 1 13 0"/></svg>`;
    return `<div class="cmdk-item" data-i="${i}">${icon}<span>${esc(c.label)}</span><span class="hint">${esc(c.hint || "")}</span></div>`;
}

function updateSel() {
    list.querySelectorAll(".cmdk-item").forEach((el, i) => {
        el.classList.toggle("sel", i === sel);
    });
}

function runCmdk() {
    const item = filtered[sel];
    if (!item) return;
    if (item.view) switchView(item.view);
    else if (item.peer) { switchView("peers"); selectPeer(item.peer.peer_id); }
    else if (item.run) item.run();
    closeCmdk();
}

input.addEventListener("input", (e) => renderCmdk(e.target.value));
input.addEventListener("keydown", (e) => {
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
    <div class="ctx-sep"></div>
    <div class="ctx-item disabled"><svg viewBox="0 0 24 24"><path d="M3 6h18"/><path d="M8 6V4h8v2"/><path d="M6 6l1 14h10l1-14"/></svg>Hide from list<span class="kbd">soon</span></div>
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
    // right-click outside peer items → generic menu
    const inPeer = e.target.closest(".peer-item");
    if (inPeer) return; // peer menu handled above
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

// ─── Clipboard (via JS — no Rust roundtrip for UX speed) ────────
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
        return;
    }
    if (e.key === "Enter") {
        if (currentView === "peers" && selectedPeerId && !document.activeElement.matches("input")) {
            renderInspector();
        }
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
refreshStatus();
refreshPeers();
refreshSettings();
renderInspector();
setInterval(refreshStatus, 3000);
setInterval(refreshPeers, 5000);
setInterval(refreshSettings, 5000);
listen("peer-discovered", () => refreshPeers());