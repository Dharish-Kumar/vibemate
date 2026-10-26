// =====================================================
// vibeMate 1.1 · server/routes/history.js
// Guideline banners in MongoDB + one History list for everything you made.
// Everything is deleted automatically 30 days after its last save (MongoDB TTL index).
//
//   GET    /api/history          -> { days, chat: [Create anything chats], studio: [image chats + guideline banners] }
//   GET    /api/banners          -> your guideline banners (newest first)
//   GET    /api/banners/:id      -> one banner with all its fields
//   POST   /api/banners          -> { banner, thumb } -> new banner, returns { id }
//   PUT    /api/banners/:id      -> { banner, thumb } -> saves changes (30 days start again)
//   DELETE /api/banners/:id      -> deletes it
// Chats keep using /api/chats (chats.js); this file only adds their 30-day expiry.
//
// Hook-up in index.js (BEFORE the /api/chats routes):
//   import { setupHistory } from "./routes/history.js";
//   setupHistory(app, getDb);
// =====================================================
import express, { Router } from "express";
import { ObjectId } from "mongodb";
import jwt from "jsonwebtoken";
import { chatKind } from "../chats.js";
import { touchAiImage } from "./ai.js";

export const HISTORY_DAYS = 30;
const DAY = 24 * 60 * 60 * 1000;
const COOKIE = "vm_session";            // the login cookie (auth.js)

// The 13 banner fields (same names as the editor and Code.gs)
const FIELDS = [
    "maintext", "subtext", "offercallout", "buttontext",
    "sku1", "sku2", "sku3",
    "maincolor", "subcolor", "offercolor", "buttoncolor",
    "background", "extras"
];
const MAX_THUMB = 60 * 1024;            // small preview image for History (JPEG data URL)

const expiry = () => new Date(Date.now() + HISTORY_DAYS * DAY);
const daysLeft = (date) => (date ? Math.max(0, Math.ceil((new Date(date).getTime() - Date.now()) / DAY)) : HISTORY_DAYS);
const clip = (v, max) => String(v ?? "").slice(0, max);

// ---------- Who is logged in (reads the same JWT cookie as /api/auth/me) ----------
function readCookie(req, name) {
    for (const part of String(req.headers.cookie || "").split(";")) {
        const i = part.indexOf("=");
        if (i > -1 && part.slice(0, i).trim() === name) return decodeURIComponent(part.slice(i + 1).trim());
    }
    return "";
}
function userIdFrom(req) {
    try {
        const token = req.cookies?.[COOKIE] || readCookie(req, COOKIE);
        const p = jwt.verify(token, process.env.JWT_SECRET);
        return String(p.userId || p.sub || p.id || p._id || "");
    } catch {
        return "";
    }
}
// Chats store the user id as an ObjectId, banners as text: match both
const ownedBy = (id) => ({ userId: { $in: ObjectId.isValid(id) ? [id, new ObjectId(id)] : [id] } });
const byId = (id) => (ObjectId.isValid(id) ? new ObjectId(id) : null);

// ---------- Cleaning what the browser sends ----------
function cleanBanner(input) {
    const b = input && typeof input === "object" ? input : {};
    const out = {};
    // 1.1: extras also keeps the brand kit style, so it may be longer
    FIELDS.forEach((name) => { out[name] = clip(b[name], name === "extras" ? 8000 : 2000).trim(); });
    return out;
}
function cleanThumb(thumb) {
    return typeof thumb === "string" && /^data:image\/(jpeg|png|webp);base64,/.test(thumb) && thumb.length <= MAX_THUMB ? thumb : "";
}
const bannerTitle = (b) => clip(b.maintext || "Untitled banner", 80);

