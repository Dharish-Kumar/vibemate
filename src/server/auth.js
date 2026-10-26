// Sign up · log in · log out · who am I
// Passwords are stored only as bcrypt hashes. The session is a signed token in an httpOnly cookie
// (page scripts can't read it).
import { Router } from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import rateLimit from "express-rate-limit";
import { ObjectId } from "mongodb";
import { users } from "./db.js";

const COOKIE = "vm_session";
const DAYS = 7;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const cookieOptions = () => ({
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",   // https only when live
    maxAge: DAYS * 24 * 60 * 60 * 1000,
    path: "/"
});
const publicUser = (u) => ({ id: String(u._id), name: u.name || "", email: u.email });

function startSession(res, user) {
    const token = jwt.sign({ sub: String(user._id) }, process.env.JWT_SECRET, { expiresIn: `${DAYS}d` });
    res.cookie(COOKIE, token, cookieOptions());
}

// Use on any route that needs a logged-in person: puts the user on req.user
export async function requireAuth(req, res, next) {
    const token = req.cookies?.[COOKIE];
    if (!token) return res.status(401).json({ error: "Please log in." });
    try {
        const { sub } = jwt.verify(token, process.env.JWT_SECRET);
        const user = await users().findOne({ _id: new ObjectId(sub) }, { projection: { passwordHash: 0 } });
        if (!user) throw new Error("no user");
        req.user = user;
        next();
    } catch {
        res.clearCookie(COOKIE, { path: "/" });
        res.status(401).json({ error: "Your session has ended. Please log in again." });
    }
}

// Slows down password guessing: 20 tries per 15 minutes per address
const attempts = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 20,
    standardHeaders: "draft-7",
    legacyHeaders: false,
    message: { error: "Too many attempts. Please wait 15 minutes and try again." }
});

const router = Router();

router.post("/signup", attempts, async (req, res) => {
    const name = String(req.body?.name || "").trim().slice(0, 60);
    const email = String(req.body?.email || "").trim().toLowerCase();
    const password = String(req.body?.password || "");
    if (!name) return res.status(400).json({ error: "Please enter your name." });
    if (!EMAIL.test(email)) return res.status(400).json({ error: "Please enter a valid email address." });
    if (password.length < 8) return res.status(400).json({ error: "Use at least 8 characters for the password." });
    if (password.length > 128) return res.status(400).json({ error: "That password is too long (128 characters max)." });

    const passwordHash = await bcrypt.hash(password, 12);
    let user;
    try {
        const result = await users().insertOne({ name, email, passwordHash, createdAt: new Date(), lastLoginAt: new Date() });
        user = { _id: result.insertedId, name, email };
    } catch (err) {
        if (err.code === 11000) return res.status(409).json({ error: "An account with this email already exists. Log in instead." });
        throw err;
    }
    startSession(res, user);
    res.status(201).json({ user: publicUser(user) });
});

router.post("/login", attempts, async (req, res) => {
    const email = String(req.body?.email || "").trim().toLowerCase();
    const password = String(req.body?.password || "");
    const user = email ? await users().findOne({ email }) : null;
    const ok = user?.passwordHash && (await bcrypt.compare(password, user.passwordHash));
    if (!ok) return res.status(401).json({ error: "Email or password is wrong." });
    await users().updateOne({ _id: user._id }, { $set: { lastLoginAt: new Date() } });
    startSession(res, user);
    res.json({ user: publicUser(user) });
});

router.post("/logout", (req, res) => {
    res.clearCookie(COOKIE, { path: "/" });
    res.json({ ok: true });
});

router.get("/me", requireAuth, (req, res) => res.json({ user: publicUser(req.user) }));

export default router;
