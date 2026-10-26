// =====================================================
// vibeMate 1.1 (React) · config.js
// The browser never calls Apps Script directly. It calls the vibeMate server (src/server folder),
// which checks the login and forwards to Apps Script with a secret key. The Apps Script link lives
// in server/.env (APPS_SCRIPT_URL), not here.
// =====================================================
export const API = String(import.meta.env.VITE_API_URL || "/api").replace(/\/$/, "");   // the vibeMate server
export const WEBAPP_URL = API + "/gas";   // Apps Script (AI), through the server
export const APP_VERSION = "1.1";      // front end (React). Needs Code.gs v9.0 or newer (unchanged in 1.1).
export const MIN_CODE_VERSION = 9.0;   // older Code.gs is refused, so an old deployment can't be used by mistake

// The home page hands a new guideline banner to the editor through this key (saves one round trip)
export const HANDOFF_KEY = "vibemate:handoff";

export const isWebAppUrl = () => true;   // kept for older code: the server checks the real link

const deployHelp = `Paste Code.gs v${MIN_CODE_VERSION.toFixed(1)} into Apps Script, then Deploy → Manage deployments → ✏️ → Version: New version → Deploy.`;

// Before any AI action: make sure the server reaches Apps Script and it runs the matching Code.gs.
let backendChecked = false;
export async function ensureBackend() {
    if (backendChecked) return;
    let info = {};
    try { info = await fetch(WEBAPP_URL + "?diag=1").then((r) => r.json()); } catch { /* handled below */ }
    if (info.error && !info.version) throw new Error(info.error);
    const version = info.version || "";
    const number = parseFloat(String(version).replace(/^v/, "")) || 0;
    if (number < MIN_CODE_VERSION) {
        throw new Error(`The Apps Script web app runs ${version || "an old or unreachable version"}. ${deployHelp}`);
    }
    backendChecked = true;
}

// Backend version read from ?diag=1 (shared by the connection check and the pin editor)
let backendVersion = null;
export const setBackendVersion = (v) => { backendVersion = v; };
export async function backendAtLeast(min) {
    if (backendVersion === null) {
        try { backendVersion = parseFloat(String((await fetch(WEBAPP_URL + "?diag=1").then((r) => r.json())).version || "").replace(/^v/, "")) || 0; }
        catch { backendVersion = 0; }
    }
    if (backendVersion < min) {
        throw new Error(`This needs Code.gs v${min} (the web app runs ${backendVersion ? "v" + backendVersion : "an older version"}). ${deployHelp}`);
    }
}
