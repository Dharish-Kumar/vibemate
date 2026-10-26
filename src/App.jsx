// =====================================================
// vibeMate 3.2 (React) · App.jsx   Home page
//   Create anything: an AI assistant like ChatGPT / Claude (answers, writing, code with preview)
//   Image studio:    AI image chat (any size, style tags, edit with pins)
//                    + Guideline banners (details in a pop-up -> the editor)
// Everything is saved per person in MongoDB through the vibeMate server.
// =====================================================
import { useCallback, useEffect, useRef, useState } from "react";
import { MIN_CODE_VERSION, WEBAPP_URL, ensureBackend, setBackendVersion } from "./lib/config.js";
import { cacheImage, fetchImage, post, shrinkImage, store, uid } from "./lib/api.js";
import { syncChats } from "./lib/chatsApi.js";
import { listBanners, editLink, fmtWhen } from "./lib/historyApi.js";
import { TAGS, tagById } from "./lib/tags.js";
import { say, useVoice } from "./lib/voice.js";
import { useStateRef } from "./lib/useStateRef.js";
import { Toast, useToast } from "./components/Toast.jsx";
import AppShell, { ICONS } from "./components/AppShell.jsx";
import PromptComposer from "./components/PromptComposer.jsx";
import Thread from "./components/Thread.jsx";
import PinEditor from "./components/PinEditor.jsx";
import BannerDialog from "./components/BannerDialog.jsx";
import Splash from "./components/Splash.jsx";
import {
    ASSISTANT_HISTORY, DOC_TYPES, GREETINGS, HISTORY_SENT, IMAGE_SUGGESTIONS, KEYS, MAX_CHATS, MAX_DOCS, MAX_DOC_CHARS, MAX_FILE_MB,
    MAX_IMAGES, SIZES, SPLASH_MS, SUGGESTIONS, VOICE_CLEAR, VOICE_GO, VOICE_GO_HI, VOICE_HELP, VOICE_MODE, extOf, normaliseSize
} from "./home/constants.jsx";
import { readDoc } from "./home/files.js";

// ---------- Saved chats: per person in MongoDB (images are stored in Drive; only their ids are kept) ----------
function saveChats(chats) {
    const slim = chats.slice(0, MAX_CHATS).map((c) => ({
        ...c,
        // eslint-disable-next-line no-unused-vars
        messages: c.messages.filter((m) => !m.pending).map(({ pending, thumbs, retry, status, ...m }) => m)
    }));
    syncChats(slim);
}

// ---------- Where to start: ?mode=create|image &tab=image|banner &chat=<id> &new=banner ----------
const params = new URLSearchParams(location.search);
const urlMode = params.get("mode") === "guideline" ? "image" : params.get("mode");
const urlTab = params.get("mode") === "guideline" ? "banner" : params.get("tab");
const START = {
    mode: urlMode === "image" || urlMode === "create" ? urlMode : store.get(KEYS.mode, "create") === "image" ? "image" : "create",
    tab: urlTab === "banner" || urlTab === "image" ? urlTab : store.get(KEYS.tab, "image") === "banner" ? "banner" : "image",
    chat: params.get("chat") || "",
    dialog: params.get("new") === "banner"
};
let backendCheckStarted = false;

