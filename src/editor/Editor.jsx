// =====================================================
// vibeMate 1.1 (React) · Editor.jsx   Guideline banner editor (bannercreation.html?id=<banner id>)
//   Edit with pins (AI) + Undo · Manual tab (brand kit, text, colours, T&C, text background, products, background themes,
//   AI background with a model choice) · Save only when edited (MongoDB, with a small preview for History) · Download PNG / JPG / PDF · voice assistant
// 1.1: the banner is drawn with its brand kit's fonts, sizes and weights (extras.kit), Pixazo backgrounds are "px:<id>".
// A banner is kept for 30 days after its last save.
// =====================================================
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { APP_VERSION, HANDOFF_KEY, ensureBackend } from "../lib/config.js";
import { LIBS, getJson, loadImage, loadScript, post, saveFile } from "../lib/api.js";
import { BUTTON_SHAPES, DEFAULT_STYLE, fontStack, kitSnapshot } from "../lib/brandKit.js";
import { ensureFonts } from "../lib/fonts.js";
import { aiImageUrl, generateBackground, getModels, listKits, pickModel, rememberModel } from "../lib/setupApi.js";
import { createBanner, getBanner, homeLink, pageLink, saveBanner as putBanner } from "../lib/historyApi.js";
import { useStateRef } from "../lib/useStateRef.js";
import { narrate, parseNumber, say, useVoice } from "../lib/voice.js";
import { Toast, useToast } from "../components/Toast.jsx";
import { MicIcon, SpeakToggle, VoiceLangSelect } from "../components/VoiceControls.jsx";
import {
    DEFAULTS, FIELDS, LOAD_DELAY, MAX_LEN, MAX_PINS, PIN_PLACEHOLDERS, QUICK_TAGS, STAGE_H, STAGE_W, TARGET_LABELS, THEMES,
    backgroundCss, computePatch, contrastText, getCutout, getShadowSprite, isAiKey, layoutProducts, parseExtras, richLine,
    sampleBackground, serializeExtras
} from "./layout.js";
import { tagImage } from "../lib/tags.js";

const EMPTY_PRODUCT = { status: "", message: "", src: "", w: 0, h: 0 };
let started = false;   // load the banner once per page

