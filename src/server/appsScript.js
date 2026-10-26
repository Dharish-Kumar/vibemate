// The private link to Apps Script.
// The browser calls /api/gas (only when logged in); this forwards the request to your Apps Script web app
// with the secret key, so the Apps Script link and key never reach the browser.
// 1.1: callAppsScript() lets the server itself ask Apps Script (guideline banners with a brand kit, routes/ai.js).
import express, { Router } from "express";
import rateLimit from "express-rate-limit";

const router = Router();

// AI and save requests per person per minute (protects your Cloudflare and Pixazo quota)
export const perPerson = rateLimit({
    windowMs: 60 * 1000,
    limit: Number(process.env.AI_PER_MINUTE) || 15,
    keyGenerator: (req) => String(req.user._id),
    standardHeaders: "draft-7",
    legacyHeaders: false,
    message: { error: "That's a lot of requests in one minute. Please wait a moment and try again." }
});

function scriptUrl(query = {}) {
    const url = new URL(process.env.APPS_SCRIPT_URL);
    for (const [k, v] of Object.entries(query)) url.searchParams.set(k, String(v));
    if (process.env.APPS_SCRIPT_KEY) url.searchParams.set("key", process.env.APPS_SCRIPT_KEY);
    return url;
}

// POST a JSON payload to Apps Script from the server. Returns the parsed answer (throws on network trouble).
export async function callAppsScript(payload) {
    let upstream;
    try {
        upstream = await fetch(scriptUrl(), {
            method: "POST",
            redirect: "follow",
            signal: AbortSignal.timeout(170000),
            headers: { "Content-Type": "text/plain;charset=utf-8" },
            body: JSON.stringify(payload)
        });
    } catch (err) {
        console.error("Apps Script:", err.message);
        throw new Error("The server couldn't reach Apps Script. Check APPS_SCRIPT_URL in server/.env.");
    }
    const text = await upstream.text();
    let data;
    try { data = JSON.parse(text); } catch { throw new Error("Apps Script didn't answer with data. Deploy Code.gs as a web app (New version) and try again."); }
    if (!upstream.ok && !data?.error) throw new Error("Apps Script had a problem. Please try again.");
    return data;
}

async function forward(req, res) {
    const url = scriptUrl(req.query);
    const init = { method: req.method, redirect: "follow", signal: AbortSignal.timeout(170000) };
    if (req.method === "POST") {
        init.body = typeof req.body === "string" ? req.body : "";
        init.headers = { "Content-Type": "text/plain;charset=utf-8" };
    }
    try {
        const upstream = await fetch(url, init);
        const text = await upstream.text();
        res.status(upstream.ok ? 200 : 502)
            .type(upstream.headers.get("content-type") || "text/plain")
            .send(text);
    } catch (err) {
        console.error("Apps Script:", err.message);
        res.status(502).json({ error: "The server couldn't reach Apps Script. Check APPS_SCRIPT_URL in server/.env." });
    }
}

router.get("/", forward);
// The browser sends JSON as plain text (same as before), images included, so allow large bodies
router.post("/", perPerson, express.text({ type: "*/*", limit: "25mb" }), forward);

export default router;
