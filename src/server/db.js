// MongoDB connection + the collections vibeMate uses
//   users      accounts
//   chats      Create anything + Image studio chats (30-day auto-delete, routes/history.js)
//   banners    guideline banners (30-day auto-delete, routes/history.js)
//   brandkits  1.1: brand kits from the Setup page (max 5)
//   aiimages   1.1: backgrounds made with Pixazo (kept while a banner uses them)
import { MongoClient } from "mongodb";

let db;

export async function connectDb() {
    const client = new MongoClient(process.env.MONGODB_URI);
    await client.connect();
    db = client.db(process.env.DB_NAME || "vibemate");

    // One account per email · fast lookups of a person's chats · brand kits · AI images auto-delete
    const indexes = [
        [users(), { email: 1 }, { unique: true, name: "email_unique" }],
        [chats(), { userId: 1, chatId: 1 }, { unique: true, name: "user_chat_unique" }],
        [chats(), { userId: 1, updated: -1 }, { name: "user_recent" }],
        [brandKits(), { userId: 1, updatedAt: -1 }, { name: "kit_owner_recent" }],
        [aiImages(), { expiresAt: 1 }, { expireAfterSeconds: 0, name: "aiimage_expiry" }],
        [aiImages(), { userId: 1, createdAt: -1 }, { name: "aiimage_owner" }]
    ];
    for (const [col, keys, opts] of indexes) {
        try { await col.createIndex(keys, opts); }
        catch (err) { console.warn(`Index ${opts.name} not created (${err.message}).` + (opts.name === "email_unique" ? ` Check for duplicate emails in "users".` : "")); }
    }
    console.log(`MongoDB connected · database "${db.databaseName}"`);
    return db;
}

export const users = () => db.collection("users");
export const chats = () => db.collection("chats");
export const brandKits = () => db.collection("brandkits");
export const aiImages = () => db.collection("aiimages");
export const getDb = () => db;
