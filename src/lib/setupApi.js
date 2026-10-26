// =====================================================
// vibeMate 1.1 · setupApi.js
// Brand kits (Setup page) and the AI routes that use them (server/routes/brandKits.js, server/routes/ai.js).
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
    if (res.status === 401) { goToLogin(); throw new Error("Please log in again."); }
    if (!res.ok) throw Object.assign(new Error(data.error || "Something went wrong. Please try again."), { status: res.status });
    return data;
}
const send = (method, body) => ({ method, body: body === undefined ? undefined : JSON.stringify(body) });

// ---------- Brand kits ----------
// { kits: [{ id, name, tone, samples, typography, defaults, isDefault, updatedAt }], max, scope }
export const listKits = () => call("/brandkits");
export const createKit = (kit) => call("/brandkits", send("POST", { kit })).then((d) => d.kit);
export const saveKit = (id, kit) => call(`/brandkits/${encodeURIComponent(id)}`, send("PUT", { kit })).then((d) => d.kit);
export const setDefaultKit = (id) => call(`/brandkits/${encodeURIComponent(id)}/default`, send("POST", {}));
export const deleteKit = (id) => call(`/brandkits/${encodeURIComponent(id)}`, { method: "DELETE" });

// ---------- Image models + AI ----------
let modelsOnce = null;
// { models: [{ id, label, provider, free, note, usesSamples, available, reason }], default }
export function getModels() {
    modelsOnce ??= call("/ai/models").catch((err) => { modelsOnce = null; throw err; });
    return modelsOnce;
}
// -> { banner, dataUrl, warning, model, kit }
export const generateGuideline = (payload) => call("/ai/banner", send("POST", payload));
// -> { key: "ai:<id>" | "px:<id>", dataUrl, product, prompt, model }
export const generateBackground = (payload) => call("/ai/background", send("POST", payload));
// A Pixazo background saved on the server ("px:<id>")
export const aiImageUrl = (key) => `${API}/ai/images/${encodeURIComponent(String(key).replace(/^px:/, ""))}`;

// The model picked last time (per browser)
const MODEL_KEY = "vibemate:model";
export const lastModel = () => { try { return localStorage.getItem(MODEL_KEY) || ""; } catch { return ""; } };
export const rememberModel = (id) => { try { localStorage.setItem(MODEL_KEY, id); } catch { /* private mode */ } };
const KIT_KEY = "vibemate:kit";
export const lastKit = () => { try { return localStorage.getItem(KIT_KEY) || ""; } catch { return ""; } };
export const rememberKit = (id) => { try { localStorage.setItem(KIT_KEY, id); } catch { /* private mode */ } };

// Which model to show first: the kit's choice, then the last one used, then the server default (only ones that work)
export function pickModel(models, kit, fallback) {
    const ok = (id) => models.some((m) => m.id === id && m.available);
    return [kit?.defaults?.model, lastModel(), fallback, "cf-flux"].find(ok) || models.find((m) => m.available)?.id || "cf-flux";
}
