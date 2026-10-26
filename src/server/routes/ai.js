// =====================================================
// vibeMate 1.1 · server/routes/ai.js
// Guideline banners with a brand kit and a choice of image model.
//
//   GET  /api/ai/models        -> { models: [...], default }        (the model dropdown)
//   POST /api/ai/banner        -> a whole new guideline banner       (New guideline banner pop-up)
//   POST /api/ai/background    -> a new AI background                (editor, Manual tab)
//   GET  /api/ai/images/:id    -> a background made with Pixazo      ("px:<id>" in a banner)
//
// How a banner is made:
//   FLUX · Cloudflare  -> Apps Script generateBanner (text + colours + background), as in 1.0
//   Pixazo, fill in fields -> your text as typed + Pixazo paints the background
//                             (if Pixazo fails, FLUX paints it instead and you get a note)
//   Pixazo, write a prompt -> Apps Script writes the text while Pixazo paints the background, at the same time
// Then the brand kit is applied: colours, button text, T&C, text background, fonts and sizes (kept in the banner's extras).
// =====================================================
import express, { Router } from "express";
import { Binary, ObjectId } from "mongodb";
import { aiImages } from "../db.js";
import { callAppsScript, perPerson } from "../appsScript.js";
import { findKit } from "./brandKits.js";
import { defaultModelId, findModel, publicModels } from "../imageModels.js";
import { pixazoGenerate } from "../pixazo.js";
import { backgroundStyleText, kitSnapshot, toneText } from "../../lib/brandKit.js";
import { TAGS } from "../../lib/tags.js";

const DAY = 24 * 60 * 60 * 1000;
const IMAGE_DAYS = 31;                  // one day longer than a banner, renewed on every banner save
const clip = (v, max) => String(v ?? "").trim().slice(0, max);
const isLink = (s) => /^https?:\/\/\S+$/i.test(s);
const isDataImage = (s) => typeof s === "string" && /^data:image\/(png|jpeg|webp);base64,/.test(s) && s.length < 700000;

// ---------- Pixazo images in MongoDB ----------
async function saveImage(req, { buffer, type }, meta) {
    const now = new Date();
    const { insertedId } = await aiImages().insertOne({
        userId: String(req.user._id), type, data: new Binary(buffer), bytes: buffer.length,
        model: meta.model, prompt: clip(meta.prompt, 2000), createdAt: now, expiresAt: new Date(now.getTime() + IMAGE_DAYS * DAY)
    });
    return { id: String(insertedId), dataUrl: `data:${type};base64,${buffer.toString("base64")}` };
}

// Called by routes/history.js whenever a banner is saved: its Pixazo background stays as long as the banner
export async function touchAiImage(background) {
    const m = /^px:([0-9a-f]{24})$/i.exec(String(background || ""));
    if (!m) return;
    await aiImages().updateOne({ _id: new ObjectId(m[1]) }, { $set: { expiresAt: new Date(Date.now() + IMAGE_DAYS * DAY) } });
}

// ---------- Prompt for a Pixazo background ----------
const JUNK = new Set(["jpg", "jpeg", "png", "webp", "image", "images", "img", "media", "uploads", "product", "products", "large", "small", "medium", "thumb", "default", "photo", "pic", "file", "upload", "hd", "new"]);
// "…/40019360_9-kissan-fresh-tomato-ketchup.jpg" -> "kissan fresh tomato ketchup"
export function productHint(url) {
    try {
        const last = decodeURIComponent(new URL(url).pathname.split("/").filter(Boolean).pop() || "");
        const words = last.replace(/\.[a-z0-9]{2,5}$/i, "").split(/[^a-z]+/i).map((w) => w.toLowerCase()).filter((w) => w.length > 2 && !JUNK.has(w));
        return words.slice(0, 6).join(" ");
    } catch { return ""; }
}
const tagWords = (tags) => String(tags || "").split(/\s+/).map((t) => TAGS.find((x) => "/" + x.id === t.toLowerCase())?.desc).filter(Boolean);
const ownWords = (tags) => String(tags || "").split(/\s+/).filter((t) => t && !t.startsWith("/")).join(" ");