export default function App({ user, initialChats = [] }) {
    const [toast, showToast] = useToast();

    // ---------- State ----------
    const startChat = initialChats.find((c) => c.id === START.chat) || null;
    const [mode, setModeRaw, modeRef] = useStateRef(startChat ? startChat.kind === "image" ? "image" : "create" : START.mode);
    const [tab, setTabRaw, tabRef] = useStateRef(startChat?.kind === "image" ? "image" : START.tab);
    const [size, setSizeRaw, sizeRef] = useStateRef(normaliseSize(store.get(KEYS.size)) || { ...SIZES[0] });
    const [tags, setTags, tagsRef] = useStateRef([]);
    const [files, setFiles, filesRef] = useStateRef([]);    // { id, kind: "image"|"doc", name, bytes, ext, dataUrl, text, info, status }
    const [chats, setChats, chatsRef] = useStateRef(initialChats);
    const [open, setOpen, openRef] = useStateRef({          // the chat shown in each mode
        create: startChat?.kind === "chat" ? startChat.id : null,
        image: startChat?.kind === "image" ? startChat.id : null
    });
    const [focus, setFocusRaw, focusRef] = useStateRef(null); // { msgId, imageId } = the earlier image being edited
    const [busy, setBusy, busyRef] = useStateRef(false);
    const [drafts, setDrafts, draftsRef] = useStateRef({ create: "", image: "" });
    const [banners, setBanners] = useState(null);           // Image studio · Guideline banners (null = loading)
    const [dialog, setDialog] = useState(START.dialog);     // "New guideline banner" pop-up
    const [booting, setBooting] = useState(true);
    const [status, setStatus] = useState({ state: "checking", text: "Checking connection…", help: "" });
    const [pe, setPe] = useState(null);                     // pin editor: { chatId, msg }
    const voiceTurn = useRef(false);                        // spoken replies only when the request was spoken
    const inputRef = useRef(null);                          // the message box
    const composerApi = useRef(null);                       // closePops() from the composer
    const payloads = useRef(new Map());                     // user message id -> what was sent (for Regenerate)

    const kind = mode === "image" ? "image" : "chat";       // the chat kind this screen shows
    const showsBanners = mode === "image" && tab === "banner";
    const chatId = open[mode];
    const chat = chats.find((c) => c.id === chatId) || null;
    const hasThread = !showsBanners && Boolean(chat?.messages.length);
    const prompt = drafts[mode];
    const setPrompt = (v) => setDrafts((d) => ({ ...d, [modeRef.current]: typeof v === "function" ? v(d[modeRef.current]) : v }));
    const promptRef = { get current() { return draftsRef.current[modeRef.current]; } };
    const currentChat = () => chatsRef.current.find((c) => c.id === openRef.current[modeRef.current]) || null;
    const myChats = chats.filter((c) => c.kind === kind);

    // ---------- Chats ----------
    const updateChats = useCallback((fn, save = false) => {
        setChats((cs) => {
            const next = fn(cs);
            if (save) saveChats(next);
            return next;
        });
    }, [setChats]);
    const patchMsg = useCallback((cid, msgId, patch) => updateChats((cs) => cs.map((c) => c.id !== cid ? c
        : { ...c, messages: c.messages.map((m) => m.id === msgId ? { ...m, ...patch } : m) })), [updateChats]);

    // Keep the address bar in step, so a reload (or a shared link) opens the same screen
    useEffect(() => {
        const q = new URLSearchParams({ mode });
        if (mode === "image") q.set("tab", tab);
        if (chatId && !showsBanners) q.set("chat", chatId);
        history.replaceState(null, "", `${location.pathname}?${q}`);
    }, [mode, tab, chatId, showsBanners]);

    // ---------- Mode / tab ----------
    function setMode(m) {
        if (m === modeRef.current) return;
        setModeRaw(m);
        store.set(KEYS.mode, m);
        setFocusRaw(null);
        trimFiles(m === "image" ? tabRef.current : "create");
        composerApi.current?.closePops();
        setTimeout(() => inputRef.current?.focus(), 30);
    }
    function setTab(t) {
        setTabRaw(t);
        store.set(KEYS.tab, t);
        if (t === "image") setTimeout(() => inputRef.current?.focus(), 30);
    }
    function trimFiles(where) {
        const max = MAX_IMAGES[where] ?? 3;
        const images = filesRef.current.filter((f) => f.kind === "image");
        if (images.length > max) {
            const drop = new Set(images.slice(max).map((f) => f.id));
            setFiles((fs) => fs.filter((f) => !drop.has(f.id)));
        }
    }
    function setSize(s) {
        setSizeRaw(s);
        store.set(KEYS.size, s);
    }

    // Guideline banners (Image studio tab): load when the tab is shown
    const loadBanners = useCallback(() => {
        listBanners(24).then(setBanners).catch((err) => { setBanners([]); showToast(err.message, "error"); });
    }, [showToast]);
    useEffect(() => { if (showsBanners && banners === null) loadBanners(); }, [showsBanners, banners, loadBanners]);

    // ---------- Style tags (Image studio) ----------
    const addTag = useCallback((id, { quiet = false } = {}) => {
        const tag = tagById(id);
        if (!tag || tagsRef.current.includes(id)) return;
        let list = tagsRef.current;
        if (tag.group === "angle") {
            const old = list.find((t) => tagById(t)?.group === "angle");
            if (old) {
                list = list.filter((t) => t !== old);
                if (!quiet) showToast(`One camera angle at a time: /${old} swapped for /${id}.`);
            }
        }
        setTags([...list, id]);
    }, [setTags, showToast, tagsRef]);
    const removeTag = (id) => setTags((ts) => ts.filter((t) => t !== id));
    const toggleTag = (id) => (tagsRef.current.includes(id) ? removeTag(id) : addTag(id));

    // Typed "/4k " (with a space after) in the Image studio: turn known tags into chips. Returns the cleaned text.
    const absorbTypedTags = useCallback((text, final = false) => {
        if (modeRef.current !== "image") return text;
        const pattern = final ? /(^|\s)\/([a-z0-9]+)(?=\s|$)/gi : /(^|\s)\/([a-z0-9]+)(?=\s)/gi;
        let changed = false;
        const next = text.replace(pattern, (all, pre, id) => {
            if (!tagById(id.toLowerCase())) return all;
            addTag(id.toLowerCase(), { quiet: true });
            changed = true;
            return pre;
        });
        return changed ? next.replace(/[ \t]{2,}/g, " ").replace(/^\s+/, "") : text;
    }, [addTag, modeRef]);

    // ---------- Attachments ----------
    async function addFiles(list) {
        for (const file of list) {
            const isImage = /^image\/(png|jpeg|webp)$/.test(file.type);
            const ext = extOf(file.name);
            if (!isImage && !DOC_TYPES[ext]) { showToast(`“${file.name}” isn't supported. Use images, PDF, Word (.docx), TXT, MD, CSV or JSON.`, "error"); continue; }
            if (file.size > MAX_FILE_MB * 1048576) { showToast(`“${file.name}” is over ${MAX_FILE_MB} MB.`, "error"); continue; }
            const kindOfFile = isImage ? "image" : "doc";
            const count = filesRef.current.filter((f) => f.kind === kindOfFile).length;
            const max = kindOfFile === "image" ? MAX_IMAGES[modeRef.current] : MAX_DOCS;
            if (count >= max) { showToast(kindOfFile === "image" ? `Up to ${max} images.` : `Up to ${max} documents.`, "error"); continue; }

            const id = uid();
            setFiles((fs) => [...fs, { id, kind: kindOfFile, name: file.name, bytes: file.size, ext, dataUrl: "", text: "", info: "", status: "reading" }]);
            const patch = {};
            try {
                if (kindOfFile === "image") {
                    const url = URL.createObjectURL(file);
                    try { patch.dataUrl = await shrinkImage(url); } finally { URL.revokeObjectURL(url); }
                } else {
                    const out = await readDoc(file, MAX_DOC_CHARS);
                    const text = out.text.replace(/[ \t]+/g, " ").replace(/\n{3,}/g, "\n\n").trim();
                    if (!text) throw new Error("No readable text found (a scanned PDF?).");
                    patch.text = text.slice(0, MAX_DOC_CHARS);
                    const words = text.split(/\s+/).length;
                    patch.info = [out.info, `${words.toLocaleString()} words`, text.length > MAX_DOC_CHARS ? "first part used" : ""].filter(Boolean).join(" · ");
                }
                patch.status = "ready";
            } catch (err) {
                console.error("Attachment:", err);
                patch.status = "error";
                patch.info = err.message === "not an image" ? "Couldn't read this image" : err.message || "Couldn't read this file";
            }
            setFiles((fs) => fs.map((f) => (f.id === id ? { ...f, ...patch } : f)));
        }
    }
    const removeFile = (id) => setFiles((fs) => fs.filter((f) => f.id !== id));
    const readyFiles = (k) => filesRef.current.filter((f) => f.kind === k && f.status === "ready");

    // ---------- Can we send? (read from refs so voice and Enter see the latest values) ----------
    function canSendNow() {
        if (busyRef.current || filesRef.current.some((f) => f.status === "reading")) return false;
        return Boolean(promptRef.current.trim() || readyFiles("image").length || readyFiles("doc").length
            || (modeRef.current === "image" && tagsRef.current.length));
    }
    const sendDisabled = (() => {
        if (busy || files.some((f) => f.status === "reading")) return true;
        const ready = (k) => files.some((f) => f.kind === k && f.status === "ready");
        return !(prompt.trim() || ready("image") || ready("doc") || (mode === "image" && tags.length));
    })();

    function submit(e, { voice = false } = {}) {
        e?.preventDefault?.();
        if (!canSendNow()) return;
        voiceTurn.current = voice;
        const text = absorbTypedTags(promptRef.current, true);
        composerApi.current?.closePops();
        return modeRef.current === "image" ? sendImage(text.trim()) : sendAssistant(text.trim());
    }

    // A chat for this screen (made on the first message)
    function ensureChat(title, k) {
        let c = currentChat();
        if (!c) {
            c = { id: uid(), kind: k, title: (title || "New chat").replace(/\s+/g, " ").slice(0, 60), updated: Date.now(), messages: [] };
            updateChats((cs) => [c, ...cs]);
            setOpen((o) => ({ ...o, [k === "image" ? "image" : "create"]: c.id }));
        }
        return c;
    }
    const addMessage = (cid, m) => updateChats((cs) => cs.map((x) => (x.id === cid ? { ...x, messages: [...x.messages, m] } : x)));

    // =====================================================
    // CREATE ANYTHING: the AI assistant
    // =====================================================
    function sendAssistant(text) {
        const images = readyFiles("image");
        const docs = readyFiles("doc");
        if (!text && !images.length && !docs.length) return;
        const c = ensureChat(text || docs[0]?.name || "Image question", "chat");
        const userMsg = {
            id: uid(), role: "user", text,
            docs: docs.map((d) => d.name), imageCount: images.length,
            thumbs: images.map((i) => i.dataUrl)            // in memory only (not saved)
        };
        const payload = {
            prompt: text,
            refs: images.map((i) => i.dataUrl),
            docs: docs.map((d) => ({ name: d.name, text: d.text }))
        };
        payloads.current.set(userMsg.id, payload);
        addMessage(c.id, userMsg);
        setPrompt("");
        setFiles([]);
        runAssistant(c.id, payload, userMsg);
    }

    async function runAssistant(cid, payload, userMsg) {
        const reply = { id: uid(), role: "assistant", pending: true, status: "Thinking…" };
        updateChats((cs) => {
            const c = cs.find((x) => x.id === cid);
            if (!c) return cs;
            return [{ ...c, updated: Date.now(), messages: [...c.messages, reply] }, ...cs.filter((x) => x.id !== cid)];
        });
        setBusy(true);
        const steps = ["Thinking…", payload.refs.length ? "Looking at your images…" : payload.docs.length ? "Reading your documents…" : "Thinking…", "Writing the answer…", "Still writing (long answers take a little longer)…"];
        let i = 0;
        const ticker = setInterval(() => { i = Math.min(i + 1, steps.length - 1); patchMsg(cid, reply.id, { status: steps[i] }); }, 5000);

        let done;
        try {
            await ensureBackend();
            const c = chatsRef.current.find((x) => x.id === cid);
            const history = (c ? c.messages : [])
                .filter((m) => !m.pending && !m.error && m.id !== userMsg.id && m.id !== reply.id)
                .slice(-ASSISTANT_HISTORY)
                .map((m) => ({
                    role: m.role,
                    text: m.role === "user"
                        ? [m.text, m.docs?.length ? `(attached: ${m.docs.join(", ")})` : "", m.imageCount ? `(attached ${m.imageCount} image${m.imageCount > 1 ? "s" : ""})` : ""].filter(Boolean).join(" ") || "(attachments only)"
                        : m.text || ""
                }))
                .filter((m) => m.text);
            const res = await post({ action: "assistant", ...payload, history });
            if (res.error) throw new Error(res.error);
            if (!res.reply) throw new Error("No answer came back. Paste Code.gs v9.0 into Apps Script and deploy a New version.");
            done = { pending: false, status: undefined, text: res.reply, warning: res.warning || "" };
            if (voiceTurn.current) say(res.reply.replace(/```[\s\S]*?```/g, " ").replace(/[#*_`>|]/g, "").split(/(?<=[.!?])\s/).slice(0, 2).join(" "));
        } catch (err) {
            console.error("Assistant:", err);
            done = { pending: false, status: undefined, error: err.message || "Something went wrong. Please try again.", retry: { payload, userId: userMsg.id } };
        } finally {
            clearInterval(ticker);
            setBusy(false);
            updateChats((cs) => cs.map((c) => c.id !== cid ? c
                : { ...c, updated: Date.now(), messages: c.messages.map((m) => (m.id === reply.id ? { ...m, ...done } : m)) }), true);
        }
    }

    // "Regenerate": a new answer to the same question (replaces the last answer)
    function regenerate(msgId) {
        const c = currentChat();
        if (!c || busyRef.current) return;
        const i = c.messages.findIndex((m) => m.id === msgId);
        const userMsg = c.messages.slice(0, i).reverse().find((m) => m.role === "user");
        if (!userMsg) return;
        const payload = payloads.current.get(userMsg.id) || { prompt: userMsg.text || "", refs: [], docs: [] };
        updateChats((cs) => cs.map((x) => (x.id === c.id ? { ...x, messages: x.messages.filter((m) => m.id !== msgId) } : x)));
        runAssistant(c.id, payload, userMsg);
    }

    // =====================================================
    // IMAGE STUDIO: AI image chat
    // =====================================================
    function sendImage(text) {
        const images = readyFiles("image");
        const docs = readyFiles("doc");
        const tagList = tagsRef.current;
        if (!text && !images.length && !docs.length && !tagList.length) return;
        const c = ensureChat(text || (tagList.length ? "/" + tagList.join(" /") : "New image"), "image");
        const s = sizeRef.current;
        const sz = { w: s.w, h: s.h, key: s.key };
        const userMsg = {
            id: uid(), role: "user", text, tags: [...tagList], size: sz,
            docs: docs.map((d) => d.name), imageCount: images.length,
            thumbs: images.map((i) => i.dataUrl),            // in memory only (not saved)
            editing: Boolean(focusRef.current)
        };
        const payload = {
            prompt: text,
            tags: tagList.map((t) => "/" + t).join(" "),
            size: { w: sz.w, h: sz.h },
            refs: images.map((i) => i.dataUrl),
            docs: docs.map((d) => ({ name: d.name, text: d.text })),
            focusId: focusRef.current?.imageId || ""
        };
        addMessage(c.id, userMsg);
        setPrompt("");
        setFiles([]);
        setFocusRaw(null);
        runImage(c.id, payload, userMsg);
    }

    async function runImage(cid, payload, userMsg) {
        const reply = { id: uid(), role: "assistant", pending: true, size: userMsg.size, status: "Thinking…" };
        updateChats((cs) => {
            const c = cs.find((x) => x.id === cid);
            if (!c) return cs;
            return [{ ...c, updated: Date.now(), messages: [...c.messages, reply] }, ...cs.filter((x) => x.id !== cid)];
        });
        setBusy(true);

        const steps = ["Thinking…", payload.refs.length ? "Looking at your images…" : payload.docs.length ? "Reading your documents…" : "Planning the image…", "Creating the image…", "Adding the details…", "Almost there…"];
        let i = 0;
        const ticker = setInterval(() => { i = Math.min(i + 1, steps.length - 1); patchMsg(cid, reply.id, { status: steps[i] }); }, 4500);

        let done;
        try {
            await ensureBackend();
            const c = chatsRef.current.find((x) => x.id === cid);
            const msgs = c ? c.messages : [];
            // Which image to build on: the one picked with "Edit this", else the latest image in this chat
            const prior = msgs.filter((m) => m.role === "assistant" && m.image && m.id !== reply.id);
            const baseId = payload.focusId || prior[prior.length - 1]?.image.id || "";
            let prevImage = "";
            if (baseId) {
                try { prevImage = await shrinkImage(await fetchImage(baseId)); } catch { /* not available: carry on without it */ }
            }
            const history = msgs.filter((m) => !m.pending && m.id !== userMsg.id && !m.error).slice(-HISTORY_SENT).map((m) => ({
                role: m.role,
                text: m.role === "user" ? m.text || "(no text)" : [m.text, m.image ? `[made an image: ${m.image.prompt}]` : ""].filter(Boolean).join(" ")
            }));
            const res = await post({ action: "chat", ...payload, history, prevImage, editing: Boolean(payload.focusId) });
            if (res.error) throw new Error(res.error);
            if (!res.reply && !res.image) throw new Error("No answer came back. Paste Code.gs v9.0 into Apps Script and deploy a New version.");

            done = { pending: false, status: undefined, text: res.reply || "", warning: res.warning || "" };
            if (res.image?.id) {
                done.image = { id: res.image.id, w: res.image.width || payload.size.w, h: res.image.height || payload.size.h, prompt: res.image.prompt || "" };
                if (res.image.dataUrl) cacheImage(res.image.id, res.image.dataUrl);
            }
            if (voiceTurn.current) say(res.reply ? res.reply.split(/(?<=[.!?])\s/)[0] : "Here's your image.");
        } catch (err) {
            console.error("Image:", err);
            done = { pending: false, status: undefined, error: err.message || "Something went wrong. Please try again.", retry: { payload, userId: userMsg.id } };
        } finally {
            clearInterval(ticker);
            setBusy(false);
            updateChats((cs) => cs.map((c) => c.id !== cid ? c
                : { ...c, updated: Date.now(), messages: c.messages.map((m) => (m.id === reply.id ? { ...m, ...done } : m)) }), true);
        }
    }

    // "Again": same request, a new variation
    function again(msgId) {
        const c = currentChat();
        if (!c || busyRef.current) return;
        const i = c.messages.findIndex((m) => m.id === msgId);
        const userMsg = c.messages.slice(0, i).reverse().find((m) => m.role === "user");
        if (!userMsg) return;
        const msg = { id: uid(), role: "user", text: "Make another version of this, with a different take.", size: c.messages[i].size, tags: userMsg.tags };
        addMessage(c.id, msg);
        runImage(c.id, {
            prompt: msg.text, tags: (userMsg.tags || []).map((t) => "/" + t).join(" "),
            size: { w: msg.size.w, h: msg.size.h }, refs: [], docs: [], focusId: c.messages[i].image.id
        }, msg);
    }

    // Try again after an error (same request)
    function retry(msgId) {
        const c = currentChat();
        if (!c || busyRef.current) return;
        const failed = c.messages.find((m) => m.id === msgId);
        const userMsg = c.messages.find((m) => m.id === failed?.retry?.userId) || c.messages[c.messages.findIndex((m) => m.id === msgId) - 1];
        const payload = failed?.retry?.payload || (userMsg && payloads.current.get(userMsg.id));
        if (!payload || !userMsg) return showToast("Send the message again to retry.");
        updateChats((cs) => cs.map((x) => (x.id === c.id ? { ...x, messages: x.messages.filter((m) => m.id !== msgId) } : x)));
        (c.kind === "image" ? runImage : runAssistant)(c.id, payload, userMsg);
    }

    // ---------- Chat list ----------
    function newChat() {
        setOpen((o) => ({ ...o, [modeRef.current]: null }));
        setFocusRaw(null);
        if (modeRef.current === "image" && tabRef.current !== "image") setTab("image");
        setTimeout(() => inputRef.current?.focus(), 30);
    }
    function openChat(c) {
        const m = c.kind === "image" ? "image" : "create";
        setOpen((o) => ({ ...o, [m]: c.id }));
        setFocusRaw(null);
        if (m !== modeRef.current) setMode(m);
        if (m === "image" && tabRef.current !== "image") setTab("image");
    }
    function deleteChat(c) {
        if (!confirm(`Delete “${c.title}”?\nThis can't be undone.`)) return;
        setOpen((o) => ({ create: o.create === c.id ? null : o.create, image: o.image === c.id ? null : o.image }));
        updateChats((cs) => cs.filter((x) => x.id !== c.id), true);
    }

    // ---------- Pin editor (Image studio) ----------
    function openPinEditor(m) {
        const c = currentChat();
        if (!c || !m.image) return;
        if (busyRef.current) return showToast("Wait for the current answer to finish first.");
        composerApi.current?.closePops();
        setPe({ chatId: c.id, msg: m });
    }
    function addPinEditMessages(cid, userMsg, reply) {
        updateChats((cs) => cs.map((c) => (c.id === cid ? { ...c, updated: Date.now(), messages: [...c.messages, userMsg, reply] } : c)), true);
    }

    // ---------- Voice (speak; ending with "send" / "generate" sends; "slash cinematic" adds a tag in the Image studio) ----------
    function voiceTags(text) {
        if (modeRef.current !== "image") return text;
        return text.replace(/(?:^|\s)(?:slash|\/)\s*([a-z0-9]+(?:\s[a-z0-9]+)?)/gi, (all, words) => {
            const two = words.toLowerCase().replace(/\s+/g, "");
            const one = words.toLowerCase().split(/\s+/)[0];
            const hit = tagById(two) ? two : tagById(one) ? one : TAGS.find((t) => t.label.toLowerCase().replace(/\s/g, "") === two)?.id;
            if (!hit) return all;
            addTag(hit);
            return two === hit || !tagById(one) ? " " : " " + words.split(/\s+/).slice(1).join(" ");
        }).replace(/\s{2,}/g, " ").trim();
    }
    const voice = useVoice("composer", {
        target: () => ({ get: () => promptRef.current, set: (v) => setPrompt(v) }),
        listeningHint: "Listening… speak, then say “send”.",
        onError: (message) => { showToast(message, "error"); say(message); },
        onFinal: ({ text, base, setTarget, join }) => {
            if (VOICE_CLEAR.test(text)) { setTarget(""); setTags([]); return say("Cleared."); }
            if (VOICE_HELP.test(text)) {
                setTarget(base);
                const help = "Say your message, then say send. In the Image studio, add a style by saying slash and the tag name, for example slash cinematic. Say clear to start over.";
                showToast(help);
                return say(help);
            }
            const m = text.match(VOICE_MODE);
            if (m) {
                setTarget(base);
                if (/guideline|banner/i.test(m[1])) { setMode("image"); setTab("banner"); return say("Guideline banners."); }
                const next = /image/i.test(m[1]) ? "image" : "create";
                setMode(next);
                if (next === "image") setTab("image");
                return say(next === "create" ? "Create anything." : "Image studio.");
            }
            const go = VOICE_GO.test(text) || VOICE_GO_HI.test(text);
            const rest = voiceTags(go ? text.replace(VOICE_GO, "").replace(VOICE_GO_HI, "").trim() : text);
            setTarget(join(rest));
            if (go) setTimeout(() => submit(null, { voice: true }), 0);
            else inputRef.current?.focus();
        }
    });

    // ---------- Connection check (sidebar): is the Apps Script web app reachable and on v9? ----------
    useEffect(() => {
        if (backendCheckStarted) return;
        backendCheckStarted = true;
        const set = (state, text, help = "") => {
            setStatus({ state, text, help: help || text });
            // Problems also pop up once after the splash, so nobody has to hover to find them
            if (state === "error" || state === "warn") setTimeout(() => showToast(`${text}: ${help || ""}`.replace(/:\s*$/, ""), state === "error" ? "error" : ""), SPLASH_MS + 600);
        };
        (async () => {
            const deployHelp = "In Apps Script: Deploy → Manage deployments → select the deployment whose URL is in server/.env (APPS_SCRIPT_URL) → ✏️ → Version: New version → Deploy.";
            const ctrl = new AbortController();
            const timer = setTimeout(() => ctrl.abort(), 20000);
            try {
                const res = await fetch(WEBAPP_URL + "?diag=1", { signal: ctrl.signal });
                const text = await res.text();
                let data;
                try { data = JSON.parse(text); } catch {
                    return set("error", "Apps Script not public", "The web app answered with a sign-in page. Deploy → Manage deployments → ✏️ → Who has access: Anyone → Version: New version → Deploy.");
                }
                if (data.error && !data.version) {
                    return set("error", /not allowed/i.test(data.error) ? "Apps Script key doesn't match" : "Server can't reach Apps Script",
                        /not allowed/i.test(data.error) ? "APP_KEY in Apps Script → Script properties must equal APPS_SCRIPT_KEY in server/.env." : data.error);
                }
                const v = String(data.version || "");
                const num = parseFloat(v.replace(/^v/, "")) || 0;
                setBackendVersion(num);
                if (num < MIN_CODE_VERSION) return set("error", `Old Code.gs running (${v || "unknown"})`, `Paste Code.gs v${MIN_CODE_VERSION.toFixed(1)}, save, then: ${deployHelp}`);
                if (/MISSING/.test(String(data.CF_ACCOUNT_ID) + String(data.CF_API_TOKEN))) return set("warn", `Code.gs ${v} · AI keys missing`, "Add CF_ACCOUNT_ID and CF_API_TOKEN in Apps Script → Project Settings → Script properties.");
                set("ok", `Connected · Code.gs ${v}`, "Connected. The AI runs in Apps Script; your chats and banners are saved in MongoDB.");
            } catch (err) {
                console.error("Connection check:", err);
                set("error", "Can't reach the server", "Start the vibeMate server (cd src/server && npm run dev) and check APPS_SCRIPT_URL in server/.env.");
            } finally {
                clearTimeout(timer);
            }
        })();
    }, [showToast]);

    // ---------- Global keys ----------
    useEffect(() => {
        const onKey = (e) => { if (e.key === "Escape" && !document.querySelector(".pe, .dialog, .preview-modal")) composerApi.current?.closePops(); };
        document.addEventListener("keydown", onKey);
        return () => document.removeEventListener("keydown", onKey);
    }, []);

    const greet = GREETINGS[showsBanners ? "banner" : mode];
    const pickSuggestion = (text) => { setPrompt(text); setTimeout(() => { const b = inputRef.current; if (b) { b.focus(); b.setSelectionRange(text.length, text.length); } }, 20); };

    // ---------- Sidebar: your chats (or banners) for this screen ----------
    const side = (closeSide) => (
        <>
            {showsBanners ? (
                <button type="button" className="side-new" onClick={() => { setDialog(true); closeSide(); }}>{ICONS.plus}New guideline banner</button>
            ) : (
                <button type="button" className="side-new" onClick={() => { newChat(); closeSide(); }}>{ICONS.plus}{mode === "image" ? "New image" : "New chat"}</button>
            )}
            <p className="side-label">{showsBanners ? "Your banners" : mode === "image" ? "Your images" : "Your chats"}</p>
            <ol className="side-list">
                {showsBanners
                    ? (banners || []).map((b) => (
                        <li key={b.id} className="side-item">
                            <a className="side-item__open" href={editLink("banner", b.id)} title={b.title}>{b.title}</a>
                        </li>
                    ))
                    : myChats.map((c) => (
                        <li key={c.id} className={`side-item${c.id === chatId ? " is-active" : ""}`}>
                            <button type="button" className="side-item__open" title={c.title} onClick={() => { openChat(c); closeSide(); }}>{c.title}</button>
                            <button type="button" className="side-item__del" aria-label={`Delete ${c.title}`} title="Delete" onClick={() => deleteChat(c)}>×</button>
                        </li>
                    ))}
            </ol>
            {(showsBanners ? banners && !banners.length : !myChats.length) && (
                <p className="side-empty">{showsBanners ? "Your banners show up here." : mode === "image" ? "Your images show up here." : "Your chats show up here."}</p>
            )}
        </>
    );

    return (
        <div className={`home-root${booting ? " is-booting" : ""}${pe ? " pe-open" : ""}`}>
            <Splash onDone={() => { setBooting(false); if (matchMedia("(min-width: 901px)").matches) inputRef.current?.focus(); }} />
            <Toast toast={toast} />

            <AppShell active={mode} mode={mode} onMode={setMode} user={user} title={hasThread ? chat.title : ""}
                side={side} status={status} onStatusClick={() => showToast(status.help || status.text, status.state === "error" ? "error" : "")}>
                <div className={`home home--${showsBanners ? "banner" : mode}${hasThread ? " has-thread" : ""}`}>
                    {mode === "image" && (
                        <div className="studio-tabs" role="tablist" aria-label="Image studio">
                            {[["image", "AI image", ICONS.image], ["banner", "Guideline banner", ICONS.banner]].map(([k, label, icon]) => (
                                <button key={k} type="button" role="tab" aria-selected={tab === k} className={`studio-tabs__btn${tab === k ? " is-active" : ""}`} onClick={() => setTab(k)}>
                                    {icon}{label}
                                </button>
                            ))}
                        </div>
                    )}

                    {showsBanners ? (
                        <BannerHome banners={banners} onNew={() => setDialog(true)} />
                    ) : <>
                        {hasThread && (
                            <Thread chat={chat} busy={busy} toast={showToast}
                                onRetry={retry} onAgain={again} onEdit={openPinEditor} onRegenerate={regenerate} />
                        )}

                        {!hasThread && (
                            <section className="welcome">
                                <p className="welcome__eyebrow">
                                    <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M12 1.5l2.2 7.3 7.3 2.2-7.3 2.2-2.2 7.3-2.2-7.3L2.5 11l7.3-2.2z" /></svg>
                                    <span>{greeting()}{user?.name ? `, ${user.name.split(" ")[0]}` : ""}</span>
                                </p>
                                <h1 className="welcome__title">{greet.title}</h1>
                                <p className="welcome__sub">{greet.sub}</p>
                            </section>
                        )}

                        <PromptComposer
                            apiRef={composerApi} inputRef={inputRef}
                            mode={mode} prompt={prompt} placeholder={greet.placeholder} tags={tags} files={files} focus={focus}
                            size={size} sendDisabled={sendDisabled} busy={busy} voice={voice} hasThread={hasThread}
                            onPrompt={(v) => setPrompt(absorbTypedTags(v))}
                            onSetPrompt={setPrompt}
                            onAddTag={addTag} onRemoveTag={removeTag} onToggleTag={toggleTag} onClearTags={() => setTags([])}
                            onAddFiles={addFiles} onRemoveFile={removeFile} onClearFocus={() => setFocusRaw(null)}
                            onSize={setSize} onSubmit={submit} toast={showToast}
                        />

                        {!hasThread && (
                            mode === "create" ? (
                                <div className="suggest">
                                    {SUGGESTIONS.map((s) => (
                                        <button key={s.title} type="button" className="suggest__card" onClick={() => pickSuggestion(s.text)}>
                                            <strong>{s.title}</strong><span>{s.text}</span>
                                        </button>
                                    ))}
                                </div>
                            ) : (
                                <div className="suggest suggest--chips">
                                    {IMAGE_SUGGESTIONS.map((s) => <button key={s} type="button" className="suggest__chip" onClick={() => pickSuggestion(s)}>{s}</button>)}
                                </div>
                            )
                        )}
                    </>}
                </div>
            </AppShell>

            {pe && (
                <PinEditor key={pe.msg.id} start={pe.msg} toast={showToast}
                    onAdd={(userMsg, reply) => addPinEditMessages(pe.chatId, userMsg, reply)}
                    onClose={() => setPe(null)} />
            )}
            {dialog && <BannerDialog toast={showToast} onClose={() => setDialog(false)} />}
        </div>
    );
}

// ---------- Image studio · Guideline banner tab ----------
function BannerHome({ banners, onNew }) {
    return (
        <section className="bannerhome">
            <div className="bannerhome__hero card">
                <div className="guide" aria-hidden="true">
                    <div className="guide__text">
                        <i className="guide__h"></i><i className="guide__h guide__h--short"></i>
                        <i className="guide__s"></i>
                        <span className="guide__btn">Shop now</span>
                    </div>
                    <div className="guide__products">
                        <span className="guide__p">1</span><span className="guide__p guide__p--hero">2</span><span className="guide__p">3</span>
                    </div>
                </div>
                <div className="bannerhome__intro">
                    <h1>{GREETINGS.banner.title}</h1>
                    <p className="text-muted">{GREETINGS.banner.sub}</p>
                    <button type="button" className="btn btn--primary btn--lg" onClick={onNew}>{ICONS.plus}New guideline banner</button>
                </div>
            </div>

            <div className="bannerhome__head">
                <h2>Your banners</h2>
                <a className="text-link" href="history.html">All history</a>
            </div>
            {banners === null && <div className="bannerhome__grid">{[0, 1, 2].map((i) => <div key={i} className="bcard is-loading" />)}</div>}
            {banners && !banners.length && <div className="msgbox bannerhome__empty">No banners yet. Press <strong>New guideline banner</strong> to make your first one.</div>}
            {banners && banners.length > 0 && (
                <div className="bannerhome__grid">
                    {banners.map((b) => (
                        <a key={b.id} className="bcard" href={editLink("banner", b.id)}>
                            <span className="bcard__thumb" style={b.thumb ? { backgroundImage: `url("${b.thumb}")` } : undefined}>{!b.thumb && ICONS.banner}</span>
                            <span className="bcard__text">
                                <strong>{b.title}</strong>
                                <small>{fmtWhen(b.updatedAt)} · {b.daysLeft} day{b.daysLeft === 1 ? "" : "s"} left</small>
                            </span>
                        </a>
                    ))}
                </div>
            )}
        </section>
    );
}

function greeting() {
    const h = new Date().getHours();
    return h < 5 ? "Working late" : h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening";
}
