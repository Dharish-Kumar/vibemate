// =====================================================
// vibeMate 1.1 · editor/layout.js
// Banner layout settings + the pure helpers behind the editor (same numbers as vibeMate 2.4 script.js):
// product cut-outs, product placement, contact shadows, text patch, bold amounts in the offer line.
// =====================================================
import { WEBAPP_URL } from "../lib/config.js";
import { loadImage } from "../lib/api.js";
import { cleanStyle } from "../lib/brandKit.js";
import { aiImageUrl } from "../lib/setupApi.js";

export const STAGE_W = 1360;
export const STAGE_H = 800;

// Same order as the Google Sheet columns A → M (see Code.gs)
export const FIELDS = [
    "maintext", "subtext", "offercallout", "buttontext",
    "sku1", "sku2", "sku3",
    "maincolor", "subcolor", "offercolor", "buttoncolor",
    "background", "extras"
];
// What the Manual form starts with (and goes back to on Reset)
export const DEFAULTS = {
    maintext: "", subtext: "", offercallout: "", buttontext: "Shop now",
    sku1: "", sku2: "", sku3: "",
    maincolor: "#1a1a1a", subcolor: "#1a1a1a", offercolor: "#1a1a1a", buttoncolor: "#000000",
    background: "blush"
};
export const MAX_LEN = { maintext: 60, subtext: 50, offercallout: 40, buttontext: 18 };

// Background themes (key is saved in the sheet)
export const THEMES = {
    blush: ["#fef8f7", "#f3e4e2"],
    peach: ["#fff6ef", "#ffd9c2"],
    sand:  ["#fdf8ef", "#f1e3c8"],
    mint:  ["#f3fbf6", "#d6ecdf"],
    sky:   ["#f4f8ff", "#d9e5f7"],
    lilac: ["#f8f5ff", "#e3daf5"]
};

// Where the products stand, in banner pixels. No podium: they sit on the background's own ground.
const GROUND = { left: 700, right: 1300, base: 710 };
//   area = visual size in px² (every product gets the same AREA) · maxW, maxH = limits · lift = px above the ground
const SLOTS = {
    1: { area: 105000, maxW: 300, maxH: 560, lift: 6 },    // left
    2: { area: 120000, maxW: 330, maxH: 620, lift: 0 },    // centre (hero, in front)
    3: { area: 100000, maxW: 300, maxH: 580, lift: 6 }     // right
};
const PRODUCT_SCALE = 1;   // one knob for all products: 1.1 = 10% bigger
const PRODUCT_GAP = -26;   // space between products (negative = side products tuck behind the hero)
const SHADOW_STRENGTH = 1; // contact shadow: 0 = none, 1 = normal, 1.5 = darker

// Text patch (gradient behind the text). It only appears when the text would be hard to read.
const PATCH_TARGET = 6;    // wanted contrast (4.5 = minimum readable, 7 = very clear)
const PATCH_MAX = 0.84;    // strongest the patch can get (0–1)
export const MAX_PINS = 8;
export const LOAD_DELAY = 600;    // ms after typing/pasting a link before the product loads

export const TARGET_LABELS = {
    heading: "Headline", sub: "Sub text", offer: "Offer callout", button: "Button", text: "Text area",
    product1: "Product 1 (left)", product2: "Product 2 (centre)", product3: "Product 3 (right)", background: "Background"
};
export const PIN_PLACEHOLDERS = {
    heading: "e.g. Change to “Fresh deals every day” · make it dark green",
    sub: "e.g. Shorter · change the colour to grey",
    offer: "e.g. Change to “Up to 40% off”",
    button: "e.g. Say “Order now” · make it red",
    text: "e.g. Make all the text white",
    product1: "e.g. Make it smaller · remove it",
    product2: "e.g. Make it bigger · remove it",
    product3: "e.g. Make it smaller · remove it",
    background: "e.g. Add a few green leaves here · make the wall warmer"
};

