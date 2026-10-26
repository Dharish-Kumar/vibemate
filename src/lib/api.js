// =====================================================
// vibeMate 3.0 · api.js   Apps Script calls + small browser helpers shared by both pages
// =====================================================
import { WEBAPP_URL } from "./config.js";
import { goToLogin } from "./auth.js";

// POST without a Content-Type header -> sent as text/plain, avoids the CORS preflight Apps Script can't answer
export async function post(payload) {
    const res = await fetch(WEBAPP_URL, { method: "POST", body: JSON.stringify(payload) });
    return readJson(res);
}

export async function getJson(query = "") {
    const res = await fetch(WEBAPP_URL + query);
    return readJson(res);
}

// Session ended -> login page · rate limit / server messages -> shown as the error
async function readJson(res) {
    if (res.status === 401) { goToLogin(); throw new Error("Please log in again."); }
    const data = await res.json().catch(() => null);
    if (!res.ok) throw new Error(data?.error || "The server didn't respond. Please try again.");
    return data;
}

// Saved AI images (chat images and backgrounds) live in Drive; fetched back as data URLs
const imageCache = new Map();
export const cachedImage = (id) => imageCache.get(id);
export const cacheImage = (id, dataUrl) => imageCache.set(id, dataUrl);
export async function fetchImage(id) {
    if (imageCache.has(id)) return imageCache.get(id);
    const res = await getJson(`?bg=${encodeURIComponent(id)}`);
    if (!res.dataUrl) throw new Error(res.error || "not found");
    imageCache.set(id, res.dataUrl);
    return res.dataUrl;
}

// Helper libraries load from a CDN only when they are needed (same files as vibeMate 2.x)
export const LIBS = {
    pdf: "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js",
    pdfWorker: "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js",
    docx: "https://cdnjs.cloudflare.com/ajax/libs/mammoth/1.6.0/mammoth.browser.min.js",
    jspdf: "https://cdn.jsdelivr.net/npm/jspdf@2.5.1/dist/jspdf.umd.min.js",
    html2canvas: "https://cdn.jsdelivr.net/npm/html2canvas@1.4.1/dist/html2canvas.min.js"
};
const scripts = {};
export function loadScript(src) {
    if (!scripts[src]) {
        scripts[src] = new Promise((resolve, reject) => {
            const s = document.createElement("script");
            s.src = src;
            s.onload = resolve;
            s.onerror = () => { delete scripts[src]; reject(new Error("Couldn't load a helper library. Check your internet connection.")); };
            document.head.append(s);
        });
    }
    return scripts[src];
}

// localStorage with JSON and no crashes in private mode
export const store = {
    get(key, fallback = null) { try { const v = localStorage.getItem(key); return v === null ? fallback : JSON.parse(v); } catch { return fallback; } },
    set(key, value) { try { localStorage.setItem(key, JSON.stringify(value)); return true; } catch { return false; } }
};

export const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
export const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
export const fmtSize = (s) => `${s.w} × ${s.h}`;
export const fmtBytes = (n) => n > 1048576 ? (n / 1048576).toFixed(1) + " MB" : Math.max(1, Math.round(n / 1024)) + " KB";

export function loadImage(src, cors = false) {
    return new Promise((resolve, reject) => {
        const img = new Image();
        if (cors) img.crossOrigin = "anonymous";
        img.onload = () => resolve(img);
        img.onerror = () => reject(new Error("Image failed to load"));
        img.src = src;
    });
}

// Reference images for the image model must be under 512 px
export async function shrinkImage(src, max = 508) {
    let img;
    try { img = await loadImage(src); } catch { throw new Error("not an image"); }
    const s = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight));
    const c = document.createElement("canvas");
    c.width = Math.max(1, Math.round(img.naturalWidth * s));
    c.height = Math.max(1, Math.round(img.naturalHeight * s));
    const ctx = c.getContext("2d");
    ctx.fillStyle = "#ffffff";                 // transparent PNGs get a white base
    ctx.fillRect(0, 0, c.width, c.height);
    ctx.drawImage(img, 0, 0, c.width, c.height);
    return c.toDataURL("image/jpeg", 0.86);
}

export function saveFile(dataUrl, name) {
    const link = document.createElement("a");
    link.download = name;
    link.href = dataUrl;
    link.click();
}