export function backgroundPrompt({ scene, products, tags, kit }) {
    const names = products.map(productHint).filter(Boolean);
    const look = [...tagWords(tags), ownWords(tags)].filter(Boolean);
    const angled = String(tags || "").split(/\s+/).some((t) => TAGS.find((x) => "/" + x.id === t.toLowerCase())?.group === "angle");
    return [
        "Photorealistic background photo for a wide e-commerce advertising banner, landscape format.",
        `Scene: ${clip(scene, 600) || (names.length ? "a setting that suits the products" : "a soft, clean pastel studio set")}.`,
        names.length && `Products that will be placed on it later: ${names.join(", ")}. Choose props, colours and setting that suit them, but do not show the products themselves.`,
        `Composition: the left half is calm, softly lit and uncluttered, with lots of empty space for a headline. The lower right has a clean tabletop or floor surface${angled ? "" : " at eye level"}, where products will stand.`,
        backgroundStyleText(kit),
        look.length && `Look: ${look.join(", ")}.`,
        "Soft natural light, gentle depth of field, high detail.",
        "No text, no letters, no numbers, no logos, no people, no hands, no products, no packaging."
    ].filter(Boolean).join(" ");
}

// ---------- Brand kit -> banner ----------
function parseExtras(text) { try { const v = JSON.parse(text || "{}"); return v && typeof v === "object" ? v : {}; } catch { return {}; } }

export function applyKit(banner, kit) {
    const b = { ...banner };
    const extras = parseExtras(b.extras);
    if (kit) {
        const s = kit.typography;
        if (kit.defaults.useColors) {
            b.maincolor = s.heading.color;
            b.subcolor = s.sub.color;
            b.offercolor = s.offer.color;
            b.buttoncolor = s.button.bg;
        }
        if (!String(b.buttontext || "").trim()) b.buttontext = kit.defaults.buttontext;
        if (!b.background) b.background = kit.defaults.background;
        if (kit.defaults.tnc === false) extras.tnc = false;
        if (kit.defaults.patch === "off" && !extras.patch) extras.patch = { mode: "off" };
        extras.kit = kitSnapshot(kit);
    }
    b.extras = Object.keys(extras).length ? JSON.stringify(extras) : "";
    return b;
}

const kitSamples = (body, kit) => {
    const own = [].concat(body.samples || []).filter(isDataImage).slice(0, 3);
    return own.length ? own : (kit?.samples || []);
};
const skuList = (skus = {}) => ["sku1", "sku2", "sku3"].map((k) => clip(skus[k], 2000)).map((s) => (isLink(s) ? s : ""));

const router = Router();

router.get("/models", (req, res) => res.json({ models: publicModels(), default: defaultModelId() }));