// Same tags as src/lib/tags.js and TAG_PRESETS in Code.gs
export const QUICK_TAGS = [
    ["/hdreal", "Enhanced HD photorealistic look"], ["/4k", "High-quality, detailed 4K image"], ["/8k", "Ultra-detailed, high-resolution image"],
    ["/cinematic", "Cinematic lighting, composition and mood"], ["/ultrarealistic", "Extremely realistic visual output"],
    ["/highangle", "Camera looking down at the subject"], ["/lowangle", "Dramatic camera angle from below"], ["/sideview", "Side-profile perspective"],
    ["/topdown", "Direct top-down camera angle"], ["/droneview", "Aerial drone-style perspective"], ["/aerialview", "High-altitude view from above"]
];

// ---------- "extras" column: small settings with no form field, kept as JSON ----------
// 1.1: extras.kit = { id, name, style } the brand kit look (fonts, sizes, weights) this banner uses
export function parseExtras(text) {
    const extras = { scale: {} };
    try {
        const saved = JSON.parse(text || "{}");
        if (saved.tnc === false) extras.tnc = false;
        if (saved.kit && typeof saved.kit === "object" && saved.kit.style) {
            extras.kit = { id: String(saved.kit.id || ""), name: String(saved.kit.name || "Brand kit").slice(0, 40), style: cleanStyle(saved.kit.style) };
        }
        const pt = saved.patch;
        if (pt && (pt.mode === "off" || pt.mode === "custom")) {
            extras.patch = { mode: pt.mode };
            if (pt.mode === "custom") {
                extras.patch.color = /^#[0-9a-f]{6}$/i.test(pt.color) ? pt.color : "#000000";
                extras.patch.opacity = Math.min(1, Math.max(0, Number(pt.opacity) || 0));
            }
        }
        [1, 2, 3].forEach((n) => {
            const k = Number(saved.scale && saved.scale[n]);
            if (k > 0 && k !== 1) extras.scale[n] = Math.min(1.5, Math.max(0.6, k));
        });
    } catch { /* not JSON: ignore */ }
    return extras;
}
export function serializeExtras(extras) {
    const out = {};
    if (Object.keys(extras.scale || {}).length) out.scale = extras.scale;
    if (extras.tnc === false) out.tnc = false;
    if (extras.patch && extras.patch.mode !== "auto") out.patch = extras.patch;
    if (extras.kit) out.kit = extras.kit;
    return Object.keys(out).length ? JSON.stringify(out) : "";
}

