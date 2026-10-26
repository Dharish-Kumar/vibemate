// =====================================================
// vibeMate 3.2 · chatsApi.js
// Each person's chats, saved in MongoDB through the server:
//   kind "chat"  = Create anything (AI assistant) · kind "image" = Image studio (AI images)
// Only chats that changed since the last save are sent; deleted chats are removed.
// =====================================================
import { API } from "./config.js";
import { goToLogin } from "./auth.js";

const LOCAL_KEY = "vibemate:chats";   // where chats lived before (one browser only)
const MAX_CHATS = 60;
const saved = new Map();              // chat id -> JSON as last saved
let queue = Promise.resolve();

async function request(path, init) {
    const res = await fetch(API + "/chats" + path, init);
    if (res.status === 401) { goToLogin(); throw new Error("Please log in."); }
    if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || "Couldn't save the chat.");
    return res.json();
}
const put = (c) => request("/" + encodeURIComponent(c.id), { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(c) });

// Chats saved before 3.2 have no kind: a chat with images was an image chat
export const kindOf = (c) => (c?.kind === "chat" || c?.kind === "image" ? c.kind
    : (c?.messages || []).some((m) => m?.image?.id) ? "image" : "chat");

// My chats from the server. The first time, chats saved in this browser by vibeMate 2.x / 3.0 are moved into the account.
export async function loadChats() {
    const { chats } = await request("");
    let local = [];
    try { local = JSON.parse(localStorage.getItem(LOCAL_KEY) || "[]"); } catch { /* ignore */ }
    const have = new Set(chats.map((c) => c.id));
    const toMove = Array.isArray(local) ? local.filter((c) => c && c.id && Array.isArray(c.messages) && !have.has(c.id)).map((c) => ({ ...c, kind: kindOf(c) })) : [];
    for (const c of toMove) await put(c);
    if (Array.isArray(local) && local.length) {
        try { localStorage.setItem(LOCAL_KEY + ":moved", localStorage.getItem(LOCAL_KEY)); localStorage.removeItem(LOCAL_KEY); } catch { /* ignore */ }
    }
    const all = [...chats, ...toMove].map((c) => ({ ...c, kind: kindOf(c) }))
        .sort((a, b) => (b.updated || 0) - (a.updated || 0)).slice(0, MAX_CHATS);
    all.forEach((c) => saved.set(c.id, JSON.stringify(c)));
    return all;
}

// Called with the full (already slimmed) list after every change
export function syncChats(list) {
    queue = queue.then(async () => {
        const ids = new Set();
        for (const c of list) {
            ids.add(c.id);
            const json = JSON.stringify(c);
            if (saved.get(c.id) === json) continue;
            await put(c);
            saved.set(c.id, json);
        }
        for (const id of [...saved.keys()]) {
            if (ids.has(id)) continue;
            await request("/" + encodeURIComponent(id), { method: "DELETE" });
            saved.delete(id);
        }
    }).catch((err) => console.warn("Chats couldn't be saved:", err.message));
    return queue;
}
