// LocalOS frontend.
//
// Talks to Rust via Tauri's IPC. With `withGlobalTauri: true` in the
// Tauri config, the API is available as `window.__TAURI__`.

const { invoke } = window.__TAURI__.core;
const { listen } = window.__TAURI__.event;

async function refreshStatus() {
    try {
        const s = await invoke("get_status");
        document.getElementById("version").textContent = s.version;
        document.getElementById("peer-id").textContent = s.peer_id;
        document.getElementById("firewall").textContent = s.firewall_status;
        document.getElementById("clipboard").textContent = s.clipboard_preview ?? "(empty or non-text)";
        document.getElementById("data-dir").textContent = s.data_dir;
    } catch (e) {
        console.error("get_status failed", e);
    }
}

async function refreshPeers() {
    const ul = document.getElementById("peers");
    try {
        const peers = await invoke("list_peers");
        if (peers.length === 0) {
            ul.innerHTML = '<li class="empty">No other LocalOS peers on this LAN.</li>';
            return;
        }
        ul.innerHTML = peers
            .map(
                (p) =>
                    `<li><span class="name">${escapeHtml(p.name)}</span><span class="id">${escapeHtml(p.peer_id)}</span></li>`
            )
            .join("");
    } catch (e) {
        console.error("list_peers failed", e);
    }
}

function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, (c) =>
        ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])
    );
}

// Push notifications from Rust.
listen("peer-discovered", (event) => {
    console.log("peer discovered", event.payload);
    refreshPeers();
});

// Initial render + poll the clipboard every 3 seconds.
refreshStatus();
refreshPeers();
setInterval(refreshStatus, 3000);