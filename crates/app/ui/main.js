async function sayHi() {
    const name = document.getElementById("name").value || "world";
    const reply = await window.__TAURI__.core.invoke("greet", { name });
    document.getElementById("output").textContent = reply;
}