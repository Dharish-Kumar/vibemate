// =====================================================
// vibeMate 3.2 · server/chats.js
// Saved chats, one document per chat per person:
//   kind "chat"  = Create anything (the AI assistant)
//   kind "image" = Image studio (AI image chat)
// Images are not stored here: messages only keep the Drive image id.
// Chats are deleted automatically 30 days after their last save (see routes/history.js).
// =====================================================
import { Router } from "express";
import { chats } from "./db.js";

const MAX_CHATS = 60;          // per person, both kinds together
const MAX_MESSAGES = 200;
const ID = /^[a-z0-9]{4,40}$/i;

// Chats saved before 3.2 have no kind: a chat with images was an image chat
export function chatKind(c) {
    if (c && (c.kind === "chat" || c.kind === "image")) return c.kind;
    return (c?.messages || []).some((m) => m && m.image && m.image.id) ? "image" : "chat";
}

const router = Router();

// All of my chats, newest first
router.get("/", async (req, res) => {
    const list = await chats()
        .find({ userId: req.user._id }, { projection: { _id: 0, userId: 0, expiresAt: 0 } })
        .sort({ updated: -1 })
        .limit(MAX_CHATS)
        .toArray();
    res.json({ chats: list.map(({ chatId, ...c }) => ({ id: chatId, ...c, kind: chatKind(c) })) });
});

// Create or replace one chat
router.put("/:id", async (req, res) => {
    const id = String(req.params.id);
    if (!ID.test(id)) return res.status(400).json({ error: "Bad chat id." });
    const c = req.body || {};
    if (!Array.isArray(c.messages)) return res.status(400).json({ error: "Chat has no messages." });
    await chats().updateOne(
        { userId: req.user._id, chatId: id },
        {
            $set: {
                title: String(c.title || "New chat").slice(0, 80),
                kind: chatKind(c),
                updated: Number(c.updated) || Date.now(),
                messages: c.messages.slice(-MAX_MESSAGES)
            }
        },
        { upsert: true }
    );
    res.json({ ok: true });
});

router.delete("/:id", async (req, res) => {
    await chats().deleteOne({ userId: req.user._id, chatId: String(req.params.id) });
    res.json({ ok: true });
});

export default router;
