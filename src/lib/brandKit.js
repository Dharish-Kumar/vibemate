// =====================================================
// vibeMate 1.1 · lib/brandKit.js
// Brand kits (Setup page): sample images, voice of tone, fonts and sizes, banner defaults.
// Plain JavaScript with no browser APIs: the server (src/server) imports this file too,
// so the browser and the server always clean a kit the same way.
// =====================================================
export const MAX_KITS = 5;                 // per account (or per team, see BRANDKIT_SCOPE in server/.env)
export const MAX_KIT_SAMPLES = 3;
export const MAX_SAMPLE_CHARS = 260000;    // one sample image as a JPEG data URL (~190 KB), the browser shrinks it to 508 px

// ---------- Voice of tone ----------
// "words" goes into the prompt that writes the headline, offer and button.
export const TONES = [
    { id: "friendly",     label: "Friendly",     words: "warm, simple and helpful, like a neighbour recommending something good" },
    { id: "professional", label: "Professional", words: "clear, confident and trustworthy; short sentences, no slang" },
    { id: "bold",         label: "Bold",         words: "punchy and energetic; strong verbs and a clear promise backed by the offer" },
    { id: "playful",      label: "Playful",      words: "light-hearted and fun, with a little wordplay" },
    { id: "premium",      label: "Premium",      words: "elegant, understated and refined; fewer words, quality first" },
    { id: "festive",      label: "Festive",      words: "celebratory and warm, made for festivals and gifting" }
];
export const LANGUAGES = [
    { id: "english",  label: "English" },
    { id: "hinglish", label: "Hinglish (English + Hindi words)" }
];

// ---------- Fonts (Google Fonts; weights = the ones each family really has) ----------
const W = (from, to) => [100, 200, 300, 400, 500, 600, 700, 800, 900].filter((w) => w >= from && w <= to);
export const FONTS = [
    { family: "Anton",            weights: [400],       kind: "Display" },
    { family: "Bebas Neue",       weights: [400],       kind: "Display" },
    { family: "Archivo Black",    weights: [400],       kind: "Display" },
    { family: "Oswald",           weights: W(300, 700), kind: "Display" },
    { family: "Teko",             weights: W(300, 700), kind: "Display" },
    { family: "Playfair Display", weights: W(400, 900), kind: "Serif" },
    { family: "Merriweather",     weights: [300, 400, 700, 900], kind: "Serif" },
    { family: "Lora",             weights: W(400, 700), kind: "Serif" },
    { family: "Rubik",            weights: W(300, 900), kind: "Sans" },
    { family: "Poppins",          weights: W(300, 900), kind: "Sans" },
    { family: "Montserrat",       weights: W(300, 900), kind: "Sans" },
    { family: "Inter",            weights: W(300, 900), kind: "Sans" },
    { family: "DM Sans",          weights: W(300, 900), kind: "Sans" },
    { family: "Work Sans",        weights: W(300, 900), kind: "Sans" },
    { family: "Nunito",           weights: W(300, 900), kind: "Sans" },
    { family: "Barlow",           weights: W(300, 900), kind: "Sans" },
    { family: "Roboto",           weights: [300, 400, 500, 700, 900], kind: "Sans" },
    { family: "Open Sans",        weights: W(300, 800), kind: "Sans" },
    { family: "Lato",             weights: [300, 400, 700, 900], kind: "Sans" },
    { family: "Fredoka",          weights: W(300, 700), kind: "Rounded" },
    { family: "Baloo 2",          weights: W(400, 800), kind: "Rounded" },
    { family: "Mukta",            weights: W(300, 800), kind: "Sans + Devanagari" },
    { family: "Hind",             weights: W(300, 700), kind: "Sans + Devanagari" },
    { family: "Noto Sans",        weights: W(300, 900), kind: "Sans + many scripts" }
];
export const fontByFamily = (family) => FONTS.find((f) => f.family === family) || null;
const FALLBACK = { Display: "Impact, sans-serif", Serif: "Georgia, serif" };
export const fontStack = (family) => {
    const f = fontByFamily(family);
    return `"${f ? f.family : "Rubik"}", ${FALLBACK[f?.kind] || "system-ui, sans-serif"}`;
};
// One stylesheet link for the families a kit uses
export function googleFontsUrl(families) {
    const list = [...new Set(families)].map(fontByFamily).filter(Boolean);
    if (!list.length) return "";
    const parts = list.map((f) => `family=${f.family.replace(/ /g, "+")}` + (f.weights.length > 1 ? `:wght@${f.weights.join(";")}` : ""));
    return `https://fonts.googleapis.com/css2?${parts.join("&")}&display=swap`;
}

// ---------- Sizes and shapes ----------
export const SIZE_LIMITS = {
    heading: { min: 56, max: 130 },   // largest size; long headlines still shrink to fit
    sub:     { min: 20, max: 48 },
    offer:   { min: 20, max: 48 },
    button:  { min: 28, max: 60 }
};
export const BUTTON_SHAPES = [
    { id: "pill",    label: "Pill",    radius: 999 },
    { id: "rounded", label: "Rounded", radius: 18 },
    { id: "square",  label: "Square",  radius: 0 }
];
export const BACKGROUND_THEMES = ["blush", "peach", "sand", "mint", "sky", "lilac"];