// ---------- Colours ----------
export const hexToRgb = (hex) => {
    const n = parseInt(String(hex).replace("#", ""), 16);
    return [n >> 16, (n >> 8) & 255, n & 255];
};
const mix = (a, b, t) => a.map((v, i) => Math.round(v + (b[i] - v) * t));
function luminance(rgb) {                          // WCAG relative luminance, 0 (black) – 1 (white)
    const [r, g, b] = rgb.map((v) => {
        v /= 255;
        return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
    });
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
function contrast(a, b) {                          // WCAG contrast ratio, 1 – 21
    const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
    return (hi + 0.05) / (lo + 0.05);
}
export function contrastText(hex) {
    const n = parseInt(String(hex).replace("#", ""), 16);
    const lum = (0.299 * (n >> 16) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) / 255;
    return lum > 0.6 ? "#0a0a0a" : "#ffffff";
}

// Theme key -> gradient · "ai:<id>" -> FLUX image (when loaded) · "px:<id>" -> Pixazo image (from the server)
// · image URL / data URL also work
export const isAiKey = (v) => /^(ai|px):/.test(String(v || ""));
export function backgroundCss(value, aiBg) {
    let key = value || "blush";
    if (key.startsWith("px:")) {
        const src = key === aiBg.key && aiBg.dataUrl ? aiBg.dataUrl : aiImageUrl(key);
        return { css: `url("${src}") center / cover no-repeat`, image: src, theme: THEMES.blush };
    }
    if (key.startsWith("ai:")) {
        if (key === aiBg.key && aiBg.dataUrl) return { css: `url("${aiBg.dataUrl}") center / cover no-repeat`, image: aiBg.dataUrl, theme: THEMES.blush };
        key = "blush";                                 // AI image still loading: show a soft theme meanwhile
    } else if (/^(https?:|data:image)/.test(key)) {
        return { css: `url("${key}") center / cover no-repeat`, image: key, theme: THEMES.blush };
    }
    const [a, b] = THEMES[key] || THEMES.blush;
    return { css: `linear-gradient(120deg, ${a} 0%, ${b} 100%)`, image: null, theme: THEMES[key] || THEMES.blush };
}

// Colours behind the text column: [[r,g,b], …]
export async function sampleBackground(imageSrc, theme) {
    if (!imageSrc) {
        const [a, b] = theme.map(hexToRgb);
        return [a, mix(a, b, 0.25), mix(a, b, 0.5)];
    }
    const img = await loadImage(imageSrc, true);
    // Draw the image the same way CSS "center / cover" does, at 1/8 size
    const W = STAGE_W / 8, H = STAGE_H / 8;
    const canvas = document.createElement("canvas");
    canvas.width = W;
    canvas.height = H;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    const s = Math.max(W / img.naturalWidth, H / img.naturalHeight);
    ctx.drawImage(img, (W - img.naturalWidth * s) / 2, (H - img.naturalHeight * s) / 2, img.naturalWidth * s, img.naturalHeight * s);
    // Only the area where the text and button sit
    const w = Math.round(W * 0.44), top = Math.round(H * 0.1), h = Math.round(H * 0.82);
    const px = ctx.getImageData(0, top, w, h).data;
    const samples = [];
    for (let i = 0; i < px.length; i += 4) samples.push([px[i], px[i + 1], px[i + 2]]);
    return samples;
}

const gradientFrom = (rgb, alpha) => {
    const stop = (a, at) => `rgba(${rgb.join(",")},${(alpha * a).toFixed(3)}) ${at}%`;
    return `linear-gradient(90deg, ${stop(1, 0)}, ${stop(1, 44)}, ${stop(0.72, 60)}, ${stop(0.36, 76)}, ${stop(0.1, 90)}, ${stop(0, 100)})`;
};

// Text background: "auto" (only when needed, colour from the background) · "custom" · "off"
// Returns { background, info, auto } where auto = what Auto picked (start point for Custom)
export function computePatch(setting = { mode: "auto" }, samples, data) {
    if (setting.mode === "off") return { background: "none", info: "Off", auto: null };
    if (setting.mode === "custom") return { background: gradientFrom(hexToRgb(setting.color || "#000000"), setting.opacity ?? 0.55), info: "Custom", auto: null };
    if (!samples) return { background: "none", info: "", auto: null };

    const texts = [data.maincolor, data.subtext && data.subcolor, data.offercallout && data.offercolor].filter(Boolean).map(hexToRgb);
    // How readable is the text on the weakest 10% of the area behind it?
    const ratios = samples.map((bg) => Math.min(...texts.map((t) => contrast(t, bg)))).sort((a, b) => a - b);
    const weakest = ratios[Math.floor(ratios.length * 0.1)];
    const alpha = Math.min(1, Math.max(0, (PATCH_TARGET - weakest) / (PATCH_TARGET - 1.5))) * PATCH_MAX;
    if (alpha < 0.04) return { background: "none", info: "Auto · not needed", auto: null };

    // Patch colour = the background's own average colour, pushed dark (light text) or light (dark text)
    const mean = samples.reduce((sum, c) => [sum[0] + c[0], sum[1] + c[1], sum[2] + c[2]], [0, 0, 0]).map((v) => v / samples.length);
    const lightText = luminance(texts[0]) > 0.35;
    const tone = lightText ? mix(mean, [0, 0, 0], 0.72) : mix(mean, [255, 255, 255], 0.82);
    return {
        background: gradientFrom(tone, alpha),
        info: `Auto · ${Math.round(alpha * 100)}%`,
        auto: { color: "#" + tone.map((v) => v.toString(16).padStart(2, "0")).join(""), opacity: Math.round(alpha * 20) / 20 }
    };
}

// "Get up to ₹50 OFF" -> "Get up to <b>₹50 OFF</b>". Write **like this** to choose the bold part yourself.
export function richLine(text) {
    const safe = String(text || "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
    if (/\*\*.+?\*\*/.test(safe)) return safe.replace(/\*\*(.+?)\*\*/g, "<b>$1</b>");
    return safe.replace(/(₹\s?[\d,]+(?:\.\d+)?(?:\s?(?:OFF|Off|off))?|\b\d+(?:\.\d+)?\s?%(?:\s?(?:OFF|Off|off))?|\bFLAT\b|\bFREE\b)/g, "<b>$1</b>");
}

// =====================================================
// PRODUCT IMAGES: load -> remove background -> crop -> rotate wide products
// =====================================================
// Google Drive share links are web pages, not images: convert to a direct image link
function toDirectImageUrl(url) {
    const drive = url.match(/drive\.google\.com\/(?:file\/d\/|open\?id=|uc\?(?:.*&)?id=)([\w-]+)/);
    return drive ? `https://lh3.googleusercontent.com/d/${drive[1]}` : url;
}

// 1. Try the image directly. 2. If the site blocks it (CORS) or the link is a product PAGE, ask Apps Script.
async function loadSafeImage(rawUrl) {
    const url = toDirectImageUrl(rawUrl);
    try { return await loadImage(url, true); } catch { /* fall through to Apps Script */ }
    let res;
    try {
        res = await fetch(`${WEBAPP_URL}?img=${encodeURIComponent(url)}`).then((r) => r.json());
    } catch {
        throw new Error("The image site blocks direct access and the Apps Script helper didn't respond. Paste the new Code.gs and deploy a New version.");
    }
    if (res.dataUrl) return loadImage(res.dataUrl, true);
    if (res.error) throw new Error(res.error);
    throw new Error("Apps Script image helper not found. Paste the new Code.gs, run 'authorize' once, then deploy a New version.");
}

// Flood fill from the edges: only background connected to the border is removed,
// so white parts INSIDE the product (labels, caps) are kept.
function removeBackground(ctx, w, h) {
    const imageData = ctx.getImageData(0, 0, w, h);
    const px = imageData.data;
    const isBg = (i) =>
        px[i + 3] < 20 ||
        (px[i] + px[i + 1] + px[i + 2] > 705 &&
            Math.max(Math.abs(px[i] - px[i + 1]), Math.abs(px[i + 1] - px[i + 2]), Math.abs(px[i] - px[i + 2])) < 25);

    const seen = new Uint8Array(w * h);
    const stack = new Int32Array(w * h);
    let sp = 0;
    const push = (p) => { if (!seen[p] && isBg(p * 4)) { seen[p] = 1; stack[sp++] = p; } };

    for (let x = 0; x < w; x++) { push(x); push((h - 1) * w + x); }
    for (let y = 0; y < h; y++) { push(y * w); push(y * w + w - 1); }

    while (sp) {
        const p = stack[--sp];
        px[p * 4 + 3] = 0;
        const x = p % w;
        if (x > 0) push(p - 1);
        if (x < w - 1) push(p + 1);
        if (p >= w) push(p - w);
        if (p < w * (h - 1)) push(p + w);
    }

    // Soften the light halo on the product edge
    for (let p = w; p < w * (h - 1); p++) {
        if (seen[p]) continue;
        if (seen[p - 1] || seen[p + 1] || seen[p - w] || seen[p + w]) {
            const i = p * 4;
            const bright = (px[i] + px[i + 1] + px[i + 2]) / 3;
            if (bright > 200) px[i + 3] = Math.round(px[i + 3] * (1 - (bright - 200) / 70));
        }
    }
    ctx.putImageData(imageData, 0, 0);
}

function findBounds(ctx, w, h) {
    const px = ctx.getImageData(0, 0, w, h).data;
    let left = w, right = -1, top = h, bottom = -1;
    for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
            if (px[(y * w + x) * 4 + 3] > 20) {
                if (x < left) left = x;
                if (x > right) right = x;
                if (y < top) top = y;
                if (y > bottom) bottom = y;
            }
        }
    }
    return right === -1 ? null : { x: left, y: top, w: right - left + 1, h: bottom - top + 1 };
}