export default function Editor() {
    const [toast, showToastRaw] = useToast({ duration: 3200 });
    const voiceFollowUntil = useRef(0);   // toasts are spoken for a short while after a voice command
    const showToast = useCallback((message, type = "") => {
        showToastRaw(message, type);
        if (Date.now() < voiceFollowUntil.current) say(message);
    }, [showToastRaw]);

    // ---------- State ----------
    const [fields, setFields, fieldsRef] = useStateRef({ ...DEFAULTS });
    const [extras, setExtras, extrasRef] = useStateRef({ scale: {} });
    const [aiBg, setAiBg, aiBgRef] = useStateRef({ key: "", dataUrl: "" });
    const [products, setProducts] = useState({ 1: EMPTY_PRODUCT, 2: EMPTY_PRODUCT, 3: EMPTY_PRODUCT });
    const [samples, setSamples] = useState(null);
    const [tab, setTab] = useState("ai");
    const [pins, setPins, pinsRef] = useStateRef([]);              // { id, x, y (0–1), target, text }
    const [overall, setOverall, overallRef] = useStateRef("");
    const [pinStatus, setPinStatus] = useState({ text: "", type: "" });
    const [applying, setApplying] = useState(false);
    const [lastState, setLastState, lastStateRef] = useStateRef(null);   // snapshot before the last applied edit (Undo)
    const [saveState, setSaveStateRaw, saveStateRef] = useStateRef("saved");   // saved | dirty | saving
    const [bannerId, setBannerId, bannerIdRef] = useStateRef("");          // MongoDB id ("" = not saved yet)
    const [daysLeft, setDaysLeft] = useState(null);
    const [loader, setLoader] = useState("Loading banner…");       // text, or "" when hidden
    const [aiTags, setAiTags] = useState("");
    const [aiStatus, setAiStatus] = useState({ text: "", type: "" });
    const [aiBusy, setAiBusy] = useState(false);
    const [format, setFormat] = useState("png");
    const [exportScale, setExportScale] = useState("2");
    const [downloading, setDownloading] = useState(false);
    const [scale, setScale] = useState(0.5);
    const [fontsReady, setFontsReady] = useState(false);
    const [fontsVersion, setFontsVersion] = useState(0);
    const [kits, setKits] = useState([]);                  // brand kits (Setup page), for the Manual tab
    const [kitPick, setKitPick] = useState("");
    const [models, setModels] = useState([]);
    const [modelId, setModelId] = useState("cf-flux");

    const frameRef = useRef(null);
    const stageRef = useRef(null);
    const headingRef = useRef(null);
    const subRef = useRef(null);
    const offerRef = useRef(null);
    const buttonRef = useRef(null);
    const contentRef = useRef(null);
    const productRefs = { 1: useRef(null), 2: useRef(null), 3: useRef(null) };
    const pinLayerRef = useRef(null);
    const pinStatusRef = useRef(null);
    const lastAutoPatch = useRef(null);
    const lastBoxId = useRef("");
    const skuDelay = useRef({ 1: 0, 2: 0, 3: 0 });

    const isDirty = saveState === "dirty";
    const setSaveState = (s) => setSaveStateRaw(s);
    const markDirty = () => setSaveStateRaw("dirty");
    const getData = () => ({ ...fieldsRef.current, extras: serializeExtras(extrasRef.current) });

    // ---------- Form helpers ----------
    function setField(name, value) {
        setFields((f) => ({ ...f, [name]: value }));
        markDirty();
    }
    function setSku(n, value, delay = LOAD_DELAY) {
        skuDelay.current[n] = delay;
        setField("sku" + n, value);
    }
    function updateExtras(fn) {
        setExtras((e) => { const next = fn({ ...e, scale: { ...e.scale } }); return next; });
    }

    // Saved banner / hand-over from the Image studio: only non-empty values replace the defaults
    function fillForm(data) {
        const next = { ...fieldsRef.current };
        FIELDS.forEach((name) => {
            if (!data[name] || name === "extras") return;
            if (name === "background" && isAiKey(data[name])) {
                setAiBg({ key: data[name], dataUrl: String(data[name]).startsWith("px:") ? aiImageUrl(data[name]) : "" });   // ai: loads later from Drive, px: straight from the server
            }
            next[name] = String(data[name]);
        });
        setFields(next);
        setExtras(parseExtras(data.extras));
    }
    // A full snapshot back (Undo): empty values are restored too
    function setFormData(data) {
        const next = { ...fieldsRef.current };
        FIELDS.forEach((name) => {
            if (name === "extras") return;
            const value = data[name] || "";
            if (name === "background") { next.background = value || "blush"; return; }
            if (/color$/.test(name) && !value) return;
            next[name] = value;
        });
        setFields(next);
        setExtras(parseExtras(data.extras));
    }

    // Sub text and offer callout: only one can be used
    const subDisabled = fields.offercallout.trim() !== "" && fields.subtext.trim() === "";
    const offerDisabled = fields.subtext.trim() !== "" && fields.offercallout.trim() === "";

    // ---------- Background + text patch ----------
    const bg = useMemo(() => backgroundCss(fields.background, aiBg), [fields.background, aiBg]);
    useEffect(() => {
        let live = true;
        if (bg.image) setSamples(null);
        sampleBackground(bg.image, bg.theme)
            .then((s) => live && setSamples(s))
            .catch((err) => console.warn("Text patch: couldn't read the background image.", err));
        return () => { live = false; };
    }, [bg.image, bg.theme]);
    const patch = useMemo(() => computePatch(extras.patch, samples, fields), [extras.patch, samples, fields]);
    if (patch.auto) lastAutoPatch.current = patch.auto;

    // ---------- Products: load -> cut-out (600 ms after typing, at once otherwise) ----------
    const tokens = useRef({ 1: 0, 2: 0, 3: 0 });
    const loadProduct = useCallback(async (n, url) => {
        const token = ++tokens.current[n];
        const set = (p) => setProducts((ps) => ({ ...ps, [n]: { ...ps[n], ...p } }));
        if (!url) return set({ ...EMPTY_PRODUCT });
        if (!/^(https?:\/\/|data:image)/i.test(url)) return set({ status: "error", message: "Paste a full link starting with https://" });
        set({ status: "loading", message: "Removing background…" });
        try {
            const cut = await getCutout(url);
            if (token !== tokens.current[n]) return;           // a newer link was entered
            set({ status: "ready", message: "Ready ✓", src: cut.src, w: cut.w, h: cut.h });
        } catch (err) {
            if (token !== tokens.current[n]) return;
            console.error(`SKU ${n}:`, err);
            set({ status: "error", message: err.message || "Couldn't load this image.", src: "", w: 0, h: 0 });
        }
    }, []);
    const skuUrls = [fields.sku1, fields.sku2, fields.sku3];
    const lastUrls = useRef([null, null, null]);
    const skuTimers = useRef({});
    useEffect(() => {
        if (loader) return;                                  // products load once the banner data is in
        [1, 2, 3].forEach((n) => {
            const url = skuUrls[n - 1].trim();
            if (url === lastUrls.current[n - 1]) return;
            lastUrls.current[n - 1] = url;
            clearTimeout(skuTimers.current[n]);
            const delay = skuDelay.current[n];
            skuDelay.current[n] = 0;
            skuTimers.current[n] = setTimeout(() => loadProduct(n, url), url ? delay : 0);
        });
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [skuUrls[0], skuUrls[1], skuUrls[2], loader, loadProduct]);
    const loadNow = (n) => {                                 // Enter / leaving the box: load without waiting
        clearTimeout(skuTimers.current[n]);
        const url = fieldsRef.current["sku" + n].trim();
        lastUrls.current[n - 1] = url;
        loadProduct(n, url);
    };
    const layout = useMemo(() => layoutProducts(products, extras.scale), [products, extras.scale]);

    // ---------- Brand kit look: fonts, sizes, weights (extras.kit, or the 1.0 look) ----------
    const style = extras.kit?.style || DEFAULT_STYLE;
    const fontKey = [style.heading.font, style.sub.font, style.offer.font, style.button.font].join("|");
    useEffect(() => {
        let live = true;
        ensureFonts(fontKey.split("|")).then(() => live && setFontsVersion((v) => v + 1));
        return () => { live = false; };
    }, [fontKey]);

    // ---------- Fit the text into its box (shrinks long headlines) ----------
    useLayoutEffect(() => {
        const fit = (el, max, min, maxHeight) => {
            if (!el) return;
            let size = max;
            el.style.fontSize = size + "px";
            while (el.scrollHeight > maxHeight && size > min) { size -= 2; el.style.fontSize = size + "px"; }
        };
        fit(headingRef.current, style.heading.size, Math.round(style.heading.size * 0.6), 320);
        fit(subRef.current, style.sub.size, Math.round(style.sub.size * 0.75), 90);
        fit(offerRef.current, style.offer.size, Math.round(style.offer.size * 0.75), 90);
    }, [fields.maintext, fields.subtext, fields.offercallout, fontsReady, fontsVersion, style]);

    // Brand kits and image models for the Manual tab
    useEffect(() => {
        listKits().then((r) => setKits(r.kits || [])).catch(() => setKits([]));
        getModels().then((m) => { setModels(m.models || []); setModelId(pickModel(m.models || [], null, m.default)); }).catch(() => {});
    }, []);

    // Scale the 1360×800 stage to fit the preview area
    useEffect(() => {
        const ro = new ResizeObserver(([entry]) => setScale(entry.contentRect.width / STAGE_W));
        ro.observe(frameRef.current);
        return () => ro.disconnect();
    }, []);

    // =====================================================
    // LOAD / SAVE / RESET (MongoDB through the vibeMate server)
    // =====================================================
    useEffect(() => {
        if (started) return;
        started = true;
        (async () => {
            const urlId = new URLSearchParams(location.search).get("id") || "";
            // Coming straight from the Image studio: the new banner is already here
            let handoff = null;
            try {
                handoff = JSON.parse(sessionStorage.getItem(HANDOFF_KEY) || "null");
                sessionStorage.removeItem(HANDOFF_KEY);
            } catch { /* storage blocked: load from the server */ }
            if (handoff && urlId && handoff.id !== urlId) handoff = null;   // an old hand-over for another banner
            let aiKey = "";
            let dirty = false;
            try {
                if (handoff && handoff.banner) {
                    fillForm(handoff.banner);
                    setBannerId(handoff.id || "");
                    if (handoff.id) setDaysLeft(30);
                    aiKey = isAiKey(handoff.banner.background) ? handoff.banner.background : "";
                    if (handoff.dataUrl && aiKey) setAiBg({ key: aiKey, dataUrl: handoff.dataUrl });
                    if (handoff.warning) setTimeout(() => showToast(handoff.warning, "error"), 600);
                    else if (handoff.saved) setTimeout(() => showToast("Banner saved. Find it any time in History.", "success"), 600);
                    dirty = !handoff.id;                              // not saved yet: Save is active straight away
                } else if (urlId) {
                    const res = await getBanner(urlId);
                    fillForm(res.banner || {});
                    setBannerId(res.id || urlId);
                    setDaysLeft(res.daysLeft ?? null);
                    aiKey = isAiKey(res.banner?.background) ? res.banner.background : "";
                } else {
                    setTimeout(() => showToast("A new, empty banner. Fill in the Manual tab, then press Save."), 600);
                }
            } catch (err) {
                console.error("Load error:", err);
                showToast(err.message || "Couldn't load the banner. Please try again.", "error");
            }
            try { await document.fonts.ready; await ensureFonts(Object.values(parseExtras(handoff?.banner?.extras).kit?.style || {}).map((t) => t.font)); } catch { /* old browser */ }
            setFontsReady(true);
            setSaveState(dirty ? "dirty" : "saved");
            setLoader("");
            // Saved AI background: fetch the image from Drive (via Apps Script)
            if (aiKey.startsWith("ai:") && aiBgRef.current.key === aiKey && !aiBgRef.current.dataUrl) {
                try {
                    const res = await getJson(`?bg=${encodeURIComponent(aiKey.slice(3))}`);
                    if (!res.dataUrl) throw new Error(res.error || "not found");
                    if (aiBgRef.current.key === aiKey) setAiBg({ key: aiKey, dataUrl: res.dataUrl });
                } catch (err) {
                    console.error("Saved AI background:", err);
                    setAiStatus({ text: "Couldn't load the saved AI background (" + err.message + "). Generate a new one or pick a theme.", type: "error" });
                }
            }
        })();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // A small picture of the finished banner for History (272 × 160)
    async function makeThumb() {
        try {
            await loadScript(LIBS.html2canvas);
            const shot = await window.html2canvas(stageRef.current, {
                scale: 0.2, width: STAGE_W, height: STAGE_H, backgroundColor: "#ffffff", useCORS: true, logging: false, scrollX: 0, scrollY: 0,
                onclone: (doc) => {
                    const s = doc.getElementById("bannerStage");
                    s.style.transform = "none";
                    s.classList.add("is-exporting");
                }
            });
            return shot.toDataURL("image/jpeg", 0.72);
        } catch (err) {
            console.warn("Preview picture:", err);
            return "";
        }
    }

    async function saveBanner(e) {
        e?.preventDefault();
        if (saveStateRef.current !== "dirty") { showToast("No changes to save. Edit something first."); return; }
        if (!fieldsRef.current.maintext.trim()) {
            showToast("Add a main text before saving.", "error");
            setTab("manual");
            setTimeout(() => document.getElementById("maintext")?.focus(), 50);
            return;
        }
        setSaveState("saving");
        try {
            const data = getData();
            const thumb = await makeThumb();
            const addNew = async () => {
                const res = await createBanner(data, thumb);
                setBannerId(res.id);
                history.replaceState(null, "", `bannercreation.html?id=${encodeURIComponent(res.id)}`);
            };
            if (bannerIdRef.current) {
                try { await putBanner(bannerIdRef.current, data, thumb); }
                catch (err) { if (/doesn't exist/i.test(err.message)) await addNew(); else throw err; }   // deleted meanwhile: keep it as a new banner
            } else {
                await addNew();
            }
            setDaysLeft(30);
            setSaveState("saved");
            showToast("Saved. It stays in History for 30 days after your last change.", "success");
        } catch (err) {
            console.error(err);
            setSaveState("dirty");
            showToast(err.message || "Couldn't save. Please try again.", "error");
        }
    }

    // "Reset banner": clears the form and the preview (the saved banner changes only when you press Save)
    function clearBanner() {
        if (!confirm("Clear the text, products and background? Your saved banner only changes when you press Save.")) return;
        setFields({ ...DEFAULTS });
        setExtras(extrasRef.current.kit ? { scale: {}, kit: extrasRef.current.kit } : { scale: {} });   // the brand kit look stays
        clearPins();
        setLastState(null);
        setAiBg({ key: "", dataUrl: "" });             // hide the AI tile (the image stays in the Drive folder)
        setAiStatus({ text: "", type: "" });
        markDirty();
        showToast("Cleared. Start again, then press Save.");
    }

    // =====================================================
    // AI BACKGROUND: SKU products + tags -> server (routes/ai.js) -> FLUX image in Drive ("ai:<id>")
    //               or Pixazo image in MongoDB ("px:<id>"). The brand kit's background style is added.
    // =====================================================
    async function generateAiBackground() {
        if (aiBusy) return;
        const list = [2, 1, 3].map((n) => fieldsRef.current["sku" + n].trim()).filter(Boolean);   // hero first
        const tagsText = aiTags.trim();
        if (!list.length && !tagsText) {
            setAiStatus({ text: "Add at least one SKU link above, or pick a style tag first.", type: "error" });
            return;
        }
        setAiBusy(true);
        const model = models.find((m) => m.id === modelId);
        setAiStatus({ text: `Creating your background${model ? " with " + model.label : ""}… this takes about 10–30 seconds.`, type: "" });
        try {
            if (!model || model.provider === "apps-script") await ensureBackend();
            const res = await generateBackground({ model: modelId, kitId: extrasRef.current.kit?.id || "", products: list, tags: tagsText });
            if (!res.dataUrl) throw new Error(res.error || "No image came back. Please try again.");
            setAiBg({ key: res.key, dataUrl: res.dataUrl });
            setField("background", res.key);
            setAiStatus({ text: res.product ? `Done ✓ Made for “${res.product}”. Save the banner to keep it.` : "Done ✓ Save the banner to keep it.", type: "ok" });
            console.log("AI background prompt:", res.prompt);
        } catch (err) {
            console.error("AI background:", err);
            setAiStatus({ text: err.message || "Couldn't generate. Please try again.", type: "error" });
        } finally {
            setAiBusy(false);
        }
    }
    // Brand kit (Manual tab): the banner takes the kit's fonts, sizes and weights, and its colours when the kit says so
    function applyKit(id) {
        const kit = kits.find((k) => k.id === id);
        if (id === "none") {
            updateExtras((e) => { const n = { ...e }; delete n.kit; return n; });
            markDirty();
            return showToast("Back to the vibeMate default look.");
        }
        if (!kit) return;
        updateExtras((e) => ({ ...e, kit: kitSnapshot(kit) }));
        if (kit.defaults.useColors) {
            const t = kit.typography;
            setFields((f) => ({ ...f, maincolor: t.heading.color, subcolor: t.sub.color, offercolor: t.offer.color, buttoncolor: t.button.bg }));
        }
        markDirty();
        showToast(`“${kit.name}” applied. Save to keep it.`, "success");
    }
    function chooseModel(id) { setModelId(id); rememberModel(id); }

    function toggleQuickTag(tag) {
        const pattern = new RegExp("\\s*" + tag + "\\b", "i");
        setAiTags((v) => (pattern.test(v) ? v.replace(pattern, "").trim() : (v.trim() + " " + tag).trim()));
    }
    const tagActive = (tag) => new RegExp(tag + "\\b").test(aiTags.toLowerCase());

    // =====================================================
    // EDIT WITH PINS
    // Click the banner -> numbered pin + instruction box. The page knows which layer is under each pin.
    // "Apply" sends all instructions to Apps Script; the answer changes the same fields the Manual tab uses.
    // =====================================================
    function hitTest(x, y) {
        const inside = (el) => {
            if (!el) return false;
            const r = el.getBoundingClientRect();
            return x >= r.left && x <= r.right && y >= r.top && y <= r.bottom;
        };
        for (const n of [2, 1, 3]) {
            const img = productRefs[n].current;
            if (img && !img.hidden && inside(img)) return "product" + n;
        }
        if (inside(buttonRef.current)) return "button";
        if (headingRef.current?.textContent && inside(headingRef.current)) return "heading";
        if (subRef.current && !subRef.current.hidden && subRef.current.textContent && inside(subRef.current)) return "sub";
        if (offerRef.current?.textContent && inside(offerRef.current)) return "offer";
        if (inside(contentRef.current)) return "text";
        return "background";
    }
    function dropPin(e) {
        if (e.target !== pinLayerRef.current) return;
        if (pinsRef.current.length >= MAX_PINS) return showToast(`Up to ${MAX_PINS} pins at a time. Apply these first.`, "error");
        const r = pinLayerRef.current.getBoundingClientRect();
        const i = pinsRef.current.length;
        setPins([...pinsRef.current, { id: Date.now() + "" + i, x: (e.clientX - r.left) / r.width, y: (e.clientY - r.top) / r.height, target: hitTest(e.clientX, e.clientY), text: "" }]);
        setPinStatus({ text: "", type: "" });
        setTimeout(() => document.getElementById("pinText" + i)?.focus());
    }
    function clearPins() {
        setPins([]);
        setOverall("");
        setPinStatus({ text: "", type: "" });
    }

    // A small copy of the current background image, sent as a reference so a background edit keeps the scene
    async function backgroundReference() {
        if (!bg.image) return "";
        try {
            const img = await loadImage(bg.image, true);
            const W = 508, H = Math.round(508 * STAGE_H / STAGE_W);
            const canvas = document.createElement("canvas");
            canvas.width = W;
            canvas.height = H;
            const s = Math.max(W / img.naturalWidth, H / img.naturalHeight);
            canvas.getContext("2d").drawImage(img, (W - img.naturalWidth * s) / 2, (H - img.naturalHeight * s) / 2, img.naturalWidth * s, img.naturalHeight * s);
            return canvas.toDataURL("image/jpeg", 0.85);
        } catch { return ""; }
    }

    // Applies the answer from Apps Script: { fields, products, background, cannot, summary }
    function applyChanges(res) {
        const changed = res.fields || {};
        const next = { ...fieldsRef.current };
        Object.keys(changed).forEach((name) => {
            if (!FIELDS.includes(name) || name === "background" || name === "extras") return;
            if (/color$/.test(name) && !changed[name]) return;
            next[name] = String(changed[name] ?? "");
        });
        // Sub text and offer callout: only one can be used (keep the one that was just written)
        if (next.subtext.trim() && next.offercallout.trim()) next[changed.offercallout ? "subtext" : "offercallout"] = "";

        const ex = { ...extrasRef.current, scale: { ...extrasRef.current.scale } };
        (res.products || []).forEach(({ slot, action }) => {
            if (action === "remove") {
                next["sku" + slot] = "";
                delete ex.scale[slot];
            } else {
                const k = (ex.scale[slot] || 1) * (action === "bigger" ? 1.15 : 0.87);
                ex.scale[slot] = Math.min(1.5, Math.max(0.6, Math.round(k * 100) / 100));
            }
        });
        if (res.background && res.background.dataUrl) {
            setAiBg({ key: "ai:" + res.background.id, dataUrl: res.background.dataUrl });
            next.background = "ai:" + res.background.id;
        }
        setFields(next);
        setExtras(ex);
        markDirty();
    }

    async function applyEdits() {
        if (applying) return;
        const list = pinsRef.current.map((pin, i) => ({ n: i + 1, target: pin.target, x: pin.x, y: pin.y, text: pin.text.trim() })).filter((pin) => pin.text);
        const whole = overallRef.current.trim();
        if (!list.length && !whole) {
            setPinStatus({ text: pinsRef.current.length ? "Write what should change at your pin." : "Click the banner to drop a pin, then write what should change there.", type: "error" });
            return;
        }
        setApplying(true);
        setPinStatus({ text: "Working on your edits… this takes about 10–30 seconds.", type: "" });
        try {
            await ensureBackend();
            const res = await post({ action: "edit", banner: getData(), pins: list, overall: whole, bgRef: await backgroundReference() });
            if (res.error || !res.fields) throw new Error(res.error || "No answer came back. Paste the new Code.gs and deploy a New version.");
            const before = { data: getData(), ai: { ...aiBgRef.current } };
            applyChanges(res);
            setLastState(before);
            setPins([]);
            setOverall("");
            const cannot = (res.cannot || []).join(" ");
            setPinStatus({ text: `${res.summary || "Edits applied."}${cannot ? " Not done: " + cannot : ""} Save the banner to keep it.`, type: cannot ? "error" : "ok" });
        } catch (err) {
            console.error("Pin edits:", err);
            setPinStatus({ text: err.message || "Couldn't apply the edits. Please try again.", type: "error" });
        } finally {
            setApplying(false);
        }
    }

    function undoEdit() {
        const s = lastStateRef.current;
        if (!s) return;
        setLastState(null);
        setAiBg(s.ai);
        setFormData(s.data);
        markDirty();
        setPinStatus({ text: "Last edit undone.", type: "ok" });
    }

    // =====================================================
    // DOWNLOAD (PNG / JPG / PDF)
    // =====================================================
    async function downloadBanner(fmt = format, sc = exportScale) {
        setDownloading(true);
        try {
            await loadScript(LIBS.html2canvas);
            await document.fonts.ready;
            // Render the stage at its REAL size × scale: no resizing afterwards = sharp output
            const shot = await window.html2canvas(stageRef.current, {
                scale: Number(sc), width: STAGE_W, height: STAGE_H, backgroundColor: null, useCORS: true, logging: false, scrollX: 0, scrollY: 0,
                onclone: (doc) => {
                    const s = doc.getElementById("bannerStage");
                    s.style.transform = "none";
                    s.classList.add("is-exporting");
                }
            });
            const slug = fieldsRef.current.maintext.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40);
            const name = `vibemate-${slug || "banner"}`;
            if (fmt === "png") return saveFile(shot.toDataURL("image/png"), name + ".png");

            // JPG / PDF have no transparency: put the banner on white
            const flat = document.createElement("canvas");
            flat.width = shot.width;
            flat.height = shot.height;
            const ctx = flat.getContext("2d");
            ctx.fillStyle = "#ffffff";
            ctx.fillRect(0, 0, flat.width, flat.height);
            ctx.drawImage(shot, 0, 0);
            const jpg = flat.toDataURL("image/jpeg", 0.95);
            if (fmt === "jpg") return saveFile(jpg, name + ".jpg");

            await loadScript(LIBS.jspdf);
            const { jsPDF } = window.jspdf;
            const pdf = new jsPDF({ orientation: "landscape", unit: "px", format: [STAGE_W, STAGE_H], hotfixes: ["px_scaling"] });
            pdf.addImage(jpg, "JPEG", 0, 0, STAGE_W, STAGE_H);
            pdf.save(name + ".pdf");
        } catch (err) {
            console.error(err);
            showToast(/helper library/.test(err.message) ? "Export library didn't load. Check your internet connection." : "Download failed. Please try again.", "error");
        } finally {
            setDownloading(false);
        }
    }

    // =====================================================
    // KEYS: Ctrl/Cmd + S = save · warn before leaving with unsaved changes
    // =====================================================
    const saveRef = useRef(saveBanner);
    saveRef.current = saveBanner;
    useEffect(() => {
        const onKey = (e) => {
            if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s") {
                e.preventDefault();
                if (saveStateRef.current !== "dirty") return showToast("No changes to save. Edit something first.");
                saveRef.current();
            }
        };
        const onLeave = (e) => { if (saveStateRef.current === "dirty") e.preventDefault(); };
        const onFocus = (e) => { if (e.target.id === "pinOverall" || /^pinText\d+$/.test(e.target.id || "")) lastBoxId.current = e.target.id; };
        document.addEventListener("keydown", onKey);
        document.addEventListener("focusin", onFocus);
        window.addEventListener("beforeunload", onLeave);
        return () => { document.removeEventListener("keydown", onKey); document.removeEventListener("focusin", onFocus); window.removeEventListener("beforeunload", onLeave); };
    }, [saveStateRef, showToast]);

    // =====================================================
    // VOICE ASSISTANT
    // Spoken edits go to the newest empty pin, else the box last used, else "Whole banner".
    // Commands: apply · undo · clear pins · pin 2 <edit> · remove pin 2 · save · download PDF/PNG/JPG · manual · pins · new banner · help
    // =====================================================
    function voiceTarget() {
        const ps = pinsRef.current;
        let idx = -1;
        for (let i = ps.length - 1; i >= 0; i--) if (!ps[i].text.trim()) { idx = i; break; }
        if (idx < 0 && /^pinText(\d+)$/.test(lastBoxId.current)) {
            const n = Number(lastBoxId.current.slice(7));
            if (ps[n]) idx = n;
        }
        if (idx < 0) return { id: "pinOverall", get: () => overallRef.current, set: (v) => setOverall(v) };
        const id = ps[idx].id;
        return {
            id: "pinText" + idx,
            get: () => pinsRef.current.find((p) => p.id === id)?.text || "",
            set: (v) => setPins((list) => list.map((p) => (p.id === id ? { ...p, text: v } : p)))
        };
    }
    const followVoice = () => { voiceFollowUntil.current = Date.now() + 60000; };
    const voiceReply = (message, type = "") => { setPinStatus({ text: message, type }); say(message); };
    const voiceApply = () => { followVoice(); narrate(pinStatusRef.current); applyEdits(); };

    function handleVoice({ text, target, base, setTarget, join }) {
        const plain = text.replace(/[.!?।]+$/, "").trim();
        const said = plain.toLowerCase();
        const restore = () => setTarget(base);       // a command: take the spoken words back out of the box
        let m;
        if (VOICE_RULES.help.test(said)) { restore(); showToast(VOICE_HELP); return say(VOICE_HELP); }
        if (VOICE_RULES.apply.test(said)) { restore(); return voiceApply(); }
        if (VOICE_RULES.undo.test(said)) {
            restore();
            if (!lastStateRef.current) return voiceReply("Nothing to undo yet.");
            narrate(pinStatusRef.current);
            return undoEdit();
        }
        if (VOICE_RULES.clear.test(said)) { restore(); clearPins(); return say("Pins cleared."); }
        if ((m = said.match(VOICE_RULES.unpin))) {
            restore();
            const n = parseNumber(m[1]);
            if (!pinsRef.current[n - 1]) return voiceReply(`There is no pin ${m[1]}.`, "error");
            setPins(pinsRef.current.filter((_, i) => i !== n - 1));
            return voiceReply(`Pin ${n} removed.`);
        }
        if (VOICE_RULES.save.test(said)) { restore(); followVoice(); return saveBanner(); }
        if ((m = said.match(VOICE_RULES.download))) {
            restore();
            const fmt = { jpeg: "jpg" }[m[1]] || m[1] || format;
            const sc = m[2] ? VOICE_SCALE[m[2]] : exportScale;
            setFormat(fmt);
            setExportScale(sc);
            followVoice();
            say(`Downloading ${fmt.toUpperCase()}.`);
            return downloadBanner(fmt, sc);
        }
        if (VOICE_RULES.manual.test(said)) { restore(); setTab("manual"); return say("Manual tab."); }
        if (VOICE_RULES.pinsTab.test(said)) { restore(); setTab("ai"); return say("Edit with pins."); }
        if (VOICE_RULES.fresh.test(said)) { restore(); location.href = homeLink("image", "&tab=banner&new=banner"); return; }

        // An edit, maybe ending with "… and apply"
        const andApply = VOICE_RULES.andApply.test(plain);
        const edit = andApply ? plain.replace(VOICE_RULES.andApply, "").trim() : text;

        // "pin 2, make it bigger" -> goes to pin 2 whatever box was active
        if ((m = edit.match(VOICE_RULES.pinEdit)) && parseNumber(m[1])) {
            restore();
            const n = parseNumber(m[1]);
            const pin = pinsRef.current[n - 1];
            if (!pin) return voiceReply(`There is no pin ${n}. Click the banner to drop one first.`, "error");
            setPins(pinsRef.current.map((p, i) => (i === n - 1 ? { ...p, text: [p.text.trim(), m[2].trim()].filter(Boolean).join(" ") } : p)));
            if (andApply) return voiceApply();
            return voiceReply(`Added to pin ${n}. Say “apply” when you're ready.`);
        }

        setTarget(join(edit));
        if (!edit) restore();
        if (andApply) return voiceApply();
        const where = /^pinText(\d+)$/.exec(target?.id || "");
        voiceReply(`Added to ${where ? "pin " + (Number(where[1]) + 1) : "the whole banner"}. Say “apply” when you're ready.`);
    }

    const voice = useVoice("edit", {
        target: voiceTarget,
        listeningHint: "Listening… say an edit, or “apply”, “undo”, “download PDF”.",
        onStart: () => setTab("ai"),
        onError: (message) => { showToast(message, "error"); say(message); },
        onFinal: handleVoice
    });

    // =====================================================
    // RENDER
    // =====================================================
    const d = fields;
    const showSub = !(!d.subtext && !!d.offercallout);
    const showTnc = Boolean(d.offercallout && extras.tnc !== false);
    const patchMode = extras.patch?.mode || "auto";
    const counter = (name) => {
        const len = d[name].length;
        return <span className={`field__count${len >= MAX_LEN[name] ? " is-limit" : ""}`}>{len ? `${len}/${MAX_LEN[name]}` : ""}</span>;
    };
    const saveLabel = { saved: "All changes saved", dirty: "Unsaved changes", saving: "Saving…" }[saveState];
    const shadowSrc = layout.empty ? "" : getShadowSprite();

    function setPatchMode(mode, color, opacity) {
        if (mode === "custom") {
            const fresh = !extras.patch || extras.patch.mode !== "custom";
            const startAt = fresh && lastAutoPatch.current ? lastAutoPatch.current : null;   // Custom starts from what Auto chose
            const c = color ?? (startAt ? startAt.color : extras.patch?.color || "#000000");
            const o = opacity ?? (startAt ? Math.max(0.3, startAt.opacity) : extras.patch?.opacity ?? 0.55);
            updateExtras((e) => ({ ...e, patch: { mode, color: c, opacity: o } }));
        } else {
            updateExtras((e) => { const next = { ...e }; if (mode === "off") next.patch = { mode }; else delete next.patch; return next; });
        }
        markDirty();
    }

    return (
        <>
            <div className={`loader${loader ? "" : " is-hidden"}`} role="status" aria-live="polite">
                <div className="loader__spinner"></div>
                <p>{loader || "Loading…"}</p>
            </div>
            <Toast toast={toast} />

            {/* ========== HEADER ========== */}
            <header className="app-header">
                <div className="app-header__left">
                    <a href={homeLink("image", "&tab=banner")} className="app-header__back" title="Back to the Image studio">
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M15 18l-6-6 6-6" /></svg>
                        <span>Banners</span>
                    </a>
                    <a href={homeLink("create")} className="logo">vibe<span>Mate</span></a>
                    <span className="version-tag">{APP_VERSION}</span>
                    <span className="app-header__divider"></span>
                    <span className="app-header__name" title={d.maintext}>{d.maintext || "Untitled banner"}</span>
                    <span className="save-state" data-state={saveState}>{saveLabel}</span>
                    {bannerId && daysLeft !== null && saveState === "saved" && <span className="app-header__days">· kept {daysLeft} more day{daysLeft === 1 ? "" : "s"}</span>}
                </div>
                <div className="app-header__right">
                    <a href={pageLink("history.html")} className="app-header__link" title="Everything from the last 30 days">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M3 12a9 9 0 103-6.7" /><path d="M3 4v4h4" /><path d="M12 7.5V12l3 2" /></svg>
                        <span>History</span>
                    </a>
                    <a href={homeLink("image", "&tab=banner&new=banner")} className="btn btn--soft">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true"><path d="M12 5v14M5 12h14" /></svg>
                        New banner
                    </a>
                    {/* Active only when something was edited; saves the banner in your account */}
                    <button type="button" id="saveBtn" className={`btn btn--primary${saveState === "saving" ? " is-busy" : ""}`} disabled={!isDirty}
                        title={isDirty ? "Save your banner (Ctrl + S)" : "Nothing to save yet. Edit something first."} onClick={saveBanner}>
                        {saveState === "saving" ? "Saving…" : <><span>{isDirty ? (bannerId ? "Save changes" : "Save banner") : "Saved"}</span> <kbd>Ctrl S</kbd></>}
                    </button>
                </div>
            </header>

            <main className="builder">
                {/* ========== PREVIEW ========== */}
                <section className="preview" aria-label="Banner preview">
                    <div className="preview__bar">
                        <div>
                            <h1 className="preview__title">Edit and export</h1>
                            <p className="text-muted">{tab === "ai" ? "Click the banner to drop a pin, then describe the change on the right." : "The preview updates as you type."}</p>
                        </div>
                        <span className="badge" title={extras.kit ? "Brand kit look: " + extras.kit.name : "vibeMate default look"}>{extras.kit ? extras.kit.name + " · " : ""}1360 × 800</span>
                    </div>

                    <div className={`stage-frame${tab === "ai" ? " is-pinning" : ""}`} ref={frameRef} style={{ "--scale": scale }}>
                        {/* Fixed 1360 × 800 design canvas, scaled to fit the screen */}
                        <div className="stage" id="bannerStage" ref={stageRef} style={{ background: bg.css }}>
                            <div className="stage__floor" hidden={Boolean(bg.image)}></div>
                            <div className="stage__patch" style={{ background: patch.background }}></div>

                            <div className="stage__content" ref={contentRef}>
                                <h2 ref={headingRef} className="stage__heading" data-placeholder="Your main text" style={{
                                    color: d.maincolor, fontFamily: fontStack(style.heading.font), fontWeight: style.heading.weight,
                                    lineHeight: style.heading.lineHeight, textTransform: style.heading.uppercase ? "uppercase" : "none"
                                }}>{d.maintext}</h2>
                                <p ref={subRef} className="stage__sub" data-placeholder="Sub text or offer" hidden={!showSub}
                                    style={{ color: d.subcolor, fontFamily: fontStack(style.sub.font), fontWeight: style.sub.weight }}
                                    dangerouslySetInnerHTML={{ __html: richLine(d.subtext) }} />
                                <p ref={offerRef} className="stage__offer" style={{ color: d.offercolor, fontFamily: fontStack(style.offer.font), fontWeight: style.offer.weight }}
                                    dangerouslySetInnerHTML={{ __html: richLine(d.offercallout) }} />
                            </div>
                            <span ref={buttonRef} className="stage__btn" style={{
                                background: d.buttoncolor, color: style.button.color === "auto" ? contrastText(d.buttoncolor) : style.button.color,
                                fontFamily: fontStack(style.button.font), fontWeight: style.button.weight, fontSize: style.button.size + "px",
                                borderRadius: (BUTTON_SHAPES.find((b) => b.id === style.button.shape)?.radius ?? 999) + "px"
                            }}>{d.buttontext || "Shop now"}</span>
                            <span className="stage__tnc" hidden={!showTnc} style={{ fontFamily: fontStack(style.sub.font) }}>*T&amp;C Apply</span>

                            {/* Empty-slot markers (preview only) */}
                            {[1, 2, 3].map((n) => (
                                <div key={"slot" + n} id={"slot" + n} className="stage__slot" hidden={!layout.empty} style={layout.empty ? px(layout.items[n].box) : undefined}>{n}</div>
                            ))}
                            {/* Contact shadows, then products (2 = hero in front) */}
                            {[1, 3, 2].map((n) => {
                                const it = !layout.empty && layout.items[n];
                                return <img key={"shadow" + n} id={"shadow" + n} className="stage__shadow" alt="" hidden={!it} src={it ? shadowSrc : undefined} style={it ? px(it.shadow) : undefined} />;
                            })}
                            {[1, 3, 2].map((n) => {
                                const it = !layout.empty && layout.items[n];
                                return <img key={"product" + n} id={"product" + n} ref={productRefs[n]} className={`stage__product${n === 2 ? " stage__product--front" : ""}`} alt=""
                                    hidden={!it} src={it ? products[n].src : undefined} style={it ? px(it.box) : undefined} />;
                            })}
                        </div>
                        {/* Pins sit above the banner and are never exported */}
                        <div className="pin-layer" ref={pinLayerRef} onClick={dropPin}>
                            {pins.map((pin, i) => (
                                <button key={pin.id} type="button" className="pin" style={{ left: pin.x * 100 + "%", top: pin.y * 100 + "%" }}
                                    title={`Pin ${i + 1} · ${TARGET_LABELS[pin.target]}`}
                                    onClick={(e) => { e.stopPropagation(); document.getElementById("pinText" + i)?.focus(); }}><span>{i + 1}</span></button>
                            ))}
                        </div>
                    </div>

                    <div className="export-bar card">
                        <div className="export-bar__label">
                            <strong>Export</strong>
                            <span className="text-muted">Choose format and size</span>
                        </div>
                        <div className="segmented" role="radiogroup" aria-label="File format">
                            {["png", "jpg", "pdf"].map((f) => (
                                <label key={f}><input type="radio" name="format" value={f} checked={format === f} onChange={() => setFormat(f)} /><span>{f.toUpperCase()}</span></label>
                            ))}
                        </div>
                        <select className="select" aria-label="Export size" value={exportScale} onChange={(e) => setExportScale(e.target.value)}>
                            <option value="0.5">Small · 680 × 400</option>
                            <option value="1">Standard · 1360 × 800</option>
                            <option value="2">HD · 2720 × 1600</option>
                        </select>
                        <button type="button" className={`btn btn--primary${downloading ? " is-busy" : ""}`} disabled={downloading} onClick={() => downloadBanner()}>
                            {downloading ? "Preparing…" : <>
                                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 4v11M7 10l5 5 5-5M5 20h14" /></svg>
                                Download
                            </>}
                        </button>
                    </div>
                </section>

                {/* ========== EDIT PANEL (right side) ========== */}
                <aside className="panel card">
                    <div className="tabs" role="tablist">
                        <button type="button" className={`tab${tab === "ai" ? " is-active" : ""}`} role="tab" aria-selected={tab === "ai"} onClick={() => setTab("ai")}>
                            <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 2a7 7 0 00-7 7c0 5 7 13 7 13s7-8 7-13a7 7 0 00-7-7zm0 9.5A2.5 2.5 0 1112 6.5a2.5 2.5 0 010 5z" /></svg>
                            Edit with pins
                        </button>
                        <button type="button" className={`tab${tab === "manual" ? " is-active" : ""}`} role="tab" aria-selected={tab === "manual"} onClick={() => setTab("manual")}>Manual</button>
                    </div>

                    {/* ---------- TAB 1: PIN EDITS ---------- */}
                    <div className="panel__tab" hidden={tab !== "ai"}>
                        <div className="panel__scroll">
                            <div className="pins">
                                {/* Voice assistant: say an edit or a command */}
                                <div className="voice-card">
                                    <div className={`voice${voice.listening ? " is-listening" : ""}${voice.supported ? "" : " is-unsupported"}`}>
                                        <button type="button" className="btn btn--ghost voice__mic" aria-pressed={voice.listening} onClick={voice.toggle}
                                            title={voice.supported ? "Speak an edit (Alt + M)" : "Voice works in Chrome, Edge or Safari"}>
                                            <MicIcon size={16} />
                                            <span>{voice.listening ? "Stop" : "Speak an edit"}</span>
                                        </button>
                                        <VoiceLangSelect />
                                        <SpeakToggle />
                                    </div>
                                    {voice.listening && <p className="voice__live" aria-live="polite">{voice.live}</p>}
                                    <p className="field__hint">Try “make the headline dark green and apply”, “pin 2 make it bigger”, “undo”, “save” or “download PDF”. <span className="nowrap"><kbd className="kbd-light">Alt</kbd> + <kbd className="kbd-light">M</kbd></span></p>
                                </div>

                                <p className="field__hint">Click the banner to drop a pin, then write what should change at that spot. Add as many pins as you need and apply them together.</p>
                                {!pins.length && <p className="pins__empty">No pins yet. Click anywhere on the banner.</p>}
                                <ol className="pins__list">
                                    {pins.map((pin, i) => (
                                        <li key={pin.id} className="pin-card">
                                            <div className="pin-card__head">
                                                <span className="pin-num">{i + 1}</span>
                                                <label htmlFor={"pinText" + i}>{TARGET_LABELS[pin.target]}</label>
                                                <button type="button" className="icon-btn" aria-label={`Remove pin ${i + 1}`} onClick={() => setPins(pins.filter((_, j) => j !== i))}>×</button>
                                            </div>
                                            <textarea className="textarea" id={"pinText" + i} maxLength={400} placeholder={PIN_PLACEHOLDERS[pin.target] || PIN_PLACEHOLDERS.background}
                                                value={pin.text} onChange={(e) => setPins(pins.map((p, j) => (j === i ? { ...p, text: e.target.value } : p)))}
                                                onKeyDown={(e) => { if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) { e.preventDefault(); applyEdits(); } }} />
                                        </li>
                                    ))}
                                </ol>

                                <div className="field">
                                    <label className="field__label" htmlFor="pinOverall">Whole banner <span className="text-muted">· optional, no pin needed</span></label>
                                    <textarea id="pinOverall" className="textarea" maxLength={600} placeholder="e.g. Make everything feel more festive"
                                        value={overall} onChange={(e) => setOverall(e.target.value)}
                                        onKeyDown={(e) => { if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) { e.preventDefault(); applyEdits(); } }} />
                                </div>
                                <small ref={pinStatusRef} className={`field__status${pinStatus.type ? " is-" + pinStatus.type : ""}`} aria-live="polite">{pinStatus.text}</small>
                            </div>
                        </div>
                        <div className="panel__actions">
                            <button type="button" className={`btn btn--primary${applying ? " is-busy" : ""}`} disabled={applying} onClick={applyEdits}>{applying ? "Applying…" : "Apply edits"}</button>
                            <button type="button" className="btn btn--ghost" disabled={!lastState} onClick={undoEdit}>Undo</button>
                            <button type="button" className="btn btn--ghost" onClick={clearPins}>Clear pins</button>
                        </div>
                    </div>

                    {/* ---------- TAB 2: MANUAL FORM ---------- */}
                    <form id="bannerForm" className="panel__tab" autoComplete="off" noValidate hidden={tab !== "manual"} onSubmit={saveBanner}>
                        <div className="panel__scroll">
                            {/* BRAND KIT (1.1) */}
                            <details className="section" open>
                                <summary className="section__head">
                                    <span className="section__icon">
                                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><path d="M4 6h10M18 6h2M4 12h4M12 12h8M4 18h12" /><circle cx="16" cy="6" r="2" /><circle cx="10" cy="12" r="2" /><circle cx="18" cy="18" r="2" /></svg>
                                    </span>
                                    <span><strong>Brand kit</strong><small>{extras.kit ? `Using “${extras.kit.name}”: ${style.heading.font} headline, ${style.offer.font} text` : "vibeMate default look"}</small></span>
                                </summary>
                                <div className="section__body">
                                    <div className="input-group">
                                        <select className="select kit-select" aria-label="Brand kit" value={kitPick || (kits.some((k) => k.id === extras.kit?.id) ? extras.kit.id : "")} onChange={(e) => setKitPick(e.target.value)}>
                                            <option value="" disabled>{kits.length ? "Pick a brand kit" : "No brand kits yet"}</option>
                                            {kits.map((k) => <option key={k.id} value={k.id}>{k.name}{k.isDefault ? " (default)" : ""}</option>)}
                                            <option value="none">vibeMate default look</option>
                                        </select>
                                        <button type="button" className="btn btn--soft" disabled={!kitPick} onClick={() => { applyKit(kitPick); setKitPick(""); }}>Apply</button>
                                    </div>
                                    <small className="field__hint">Applies the kit's fonts, sizes and weights{kits.find((k) => k.id === (kitPick || extras.kit?.id))?.defaults.useColors === false ? "" : " and colours"}. Change kits in <a href={pageLink("setup.html")}>Setup</a>; banners keep the look they were saved with.</small>
                                </div>
                            </details>

                            {/* TEXT */}
                            <details className="section" open>
                                <summary className="section__head">
                                    <span className="section__icon">Aa</span>
                                    <span><strong>Text</strong><small>Headline, offer and button</small></span>
                                </summary>
                                <div className="section__body">
                                    <TextField name="maintext" label="Main text" color="maincolor" placeholder="e.g. Buy ketchup worth ₹2,000" d={d} setField={setField} counter={counter} />
                                    <TextField name="subtext" label="Sub text" color="subcolor" placeholder="e.g. Skincare picks for you" d={d} setField={setField} counter={counter} disabled={subDisabled} />
                                    <TextField name="offercallout" label="Offer callout" color="offercolor" placeholder="e.g. Get up to ₹50 OFF" d={d} setField={setField} counter={counter} disabled={offerDisabled}>
                                        <small className="field__hint">Use sub text <em>or</em> offer callout, not both. Amounts like ₹50 OFF or 20% turn bold by themselves, or mark the bold part **like this**.</small>
                                        <label className="check"><input type="checkbox" checked={extras.tnc !== false}
                                            onChange={(e) => { const on = e.target.checked; updateExtras((x) => { const n = { ...x }; if (on) delete n.tnc; else n.tnc = false; return n; }); markDirty(); }} /> Show “*T&amp;C Apply” with the offer</label>
                                    </TextField>
                                    <TextField name="buttontext" label="Button text" color="buttoncolor" d={d} setField={setField} counter={counter} />

                                    {/* Text background (gradient behind the text) */}
                                    <div className="field">
                                        <div className="field__top">
                                            <span className="field__label">Text background</span>
                                            <span className="patch-info">{patch.info}</span>
                                        </div>
                                        <div className="segmented" role="radiogroup" aria-label="Text background">
                                            {[["auto", "Auto"], ["custom", "Custom"], ["off", "Off"]].map(([k, label]) => (
                                                <label key={k}><input type="radio" name="patchmode" value={k} checked={patchMode === k} onChange={() => setPatchMode(k)} /><span>{label}</span></label>
                                            ))}
                                        </div>
                                        {patchMode === "custom" && (
                                            <div className="patch-custom">
                                                <input className="swatch" type="color" aria-label="Text background colour" title="Text background colour"
                                                    value={extras.patch.color || "#000000"} onChange={(e) => setPatchMode("custom", e.target.value, extras.patch.opacity)} />
                                                <input className="range" type="range" min="0" max="100" step="5" aria-label="Text background strength"
                                                    value={Math.round((extras.patch.opacity ?? 0.55) * 100)} onChange={(e) => setPatchMode("custom", extras.patch.color, Number(e.target.value) / 100)} />
                                                <span className="patch-custom__val">{Math.round((extras.patch.opacity ?? 0.55) * 100)}%</span>
                                            </div>
                                        )}
                                        <small className="field__hint">Auto adds a soft gradient behind the text only when the text would be hard to read. Custom: pick the colour and strength yourself.</small>
                                    </div>
                                </div>
                            </details>

                            {/* PRODUCTS */}
                            <details className="section" open>
                                <summary className="section__head">
                                    <span className="section__icon">
                                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" aria-hidden="true"><path d="M21 8l-9-5-9 5 9 5 9-5zM3 8v8l9 5 9-5V8M12 13v8" /></svg>
                                    </span>
                                    <span><strong>Products</strong><small>Paste image links, auto-placed with a ground shadow</small></span>
                                </summary>
                                <div className="section__body">
                                    {[[1, "left"], [2, "centre (hero)"], [3, "right"]].map(([n, where]) => {
                                        const p = products[n];
                                        return (
                                            <div className="sku" key={n}>
                                                <div className={`sku__thumb${p.status ? " is-" + p.status : ""}`} style={p.status === "ready" && p.src ? { backgroundImage: `url("${p.src}")` } : undefined}><span>{n}</span></div>
                                                <div className="sku__body">
                                                    <label className="field__label" htmlFor={"sku" + n}>SKU {n} <span className="text-muted">· {where}</span></label>
                                                    <div className="sku__input">
                                                        <input className="input" type="url" id={"sku" + n} placeholder="Paste image link" value={d["sku" + n]}
                                                            onChange={(e) => setSku(n, e.target.value)} onBlur={() => loadNow(n)}
                                                            onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); loadNow(n); } }} />
                                                        <button type="button" className="icon-btn" aria-label={`Clear SKU ${n}`} onClick={() => setSku(n, "", 0)}>&times;</button>
                                                    </div>
                                                    <small className={`field__status${p.status === "error" ? " is-error" : p.status === "ready" ? " is-ok" : ""}`}>{p.message}</small>
                                                </div>
                                            </div>
                                        );
                                    })}
                                    <small className="field__hint">Tip: right-click a product photo → <em>Copy image address</em>.</small>
                                </div>
                            </details>

                            {/* BACKGROUND */}
                            <details className="section" open>
                                <summary className="section__head">
                                    <span className="section__icon">
                                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><rect x="3" y="3" width="18" height="18" rx="4" /><path d="M3 15l5-5 4 4 3-3 6 6" /></svg>
                                    </span>
                                    <span><strong>Background</strong><small>Pick a theme or generate one with AI</small></span>
                                </summary>
                                <div className="section__body">
                                    <div className="themes" role="radiogroup" aria-label="Background theme">
                                        {Object.entries(THEMES).map(([key, [a, b]]) => (
                                            <label key={key} title={key[0].toUpperCase() + key.slice(1)}>
                                                <input type="radio" name="background" value={key} checked={d.background === key} onChange={() => setField("background", key)} />
                                                <span style={{ "--a": a, "--b": b }}></span>
                                            </label>
                                        ))}
                                    </div>

                                    {/* AI background */}
                                    <div className="ai-bg">
                                        <div className="ai-bg__head">
                                            <strong>
                                                <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 2l1.9 5.6L19.5 9.5l-5.6 1.9L12 17l-1.9-5.6L4.5 9.5l5.6-1.9zM19 14l.9 2.6 2.6.9-2.6.9L19 21l-.9-2.6-2.6-.9 2.6-.9z" /></svg>
                                                AI background
                                            </strong>
                                            <span className="badge">{(() => { const m = models.find((x) => x.id === modelId); return m ? `${m.free ? "Free" : "Paid"} · ${m.label.split(" · ")[0]}` : "Free · FLUX"; })()}</span>
                                        </div>
                                        <small className="field__hint">Made to match your SKU products above, plus the style tags you add{extras.kit ? " and your brand kit's background style" : ""}.</small>
                                        <div className="field">
                                            <label className="field__label" htmlFor="aiModel">Image model</label>
                                            <select id="aiModel" className="select kit-select" value={modelId} onChange={(e) => chooseModel(e.target.value)} disabled={aiBusy || !models.length}>
                                                {!models.length && <option value="cf-flux">FLUX · Cloudflare</option>}
                                                {models.map((m) => <option key={m.id} value={m.id} disabled={!m.available}>{m.label}{m.free ? " · Free" : " · Paid"}{m.available ? "" : " · not set up"}</option>)}
                                            </select>
                                        </div>
                                        <div className="ai-bg__inputs">
                                            <div className="field">
                                                <label className="field__label" htmlFor="aiTags">Style tags</label>
                                                <input className="input" id="aiTags" placeholder="/cinematic /4k  or your own words" value={aiTags} onChange={(e) => setAiTags(e.target.value)}
                                                    onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); generateAiBackground(); } }} />
                                                <div className="chips" aria-label="Quick tags">
                                                    {QUICK_TAGS.map(([tag, title]) => (
                                                        <button key={tag} type="button" className={`chip${tagActive(tag) ? " is-active" : ""}`} title={title} onClick={() => toggleQuickTag(tag)}>
                                                            <img src={tagImage(tag.slice(1))} alt="" />{tag}
                                                        </button>
                                                    ))}
                                                </div>
                                                <small className="field__hint">Camera angles: one at a time. Products always stand upright, so eye-level, high or low angles suit banners best.</small>
                                            </div>
                                        </div>
                                        <button type="button" className={`btn btn--primary btn--block${aiBusy ? " is-busy" : ""}`} disabled={aiBusy} onClick={generateAiBackground}>{aiBusy ? "Generating…" : "Generate background"}</button>
                                        <small className={`field__status${aiStatus.type ? " is-" + aiStatus.type : ""}`} aria-live="polite">{aiStatus.text}</small>

                                        {/* Generated image: part of the same "background" radio group, so it can be picked like a theme */}
                                        {aiBg.key && (
                                            <label className={`ai-bg__result${aiBg.dataUrl ? "" : " is-loading"}`} title="Use AI background">
                                                <input type="radio" name="background" value={aiBg.key} checked={d.background === aiBg.key} onChange={() => setField("background", aiBg.key)} />
                                                <span style={aiBg.dataUrl ? { backgroundImage: `url("${aiBg.dataUrl}")` } : undefined}></span>
                                            </label>
                                        )}
                                    </div>
                                </div>
                            </details>
                        </div>

                        <div className="panel__actions">
                            <button type="button" className="btn btn--ghost btn--block" onClick={clearBanner}>Reset banner</button>
                        </div>
                    </form>
                </aside>
            </main>
        </>
    );
}

