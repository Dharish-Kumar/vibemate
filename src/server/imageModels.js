// =====================================================
// vibeMate 1.1 · server/imageModels.js
// The image models the guideline banner can use (the dropdown in "New guideline banner" and in the editor).
//
//   cf-flux             FLUX on Cloudflare through Apps Script (the 1.0 model). Also writes the text.
//   pixazo-*            Pixazo API (https://api-console.pixazo.ai). One key: PIXAZO_API_KEY in server/.env.
//
// "free" = listed as Free on https://www.pixazo.ai/api/pricing-plan (checked October 2026).
// Paid models are only shown when you name them in PIXAZO_MODELS (server/.env), for example:
//   PIXAZO_MODELS=pixazo-flux-schnell,pixazo-sdxl,pixazo-flux-2-klein
// To add a model: add one entry below (endpoint + how to build its request body).
// =====================================================

const NEGATIVE = "text, letters, words, numbers, watermark, logo, signature, people, hands, faces, products, bottles, jars, boxes, packaging, clutter, blurry, low quality, distorted";

export const MODELS = [
    {
        id: "cf-flux",
        label: "FLUX · Cloudflare",
        provider: "apps-script",
        free: true,
        note: "The 1.0 model. Uses your sample images as a style guide."
    },
    {
        id: "pixazo-flux-schnell",
        label: "Flux Schnell · Pixazo",
        provider: "pixazo",
        free: true,
        note: "Fast and sharp. Text prompt only.",
        endpoint: "/flux-1-schnell/v1/getData",
        body: ({ prompt, seed }) => ({ prompt, num_steps: 4, seed, width: 1360, height: 800 })
    },
    {
        id: "pixazo-sdxl",
        label: "SDXL · Pixazo",
        provider: "pixazo",
        free: true,
        note: "Rich, photographic backgrounds. Text prompt only.",
        endpoint: "/getImage/v1/getSDXLImage",
        body: ({ prompt, seed }) => ({ prompt, negative_prompt: NEGATIVE, width: 1344, height: 768, num_steps: 20, guidance_scale: 5, seed })
    },
    {
        id: "pixazo-sdxl-lightning",
        label: "SDXL Lightning · Pixazo",
        provider: "pixazo",
        free: true,
        note: "The quickest SDXL. Text prompt only.",
        endpoint: "/sdxl_lightning/getImage/v1/getSDXLImage",
        body: ({ prompt, seed }) => ({ prompt, negative_prompt: NEGATIVE, width: 1344, height: 768, num_steps: 8, guidance_scale: 1.5, seed })
    },
    // ----- Paid (about ₹0.06–₹0.80 per image). Shown only when listed in PIXAZO_MODELS. -----
    {
        id: "pixazo-flux-2-klein",
        label: "Flux 2 Klein · Pixazo",
        provider: "pixazo",
        free: false,
        note: "Paid, very low cost. Better detail than Schnell.",
        endpoint: "/flux-2-klein-4b/v1/generateImage",
        body: ({ prompt, seed }) => ({ prompt, width: 1360, height: 800, seed })
    },
    {
        id: "pixazo-flux-3-klein",
        label: "FLUX 3 Klein · Pixazo",
        provider: "pixazo",
        free: false,
        note: "Paid. Newest FLUX, best quality.",
        endpoint: "/flux-3-klein/v1/text-to-image",
        body: ({ prompt, seed }) => ({ prompt, aspect_ratio: "16:9", resolution: "1k", seed })
    }
];

const FREE_PIXAZO = MODELS.filter((m) => m.provider === "pixazo" && m.free).map((m) => m.id);

function enabledIds() {
    const listed = String(process.env.PIXAZO_MODELS || "").split(",").map((s) => s.trim()).filter(Boolean);
    return new Set(["cf-flux", ...(listed.length ? listed : FREE_PIXAZO)]);
}

export const findModel = (id) => MODELS.find((m) => m.id === id && enabledIds().has(m.id)) || null;
export const pixazoKey = () => String(process.env.PIXAZO_API_KEY || "").trim();

export function defaultModelId() {
    const wanted = String(process.env.IMAGE_MODEL_DEFAULT || "").trim();
    const m = findModel(wanted);
    if (m && (m.provider !== "pixazo" || pixazoKey())) return m.id;
    return "cf-flux";
}

// What the browser sees: no endpoints, just names and whether each one can be used right now
export function publicModels() {
    const ids = enabledIds();
    const hasKey = Boolean(pixazoKey());
    return MODELS.filter((m) => ids.has(m.id)).map((m) => ({
        id: m.id,
        label: m.label,
        provider: m.provider,
        free: m.free,
        note: m.note,
        usesSamples: m.provider === "apps-script",
        available: m.provider !== "pixazo" || hasKey,
        reason: m.provider === "pixazo" && !hasKey ? "Add PIXAZO_API_KEY to server/.env to use Pixazo models." : ""
    }));
}