async function makeCutout(url) {
    const img = await loadSafeImage(url);
    // Work at max 1400px: sharp enough for HD export, fast to process
    const s = Math.min(1, 1400 / Math.max(img.naturalWidth, img.naturalHeight));
    const w = Math.round(img.naturalWidth * s);
    const h = Math.round(img.naturalHeight * s);
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(img, 0, 0, w, h);

    removeBackground(ctx, w, h);
    const box = findBounds(ctx, w, h) || { x: 0, y: 0, w, h };

    // Tight crop so the product bottom sits exactly on the ground. Wide products rotate upright.
    const rotate = box.w > box.h * 1.25;
    const out = document.createElement("canvas");
    out.width = rotate ? box.h : box.w;
    out.height = rotate ? box.w : box.h;
    const octx = out.getContext("2d");
    if (rotate) {
        octx.translate(out.width / 2, out.height / 2);
        octx.rotate(Math.PI / 2);
        octx.drawImage(canvas, box.x, box.y, box.w, box.h, -box.w / 2, -box.h / 2, box.w, box.h);
    } else {
        octx.drawImage(canvas, box.x, box.y, box.w, box.h, 0, 0, box.w, box.h);
    }
    return { src: out.toDataURL("image/png"), w: out.width, h: out.height };
}

const cutoutCache = new Map();            // url -> Promise<{src, w, h}>
export function getCutout(url) {
    if (!cutoutCache.has(url)) {
        const job = makeCutout(url);
        job.catch(() => cutoutCache.delete(url));
        cutoutCache.set(url, job);
    }
    return cutoutCache.get(url);
}

