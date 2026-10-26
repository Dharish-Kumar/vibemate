// =====================================================
// vibeMate 1.1 · server/pixazo.js
// Calls the Pixazo API gateway and returns the finished image as bytes.
//   POST https://gateway.pixazo.ai/<endpoint>   header Ocp-Apim-Subscription-Key: PIXAZO_API_KEY
// Most image models answer at once ({ output: "<url>" } or { images: [{ url }] }).
// Some answer { request_id, polling_url, status: "QUEUED" }: then we poll until COMPLETED.
// The key stays on the server; the browser never sees it.
// =====================================================
import { pixazoKey } from "./imageModels.js";

const BASE = String(process.env.PIXAZO_BASE_URL || "https://gateway.pixazo.ai").replace(/\/$/, "");
const MAX_BYTES = 15 * 1024 * 1024;
const POLL_EVERY = 2500;
const POLL_FOR = 150000;

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

// ---------- Finding the image in any answer shape ----------
const URL_KEYS = ["media_url", "image_url", "imageUrl", "url", "output", "image", "images", "data", "result", "results", "outputs", "output_url"];
const B64_KEYS = ["b64_json", "base64", "image_base64", "imageBase64"];
const isHttp = (s) => typeof s === "string" && /^https?:\/\/\S+$/i.test(s.trim());
const isDataImage = (s) => typeof s === "string" && /^data:image\/[\w.+-]+;base64,/i.test(s);

export function findMedia(value, depth = 0) {
    if (value == null || depth > 6) return null;
    if (typeof value === "string") {
        if (isDataImage(value)) return { dataUrl: value };
        if (isHttp(value)) return { url: value.trim() };
        return null;
    }
    if (Array.isArray(value)) {
        for (const v of value) { const m = findMedia(v, depth + 1); if (m) return m; }
        return null;
    }
    if (typeof value === "object") {
        for (const k of B64_KEYS) {
            const v = value[k];
            if (typeof v === "string" && v.length > 200) return isDataImage(v) ? { dataUrl: v } : { base64: v.replace(/\s+/g, "") };
        }
        for (const k of URL_KEYS) { const m = findMedia(value[k], depth + 1); if (m) return m; }
        // Status links are not images
        for (const [k, v] of Object.entries(value)) {
            if (/polling|status|webhook|callback/i.test(k) || URL_KEYS.includes(k)) continue;
            const m = findMedia(v, depth + 1);
            if (m) return m;
        }
    }
    return null;
}

const statusOf = (json) => String(json?.status || json?.state || json?.data?.status || "").toUpperCase();
const DONE = /^(COMPLETED|COMPLETE|SUCCEEDED|SUCCESS|DONE|FINISHED)$/;
const FAILED = /^(ERROR|FAILED|FAILURE|CANCELLED|CANCELED)$/;

// ---------- Friendly errors ----------
function pixazoError(status, json, text) {
    const said = String(json?.error?.message || json?.error || json?.message || json?.detail || text || "").replace(/\s+/g, " ").slice(0, 240);
    const err = new Error(
        status === 401 || status === 403 ? "Pixazo didn't accept the API key. Check PIXAZO_API_KEY in server/.env (get one at api-console.pixazo.ai/api_keys)."
            : status === 402 ? "Your Pixazo account is out of credits for this model. Pick a free model, or top up at api-console.pixazo.ai."
                : status === 429 ? "Pixazo is busy (rate limit). Wait a few seconds and try again."
                    : status === 404 ? "Pixazo doesn't know this model link. It may have moved: check the model in server/imageModels.js."
                        : status >= 500 ? "Pixazo had a problem making the image. Please try again."
                            : `Pixazo said: ${said || "the request was refused"}`
    );
    err.status = status;
    err.detail = said;
    return err;
}

async function readJson(res) {
    const text = await res.text();
    try { return { json: JSON.parse(text), text }; } catch { return { json: null, text }; }
}

async function call(url, init) {
    let last;
    for (let attempt = 0; attempt < 2; attempt++) {
        const res = await fetch(url, { ...init, signal: AbortSignal.timeout(170000) });
        const { json, text } = await readJson(res);
        if (res.ok) return { json, text, res };
        last = pixazoError(res.status, json, text);
        if (!(res.status === 429 || res.status >= 500) || attempt) break;
        await wait(res.status === 429 ? 5000 : 1500);   // one retry for busy / temporary errors
    }
    throw last;
}

async function poll(pollUrl, headers) {
    const until = Date.now() + POLL_FOR;
    while (Date.now() < until) {
        await wait(POLL_EVERY);
        const { json } = await call(pollUrl, { method: "GET", headers });
        const status = statusOf(json);
        if (FAILED.test(status)) throw new Error(`Pixazo couldn't make the image: ${String(json?.error?.message || json?.error || json?.message || status).slice(0, 200)}`);
        const media = findMedia(json?.output ?? json?.result ?? json);
        if (media && (DONE.test(status) || !status)) return media;
    }
    throw new Error("Pixazo took too long. Please try again, or pick a faster model.");
}

async function toBytes(media) {
    if (media.dataUrl) {
        const [, type, b64] = media.dataUrl.match(/^data:(image\/[\w.+-]+);base64,(.*)$/is) || [];
        return { buffer: Buffer.from(b64 || "", "base64"), type: type || "image/png" };
    }
    if (media.base64) return { buffer: Buffer.from(media.base64, "base64"), type: "image/png" };
    const res = await fetch(media.url, { signal: AbortSignal.timeout(60000) });
    if (!res.ok) throw new Error("Pixazo made the image, but it couldn't be downloaded. Please try again.");
    const buffer = Buffer.from(await res.arrayBuffer());
    let type = String(res.headers.get("content-type") || "").split(";")[0].trim();
    if (!/^image\//.test(type)) type = sniffType(buffer);
    return { buffer, type };
}

function sniffType(b) {
    if (b[0] === 0x89 && b[1] === 0x50) return "image/png";
    if (b[0] === 0xff && b[1] === 0xd8) return "image/jpeg";
    if (b.slice(0, 4).toString() === "RIFF" && b.slice(8, 12).toString() === "WEBP") return "image/webp";
    return "";
}

// model = an entry from imageModels.js · returns { buffer, type }
export async function pixazoGenerate(model, { prompt, seed = Math.floor(Math.random() * 2147483647) }) {
    const key = pixazoKey();
    if (!key) throw new Error("Pixazo isn't set up. Add PIXAZO_API_KEY to server/.env and restart the server.");
    const headers = { "Ocp-Apim-Subscription-Key": key, "Content-Type": "application/json", "Cache-Control": "no-cache" };
    const { json, text } = await call(BASE + model.endpoint, {
        method: "POST",
        headers,
        body: JSON.stringify(model.body({ prompt, seed }))
    });
    let media = findMedia(json);
    if (!media) {
        const id = json?.request_id || json?.requestId || json?.id;
        const pollUrl = json?.polling_url || json?.pollingUrl || json?.status_url || (id ? `${BASE}/v2/requests/status/${encodeURIComponent(id)}` : "");
        if (!pollUrl) {
            console.error("Pixazo answer without an image:", String(text).slice(0, 400));
            throw new Error("Pixazo answered without an image. Please try again, or pick another model.");
        }
        media = await poll(pollUrl, headers);
    }
    const out = await toBytes(media);
    if (!out.buffer.length || !/^image\//.test(out.type)) throw new Error("Pixazo sent something that isn't an image. Please try again.");
    if (out.buffer.length > MAX_BYTES) throw new Error("The image from Pixazo is too big to keep.");
    return out;
}