// Manual tab: one text field with its colour swatch and character counter
function TextField({ name, label, color, placeholder, d, setField, counter, disabled = false, children }) {
    return (
        <div className="field">
            <div className="field__top">
                <label className="field__label" htmlFor={name}>{label}</label>
                {counter(name)}
            </div>
            <div className="input-group">
                <input className="input" id={name} name={name} placeholder={placeholder} maxLength={MAX_LEN[name]} disabled={disabled}
                    value={d[name]} onChange={(e) => setField(name, e.target.value)} />
                <input className="swatch" type="color" name={color} value={d[color]} aria-label={`${label} colour`} title={`${label} colour`}
                    onChange={(e) => setField(color, e.target.value)} />
            </div>
            {children}
        </div>
    );
}

const px = (box) => ({ width: box.width + "px", height: box.height + "px", left: box.left + "px", top: box.top + "px" });

const VOICE_RULES = {
    help:     /^(?:help|what can i say|commands)$/,
    apply:    /^(?:apply|apply (?:the |my |all )?(?:edits?|changes?)|apply (?:it|them|that)|do it|go ahead|लागू करो|अप्लाई करो)$/,
    undo:     /^(?:undo|undo (?:that|it|the last edit|last edit)|go back|अनडू|अनडू करो|वापस करो)$/,
    clear:    /^(?:clear|clear (?:all |the )?pins|(?:remove|delete) (?:all |the )?pins)$/,
    unpin:    /^(?:remove|delete) pin (?:number )?(\S+)$/,
    save:     /^(?:save|save (?:it|the banner|my banner|banner|changes)|सेव करो)$/,
    download: /^(?:download|export|save as)(?: (?:it|the banner|banner|this))?(?: (?:as|in))?(?: an?)?(?: (png|jpg|jpeg|pdf))?(?: (?:in |at )?(hd|high quality|standard|normal|small))?$/,
    manual:   /^(?:open |go to |show )?(?:the )?manual(?: tab)?$/,
    pinsTab:  /^(?:open |go to |show )?(?:the )?(?:pins?|pin edits)(?: tab)?$|^edit with pins$/,
    fresh:    /^(?:new banner|start over|create (?:a )?new banner|new from prompt)$/,
    pinEdit:  /^pin (?:number )?(\S+?)[,:.]?\s+(.+)$/i,
    andApply: /[\s,.]*\b(?:and |then )?apply(?: (?:it|them|that|the edits?|the changes?))?(?: now)?$|[\s,.।]*(?:और )?लागू करो$/i
};
const VOICE_SCALE = { hd: "2", "high quality": "2", standard: "1", normal: "1", small: "0.5" };
const VOICE_HELP = "Say what to change, like: make the headline dark green, and apply. Or say pin 2, make it bigger. Other commands: undo, clear pins, save, download PDF.";