// One soft elliptical shadow image, stretched under each product (canvas, because html2canvas can't export CSS blur)
let shadowSprite = "";
export function getShadowSprite() {
    if (shadowSprite) return shadowSprite;
    const canvas = document.createElement("canvas");
    canvas.width = 480;
    canvas.height = 120;
    const ctx = canvas.getContext("2d");
    ctx.translate(240, 60);
    ctx.scale(1, 0.25);
    const g = ctx.createRadialGradient(0, 0, 0, 0, 0, 240);
    const a = (v) => `rgba(0,0,0,${Math.min(1, v * SHADOW_STRENGTH)})`;
    g.addColorStop(0, a(0.6));
    g.addColorStop(0.45, a(0.42));
    g.addColorStop(0.7, a(0.16));
    g.addColorStop(0.88, a(0.04));
    g.addColorStop(1, a(0));
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(0, 0, 240, 0, Math.PI * 2);
    ctx.fill();
    return (shadowSprite = canvas.toDataURL("image/png"));
}

// Products stand side by side (1 · 2 · 3) on the ground line, sized by equal visual area, centred as a group.
// With no product yet, dashed markers (preview only) show where they will stand.
// products = { 1: { src, w, h }, … } · scale = per-product size from pin edits
export function layoutProducts(products, scale = {}) {
    const loaded = [1, 2, 3].filter((n) => products[n]?.src && products[n].w > 0);
    const empty = loaded.length === 0;
    const gap = empty ? 18 : PRODUCT_GAP;

    // 1. Size
    const items = (empty ? [1, 2, 3] : loaded).map((n) => {
        const s = SLOTS[n];
        const ratio = empty ? 0.62 : products[n].w / products[n].h;
        const h = Math.sqrt(s.area / ratio) * PRODUCT_SCALE;
        const w = h * ratio;
        const fit = Math.min(1, s.maxW / w, s.maxH / h) * (empty ? 0.8 : 1);
        const k = empty ? 1 : scale[n] || 1;
        return { n, w: w * fit * k, h: h * fit * k, lift: s.lift };
    });

    // 2. Shrink together if the row is wider than the ground area
    const room = GROUND.right - GROUND.left - gap * (items.length - 1);
    const rowW = items.reduce((sum, b) => sum + b.w, 0);
    const shrink = Math.min(1, room / rowW);
    items.forEach((b) => { b.w *= shrink; b.h *= shrink; });

    // 3. Place left to right, centred in the ground area
    let x = (GROUND.left + GROUND.right) / 2 - (rowW * shrink + gap * (items.length - 1)) / 2;
    const out = {};
    items.forEach((b) => {
        const base = GROUND.base - (items.length > 1 ? b.lift : 0);
        const box = { width: b.w, height: b.h, left: x, top: base - b.h };
        let shadow = null;
        if (!empty) {
            const sw = b.w * 1.3;
            const sh = Math.max(30, b.w * 0.24);
            shadow = { width: sw, height: sh, left: x + b.w / 2 - sw / 2, top: base - sh * 0.52 };
        }
        out[b.n] = { box, shadow };
        x += b.w + gap;
    });
    return { empty, items: out };
}