// ---------- New guideline banner ----------
router.post("/banner", perPerson, express.json({ limit: "6mb" }), async (req, res) => {
    const body = req.body || {};
    const kit = body.kitId === "none" ? null : await findKit(req, body.kitId);
    const model = findModel(body.model) || findModel(kit?.defaults?.model) || findModel(defaultModelId());
    const [sku1, sku2, sku3] = skuList(body.skus);
    const skus = { sku1, sku2, sku3 };
    const tags = clip(body.tags, 300);
    const tone = toneText(kit);
    const bgStyle = backgroundStyleText(kit);

    const given = body.fields && typeof body.fields === "object" ? {
        maintext: clip(body.fields.maintext, 60),
        subtext: clip(body.fields.subtext, 50),
        offercallout: clip(body.fields.offercallout, 40),
        buttontext: clip(body.fields.buttontext, 18) || kit?.defaults?.buttontext || "Shop now"
    } : null;
    const idea = clip(body.prompt, 600);
    const brief = clip(body.prompt, 1500);
    if (given && !given.maintext) return res.status(400).json({ error: "Write the main text first." });
    if (!given && !brief && !sku1 && !sku2 && !sku3) return res.status(400).json({ error: "Describe the banner, or add at least one product link." });

    // Apps Script keeps 1500 characters of the prompt: the brief comes first, then the brand notes
    const withKit = (text, extra) => {
        const add = extra.filter(Boolean).join(" ");
        if (!add) return text;
        return (text.slice(0, Math.max(0, 1480 - add.length)) + "\n\n" + add).trim();
    };
    const scriptBanner = () => callAppsScript({
        action: "generateBanner",
        prompt: given ? withKit(idea, [bgStyle]) : withKit(brief, [tone, bgStyle]),
        ...(given ? { fields: given } : {}),
        skus,
        samples: kitSamples(body, kit),
        tags
    }).then((data) => {
        if (!data?.banner) throw new Error(data?.error || "No banner came back. Paste Code.gs v9.0 into Apps Script and deploy a New version.");
        return data;
    });

    try {
        if (model.provider === "apps-script") {
            const data = await scriptBanner();
            return res.json({ banner: applyKit(data.banner, kit), dataUrl: data.dataUrl || "", warning: data.warning || "", model: model.label, kit: kit?.name || "" });
        }

        const prompt = backgroundPrompt({ scene: given ? idea : brief, products: [sku2, sku1, sku3].filter(Boolean), tags, kit });
        const paint = pixazoGenerate(model, { prompt }).then((img) => saveImage(req, img, { model: model.id, prompt }));

        if (given) {
            try {
                const img = await paint;
                const banner = {
                    ...given, ...skus,
                    maincolor: "#1a1a1a", subcolor: "#1a1a1a", offercolor: "#1a1a1a", buttoncolor: "#000000",
                    background: "px:" + img.id, extras: ""
                };
                return res.json({ banner: applyKit(banner, kit), dataUrl: img.dataUrl, warning: "", model: model.label, kit: kit?.name || "" });
            } catch (err) {
                console.warn(`Pixazo (${model.id}) failed, using FLUX:`, err.message);
                const data = await scriptBanner();
                return res.json({
                    banner: applyKit(data.banner, kit), dataUrl: data.dataUrl || "", model: "FLUX · Cloudflare", kit: kit?.name || "",
                    warning: [`${model.label} didn't work (${err.message}) so FLUX painted the background.`, data.warning].filter(Boolean).join(" ")
                });
            }
        }

        // Prompt mode: the text comes from Apps Script, the background from Pixazo (both at once)
        const [script, painted] = await Promise.allSettled([scriptBanner(), paint]);
        if (script.status === "rejected") throw script.reason;
        const data = script.value;
        if (painted.status === "fulfilled") {
            return res.json({ banner: applyKit({ ...data.banner, background: "px:" + painted.value.id }, kit), dataUrl: painted.value.dataUrl, warning: data.warning || "", model: model.label, kit: kit?.name || "" });
        }
        return res.json({
            banner: applyKit(data.banner, kit), dataUrl: data.dataUrl || "", model: "FLUX · Cloudflare", kit: kit?.name || "",
            warning: [`${model.label} didn't work (${painted.reason?.message}) so FLUX painted the background.`, data.warning].filter(Boolean).join(" ")
        });
    } catch (err) {
        console.error("Guideline banner:", err.message);
        res.status(502).json({ error: err.message || "Couldn't make the banner. Please try again." });
    }
});

// ---------- New AI background (editor) ----------
router.post("/background", perPerson, express.json({ limit: "100kb" }), async (req, res) => {
    const body = req.body || {};
    const kit = await findKit(req, body.kitId);
    const model = findModel(body.model) || findModel(kit?.defaults?.model) || findModel(defaultModelId());
    const products = [].concat(body.products || []).map((s) => clip(s, 2000)).filter(isLink).slice(0, 3);
    const tags = clip(body.tags, 300);
    if (!products.length && !tags) return res.status(400).json({ error: "Add at least one SKU link above, or pick a style tag first." });
    try {
        if (model.provider === "apps-script") {
            const style = kit?.defaults?.bgStyle ? `${tags} ${kit.defaults.bgStyle}`.trim() : tags;
            const data = await callAppsScript({ action: "generateBg", products, tags: style });
            if (!data?.dataUrl) throw new Error(data?.error || "No image came back. Paste Code.gs v9.0 and deploy a New version.");
            return res.json({ key: "ai:" + data.id, dataUrl: data.dataUrl, product: data.product || "", prompt: data.prompt || "", model: model.label });
        }
        const prompt = backgroundPrompt({ scene: "", products, tags, kit });
        const img = await saveImage(req, await pixazoGenerate(model, { prompt }), { model: model.id, prompt });
        res.json({ key: "px:" + img.id, dataUrl: img.dataUrl, product: products.map(productHint).filter(Boolean)[0] || "", prompt, model: model.label });
    } catch (err) {
        console.error("AI background:", err.message);
        res.status(502).json({ error: err.message || "Couldn't make the background. Please try again." });
    }
});

// ---------- A saved Pixazo background ----------
router.get("/images/:id", async (req, res) => {
    const id = String(req.params.id);
    const img = ObjectId.isValid(id) && await aiImages().findOne({ _id: new ObjectId(id), userId: String(req.user._id) });
    if (!img) return res.status(404).json({ error: "This background doesn't exist any more." });
    res.set("Cache-Control", "private, max-age=604800").type(img.type || "image/png").send(Buffer.from(img.data.buffer));
});

export default router;