// =====================================================
export function setupHistory(app, db) {
    // db can be the database object, or a function that returns it (sync or async)
    const getDb = typeof db === "function" ? db : () => db;
    const col = async (name) => {
        const d = await getDb();
        if (!d) throw new Error("The database isn't connected yet. Try again in a moment.");
        return d.collection(name);
    };

    // Indexes: auto-delete after expiresAt, fast "my newest first" lists. Old chats get 30 days from today.
    let ready = null;
    const prepare = () => (ready ??= (async () => {
        const banners = await col("banners");
        const chats = await col("chats");
        await banners.createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 });
        await banners.createIndex({ userId: 1, updatedAt: -1 });
        await chats.createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 });
        const filled = await chats.updateMany({ expiresAt: { $exists: false } }, { $set: { expiresAt: expiry() } });
        console.log(`History ready · auto-delete after ${HISTORY_DAYS} days` + (filled.modifiedCount ? ` · ${filled.modifiedCount} old chats given 30 days` : ""));
    })().catch((err) => { ready = null; throw err; }));

    // Set up as soon as the database is connected (the server connects after the routes are added)
    const warmUp = (tries = 0) => Promise.resolve(getDb()).then((d) => {
        if (!d) return tries < 120 && setTimeout(() => warmUp(tries + 1), 1000);
        return prepare().catch((err) => console.error("History setup:", err.message));
    });
    setTimeout(warmUp, 0);

    // Every time a chat is saved through PUT /api/chats/:id, its 30 days start again.
    // (Runs after chats.js has answered, so the chat code itself is untouched.)
    app.use("/api/chats", (req, res, next) => {
        if (req.method === "PUT") {
            const chatId = decodeURIComponent(req.path.replace(/^\/+/, "").split("/")[0] || "");
            res.on("finish", () => {
                if (res.statusCode >= 300 || !chatId) return;
                const userId = userIdFrom(req);
                if (!userId) return;
                col("chats")
                    .then((chats) => chats.updateOne({ chatId, ...ownedBy(userId) }, { $set: { expiresAt: expiry() } }))
                    .catch((err) => console.error("Chat expiry:", err.message));
            });
        }
        next();
    });

    // Login check for the routes below only (never for /api/auth/…)
    const requireUser = async (req, res, next) => {
        const id = userIdFrom(req);
        if (!id) return res.status(401).json({ error: "Please log in again." });
        req.historyUserId = id;
        try { await prepare(); } catch (err) { return res.status(503).json({ error: err.message }); }
        next();
    };
    const json = express.json({ limit: "200kb" });
    const router = Router();

    // ---------- History: Create anything | Image studio ----------
    router.get("/history", requireUser, async (req, res) => {
        const limit = Math.min(200, Math.max(1, Number(req.query.limit) || 100));
        const me = ownedBy(req.historyUserId);
        const [chats, banners] = await Promise.all([col("chats"), col("banners")]);
        const [chatRows, bannerRows] = await Promise.all([
            chats.find(me, { projection: { chatId: 1, title: 1, kind: 1, updated: 1, expiresAt: 1, "messages.image.id": 1, "messages.role": 1 } })
                .sort({ updated: -1 }).limit(limit).toArray(),
            banners.find(me, { projection: { title: 1, thumb: 1, updatedAt: 1, expiresAt: 1 } })
                .sort({ updatedAt: -1 }).limit(limit).toArray()
        ]);
        const time = (d) => (d ? new Date(d).getTime() : 0);
        const chatItems = chatRows.map((c) => {
            const messages = c.messages || [];
            return {
                id: c.chatId,
                kind: chatKind(c),
                title: c.title || "Untitled chat",
                updatedAt: c.updated ? new Date(c.updated) : null,
                images: messages.filter((m) => m && m.image && m.image.id).length,
                messages: messages.filter((m) => m && m.role === "user").length,
                daysLeft: daysLeft(c.expiresAt)
            };
        });
        const bannerItems = bannerRows.map((b) => ({
            id: String(b._id),
            kind: "banner",
            title: b.title,
            thumb: b.thumb || "",
            updatedAt: b.updatedAt,
            daysLeft: daysLeft(b.expiresAt)
        }));
        res.json({
            days: HISTORY_DAYS,
            chat: chatItems.filter((c) => c.kind === "chat"),
            studio: [...chatItems.filter((c) => c.kind === "image"), ...bannerItems].sort((a, b) => time(b.updatedAt) - time(a.updatedAt))
        });
    });

    // ---------- Guideline banners ----------
    router.get("/banners", requireUser, async (req, res) => {
        const banners = await col("banners");
        const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 100));
        const rows = await banners.find(ownedBy(req.historyUserId), { projection: { title: 1, thumb: 1, updatedAt: 1, expiresAt: 1 } })
            .sort({ updatedAt: -1 }).limit(limit).toArray();
        res.json(rows.map((b) => ({ id: String(b._id), kind: "banner", title: b.title, thumb: b.thumb || "", updatedAt: b.updatedAt, daysLeft: daysLeft(b.expiresAt) })));
    });

    router.get("/banners/:id", requireUser, async (req, res) => {
        const _id = byId(req.params.id);
        const b = _id && await (await col("banners")).findOne({ _id, ...ownedBy(req.historyUserId) });
        if (!b) return res.status(404).json({ error: "This banner doesn't exist any more (banners are deleted 30 days after the last save)." });
        res.json({ id: String(b._id), title: b.title, banner: b.banner, thumb: b.thumb || "", updatedAt: b.updatedAt, daysLeft: daysLeft(b.expiresAt) });
    });

    router.post("/banners", requireUser, json, async (req, res) => {
        const banner = cleanBanner(req.body?.banner);
        if (!banner.maintext) return res.status(400).json({ error: "Write the main text first." });
        const now = new Date();
        const doc = { userId: req.historyUserId, title: bannerTitle(banner), banner, thumb: cleanThumb(req.body?.thumb), createdAt: now, updatedAt: now, expiresAt: expiry() };
        const { insertedId } = await (await col("banners")).insertOne(doc);
        touchAiImage(banner.background).catch((err) => console.warn("AI image expiry:", err.message));
        res.status(201).json({ id: String(insertedId), daysLeft: HISTORY_DAYS });
    });

    router.put("/banners/:id", requireUser, json, async (req, res) => {
        const _id = byId(req.params.id);
        const banner = cleanBanner(req.body?.banner);
        if (!banner.maintext) return res.status(400).json({ error: "Add a main text before saving." });
        const set = { banner, title: bannerTitle(banner), updatedAt: new Date(), expiresAt: expiry() };
        const thumb = cleanThumb(req.body?.thumb);
        if (thumb) set.thumb = thumb;
        const result = _id ? await (await col("banners")).updateOne({ _id, ...ownedBy(req.historyUserId) }, { $set: set }) : { matchedCount: 0 };
        if (!result.matchedCount) return res.status(404).json({ error: "This banner doesn't exist any more. Save it again to keep it as a new banner." });
        touchAiImage(banner.background).catch((err) => console.warn("AI image expiry:", err.message));
        res.json({ status: "saved", daysLeft: HISTORY_DAYS });
    });

    router.delete("/banners/:id", requireUser, async (req, res) => {
        const _id = byId(req.params.id);
        const result = _id ? await (await col("banners")).deleteOne({ _id, ...ownedBy(req.historyUserId) }) : { deletedCount: 0 };
        if (!result.deletedCount) return res.status(404).json({ error: "Already deleted." });
        res.json({ status: "deleted" });
    });

    app.use("/api", router);
}
