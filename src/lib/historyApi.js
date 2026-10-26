// =====================================================
// vibeMate 3.2 · historyApi.js
// History + guideline banners (server/routes/history.js) and links between the pages.
// =====================================================
import { API } from "./config.js";
import { goToLogin } from "./auth.js";

async function call(path, options = {}) {
    const res = await fetch(API + path, {
        credentials: "include",
        ...options,
        headers: options.body ? { "Content-Type": "application/json", ...options.headers } : options.headers
    });
    let data = {};
    try { data = await res.json(); } catch { /* empty answer */ }
    if (res.status === 401) {
        goToLogin();
        throw new Error("Please log in again.");
    }
    if (!res.ok) throw new Error(data.error || "Something went wrong. Please try again.");
    return data;
}

// { days, chat: [{ id, kind:"chat", title, updatedAt, messages, daysLeft }],
//   studio: [{ id, kind:"image"|"banner", title, thumb, updatedAt, images, daysLeft }] }
export const getHistory = (limit = 100) => call(`/history?limit=${limit}`);

// Guideline banners
export const listBanners = (limit = 24) => call(`/banners?limit=${limit}`);
export const getBanner = (id) => call(`/banners/${encodeURIComponent(id)}`);
export const createBanner = (banner, thumb = "") => call("/banners", { method: "POST", body: JSON.stringify({ banner, thumb }) });
export const saveBanner = (id, banner, thumb = "") => call(`/banners/${encodeURIComponent(id)}`, { method: "PUT", body: JSON.stringify({ banner, thumb }) });
export const deleteBanner = (id) => call(`/banners/${encodeURIComponent(id)}`, { method: "DELETE" });

// Chats (Create anything and Image studio)
export const deleteChat = (id) => call(`/chats/${encodeURIComponent(id)}`, { method: "DELETE" });

// Links between the pages (relative, so the built app works from any folder)
export const pageLink = (page) => page;
export const homeLink = (mode = "create", extra = "") => `index.html?mode=${mode}${extra}`;
export const editLink = (kind, id) =>
    kind === "banner" ? `bannercreation.html?id=${encodeURIComponent(id)}`
        : kind === "image" ? homeLink("image", `&tab=image&chat=${encodeURIComponent(id)}`)
            : homeLink("create", `&chat=${encodeURIComponent(id)}`);
export const KIND_LABEL = { chat: "Create anything", image: "AI image", banner: "Guideline banner" };

// "Today, 12:24" · "Yesterday, 09:10" · "23 Oct, 12:24"
export function fmtWhen(date) {
    if (!date) return "–";
    const d = new Date(date);
    if (isNaN(d)) return "–";
    const time = d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    const today = new Date();
    const yesterday = new Date(Date.now() - 864e5);
    if (d.toDateString() === today.toDateString()) return `Today, ${time}`;
    if (d.toDateString() === yesterday.toDateString()) return `Yesterday, ${time}`;
    return `${d.toLocaleDateString([], { day: "numeric", month: "short" })}, ${time}`;
}