// The vibeMate 1.0 look: a kit starts from here, and banners without a kit use it
export const DEFAULT_STYLE = {
    heading: { font: "Anton", size: 96, weight: 400, color: "#1a1a1a", uppercase: false, lineHeight: 1.08 },
    sub:     { font: "Rubik", size: 32, weight: 400, color: "#1a1a1a" },
    offer:   { font: "Rubik", size: 32, weight: 400, color: "#1a1a1a" },
    button:  { font: "Rubik", size: 46, weight: 600, bg: "#000000", color: "auto", shape: "pill" }
};
export const DEFAULT_KIT = {
    name: "My brand",
    tone: { preset: "friendly", language: "english", notes: "", audience: "", avoid: "" },
    samples: [],
    typography: DEFAULT_STYLE,
    defaults: { model: "", background: "blush", bgStyle: "", buttontext: "Shop now", tnc: true, patch: "auto", useColors: true }
};

// ---------- Cleaning (the same rules in the browser and on the server) ----------
const str = (v, max) => String(v ?? "").replace(/\s+/g, " ").trim().slice(0, max);
const hex = (v, fallback) => (/^#[0-9a-f]{6}$/i.test(String(v)) ? String(v).toLowerCase() : fallback);
const num = (v, min, max, fallback) => {
    const n = Number(v);
    return Number.isFinite(n) ? Math.min(max, Math.max(min, Math.round(n))) : fallback;
};
const pick = (v, list, fallback) => (list.includes(v) ? v : fallback);

function cleanText(input, base, limits) {
    const t = input && typeof input === "object" ? input : {};
    const font = fontByFamily(t.font) ? t.font : base.font;
    const weights = fontByFamily(font).weights;
    const wanted = Number(t.weight) || base.weight;
    const weight = weights.includes(wanted) ? wanted : weights.reduce((a, b) => (Math.abs(b - wanted) < Math.abs(a - wanted) ? b : a));
    return { font, weight, size: num(t.size, limits.min, limits.max, base.size), color: hex(t.color, base.color) };
}

export function cleanStyle(input) {
    const s = input && typeof input === "object" ? input : {};
    const d = DEFAULT_STYLE;
    const heading = cleanText(s.heading, d.heading, SIZE_LIMITS.heading);
    heading.uppercase = Boolean(s.heading?.uppercase);
    heading.lineHeight = Math.min(1.5, Math.max(0.85, Number(s.heading?.lineHeight) || d.heading.lineHeight));
    const button = cleanText(s.button, d.button, SIZE_LIMITS.button);
    button.bg = hex(s.button?.bg, d.button.bg);
    button.color = s.button?.color === "auto" ? "auto" : hex(s.button?.color, "auto");
    button.shape = pick(s.button?.shape, BUTTON_SHAPES.map((b) => b.id), d.button.shape);
    return {
        heading,
        sub: cleanText(s.sub, d.sub, SIZE_LIMITS.sub),
        offer: cleanText(s.offer, d.offer, SIZE_LIMITS.offer),
        button
    };
}

// samples are checked here only for shape; the server also checks their size
export function normalizeKit(input) {
    const k = input && typeof input === "object" ? input : {};
    const tone = k.tone && typeof k.tone === "object" ? k.tone : {};
    const def = k.defaults && typeof k.defaults === "object" ? k.defaults : {};
    return {
        name: str(k.name, 40) || DEFAULT_KIT.name,
        tone: {
            preset: pick(tone.preset, TONES.map((t) => t.id), DEFAULT_KIT.tone.preset),
            language: pick(tone.language, LANGUAGES.map((l) => l.id), "english"),
            notes: str(tone.notes, 400),
            audience: str(tone.audience, 160),
            avoid: str(tone.avoid, 200)
        },
        samples: [].concat(k.samples || [])
            .filter((s) => typeof s === "string" && /^data:image\/(jpeg|png|webp);base64,/.test(s) && s.length <= MAX_SAMPLE_CHARS)
            .slice(0, MAX_KIT_SAMPLES),
        typography: cleanStyle(k.typography),
        defaults: {
            model: str(def.model, 60),
            background: pick(def.background, BACKGROUND_THEMES, "blush"),
            bgStyle: str(def.bgStyle, 300),
            buttontext: str(def.buttontext, 18) || "Shop now",
            tnc: def.tnc !== false,
            patch: def.patch === "off" ? "off" : "auto",
            useColors: def.useColors !== false
        }
    };
}

// ---------- What a kit adds to the AI prompts ----------
export function toneText(kit) {
    if (!kit) return "";
    const t = kit.tone || {};
    const tone = TONES.find((x) => x.id === t.preset);
    return [
        tone && `Brand voice: ${tone.words}.`,
        t.notes && `Voice notes: ${t.notes}.`,
        t.audience && `Audience: ${t.audience}.`,
        t.avoid && `Never use these words or ideas: ${t.avoid}.`,
        t.language === "hinglish" && "Write in Hinglish: simple English mixed with a few common Hindi words, in Latin letters."
    ].filter(Boolean).join(" ");
}
export const backgroundStyleText = (kit) => (kit?.defaults?.bgStyle ? `Brand background style: ${kit.defaults.bgStyle}.` : "");

// The part of a kit a banner keeps with it (in its "extras"), so a later kit change never alters an old banner
export const kitSnapshot = (kit, id) => (kit ? { id: String(id || kit.id || ""), name: kit.name, style: cleanStyle(kit.typography) } : null);
