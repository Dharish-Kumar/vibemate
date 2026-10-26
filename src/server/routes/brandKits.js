// =====================================================
// vibeMate 1.1 · server/routes/brandKits.js
// Brand kits from the Setup page. Up to 5 (MAX_KITS); one of them is the default.
//
//   GET    /api/brandkits              -> { kits: [...], max: 5, scope }
//   POST   /api/brandkits              -> { kit } -> new kit (refused when 5 exist)
//   PUT    /api/brandkits/:id          -> { kit } -> saves changes
//   POST   /api/brandkits/:id/default  -> makes it the default kit
//   DELETE /api/brandkits/:id
//
// BRANDKIT_SCOPE in server/.env:
//   user (default)  every person has their own 5 kits
//   team            everyone who logs in shares the same 5 kits (and can edit them)
// =====================================================
import express, { Router } from "express";
import { ObjectId } from "mongodb";
import { brandKits } from "../db.js";
import { MAX_KITS, normalizeKit } from "../../lib/brandKit.js";

export const kitScope = () => (String(process.env.BRANDKIT_SCOPE || "user").toLowerCase() === "team" ? "team" : "user");
const owner = (req) => (kitScope() === "team" ? {} : { userId: String(req.user._id) });
const byId = (id) => (ObjectId.isValid(id) ? new ObjectId(id) : null);
const FULL = `You can keep up to ${MAX_KITS} brand kits. Delete one to add a new one.`;

const publicKit = (k) => ({
    id: String(k._id),
    ...normalizeKit(k),
    isDefault: Boolean(k.isDefault),
    updatedAt: k.updatedAt,
    createdAt: k.createdAt
});

// Used by routes/ai.js: the kit asked for, or the default kit, or null
export async function findKit(req, id) {
    const _id = id ? byId(id) : null;
    const col = brandKits();
    const kit = (_id && await col.findOne({ _id, ...owner(req) }))
        || await col.findOne({ ...owner(req), isDefault: true })
        || await col.find(owner(req)).sort({ updatedAt: -1 }).limit(1).next();
    return kit ? publicKit(kit) : null;
}

const router = Router();
router.use(express.json({ limit: "2mb" }));   // up to 3 sample images per kit

router.get("/", async (req, res) => {
    const rows = await brandKits().find(owner(req)).sort({ isDefault: -1, updatedAt: -1 }).limit(MAX_KITS).toArray();
    res.json({ kits: rows.map(publicKit), max: MAX_KITS, scope: kitScope() });
});

router.post("/", async (req, res) => {
    const col = brandKits();
    const count = await col.countDocuments(owner(req));
    if (count >= MAX_KITS) return res.status(409).json({ error: FULL });
    const now = new Date();
    const kit = normalizeKit(req.body?.kit);
    const doc = { ...kit, userId: String(req.user._id), updatedBy: String(req.user._id), isDefault: count === 0, createdAt: now, updatedAt: now };
    const { insertedId } = await col.insertOne(doc);
    // Two saves at the same moment could pass the count check: keep the limit anyway
    if (await col.countDocuments(owner(req)) > MAX_KITS) {
        await col.deleteOne({ _id: insertedId });
        return res.status(409).json({ error: FULL });
    }
    res.status(201).json({ kit: publicKit({ ...doc, _id: insertedId }) });
});

router.put("/:id", async (req, res) => {
    const _id = byId(req.params.id);
    const kit = normalizeKit(req.body?.kit);
    const result = _id
        ? await brandKits().findOneAndUpdate({ _id, ...owner(req) }, { $set: { ...kit, updatedBy: String(req.user._id), updatedAt: new Date() } }, { returnDocument: "after" })
        : null;
    const doc = result && (result.value !== undefined ? result.value : result);   // driver 5 returns { value }, 6 returns the document
    if (!doc) return res.status(404).json({ error: "This brand kit doesn't exist any more." });
    res.json({ kit: publicKit(doc) });
});

router.post("/:id/default", async (req, res) => {
    const _id = byId(req.params.id);
    const col = brandKits();
    if (!_id || !(await col.findOne({ _id, ...owner(req) }))) return res.status(404).json({ error: "This brand kit doesn't exist any more." });
    await col.updateMany({ ...owner(req), isDefault: true }, { $set: { isDefault: false } });
    await col.updateOne({ _id }, { $set: { isDefault: true } });
    res.json({ ok: true });
});

router.delete("/:id", async (req, res) => {
    const _id = byId(req.params.id);
    const col = brandKits();
    const kit = _id && await col.findOne({ _id, ...owner(req) });
    if (!kit) return res.status(404).json({ error: "Already deleted." });
    await col.deleteOne({ _id });
    if (kit.isDefault) {   // the newest remaining kit becomes the default
        const next = await col.find(owner(req)).sort({ updatedAt: -1 }).limit(1).next();
        if (next) await col.updateOne({ _id: next._id }, { $set: { isDefault: true } });
    }
    res.json({ ok: true });
});

export default router;
