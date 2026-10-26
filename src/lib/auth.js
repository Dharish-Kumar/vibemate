// Login state in the browser. The session itself is an httpOnly cookie set by the server.
import { API } from "./config.js";

// Send people to the login page, then back here afterwards
export function goToLogin() {
    const here = location.pathname.split("/").pop() + location.search;
    location.href = "login.html?next=" + encodeURIComponent(here || "index.html");
}

// Where to go after logging in: only pages of this app (never another site)
export function nextPage() {
    const next = new URLSearchParams(location.search).get("next") || "index.html";
    return /^(index|bannercreation|history|setup)\.html(\?[\w=&%.-]*)?$/.test(next) ? next : "index.html";
}

async function call(path, body) {
    const res = await fetch(API + path, body
        ? { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }
        : undefined);
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw Object.assign(new Error(data.error || "The vibeMate server didn't respond. Please try again."), { status: res.status });
    return data;
}

export const signup = (name, email, password) => call("/auth/signup", { name, email, password }).then((d) => d.user);
export const login = (email, password) => call("/auth/login", { email, password }).then((d) => d.user);
export async function logout() {
    try { await call("/auth/logout", {}); } finally { location.href = "login.html"; }
}

// The logged-in person, or null. A 401 means "not logged in"; anything else is a real problem.
export async function getMe() {
    try { return (await call("/auth/me")).user; }
    catch (err) { if (err.status === 401) return null; throw err; }
}

// For pages that need a login: returns the user, or redirects to the login page
export async function requireUser() {
    let user;
    try { user = await getMe(); }
    catch { throw new Error("Couldn't reach the vibeMate server. Is it running? (cd server && npm run dev)"); }
    if (!user) { goToLogin(); return new Promise(() => {}); }   // stays pending while the page changes
    return user;
}
