// =====================================================
// vibeMate server  (1.1)
//   /api/auth/*        sign up, log in, log out, who am I
//   /api/chats/*       each person's saved chats: Create anything + Image studio (MongoDB)
//   /api/banners/*     each person's guideline banners (MongoDB)
//   /api/history       everything from the last 30 days (History page, Recent menu)
//   /api/brandkits/*   1.1: brand kits from the Setup page (max 5)
//   /api/ai/*          1.1: guideline banners with a brand kit + model choice (FLUX or Pixazo)
//   /api/gas           private link to Apps Script for the AI (logged-in people only)
// When the React app is built (npm run build in the main folder), this also serves it, so one server runs everything.
// =====================================================
import "dotenv/config";
import express from "express";
import cookieParser from "cookie-parser";
import { existsSync } from "node:fs";
import path from "node:path";
import { connectDb, getDb } from "./db.js";
import authRoutes, { requireAuth } from "./auth.js";
import chatRoutes from "./chats.js";
import appsScriptRoutes from "./appsScript.js";
import brandKitRoutes from "./routes/brandKits.js";
import aiRoutes from "./routes/ai.js";
import { setupHistory } from "./routes/history.js";
import { pixazoKey } from "./imageModels.js";

const missing = ["MONGODB_URI", "JWT_SECRET", "APPS_SCRIPT_URL"].filter((k) => !process.env[k] || /paste[-_]|<db_password>|:PASSWORD@/i.test(process.env[k]));
if (missing.length) {
    console.error(`Fill in ${missing.join(", ")} in server/.env (see server/.env.example), then start again.`);
    process.exit(1);
}

const app = express();
app.disable("x-powered-by");
app.set("trust proxy", 1);           // correct visitor address behind Render / Railway
app.use(cookieParser());

app.use("/api/auth", express.json({ limit: "20kb" }), authRoutes);
setupHistory(app, getDb);            // banners + history + 30-day auto-delete (must come before /api/chats)
app.use("/api/chats", requireAuth, express.json({ limit: "4mb" }), chatRoutes);
app.use("/api/brandkits", requireAuth, brandKitRoutes);
app.use("/api/ai", requireAuth, aiRoutes);
app.use("/api/gas", requireAuth, appsScriptRoutes);
app.use("/api", (req, res) => res.status(404).json({ error: "Not found." }));

// The built React app (dist/ in the main folder), if it exists. Works with the server in server/ or in src/server/.
const dist = [path.resolve(import.meta.dirname, "../dist"), path.resolve(import.meta.dirname, "../../dist")].find((d) => existsSync(path.join(d, "index.html")));
if (dist) app.use(express.static(dist));

app.use((err, req, res, next) => {
    console.error(err);
    if (res.headersSent) return next(err);
    res.status(err.status || 500).json({ error: err.type === "entity.too.large" ? "That's too big to send." : "Something went wrong on the server." });
});

const port = Number(process.env.PORT) || 4000;
connectDb()
    .then(() => app.listen(port, () => {
        console.log(`vibeMate 1.1 server on http://localhost:${port}` + (dist ? " · serving the built app" : ""));
        console.log(pixazoKey() ? "Pixazo: key found, Pixazo models are on." : "Pixazo: no PIXAZO_API_KEY in server/.env, only FLUX · Cloudflare is available.");
    }))
    .catch((err) => {
        console.error("Couldn't connect to MongoDB:", err.message);
        console.error("Check MONGODB_URI in server/.env and Network Access in Atlas.");
        process.exit(1);
    });
