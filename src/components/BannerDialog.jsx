// =====================================================
// vibeMate 1.1 · BannerDialog.jsx   "New guideline banner" pop-up (Image studio)
//   Fill in fields (default): your exact text, the AI only paints the background
//   Write a prompt:           the AI writes the text from your brief
//   + 3 product image links, a background idea, style tags, up to 3 sample banners
//   1.1: Brand kit dropdown (Setup page, up to 5) + Image model dropdown (FLUX or Pixazo)
// Generate -> the server (routes/ai.js) makes the banner with the brand kit -> saved in MongoDB -> the editor opens it.
// =====================================================
import { useEffect, useRef, useState } from "react";
import { HANDOFF_KEY, ensureBackend } from "../lib/config.js";
import { loadImage, shrinkImage, store, uid } from "../lib/api.js";
import { createBanner, pageLink } from "../lib/historyApi.js";
import { generateGuideline, getModels, lastKit, listKits, pickModel, rememberKit, rememberModel } from "../lib/setupApi.js";
import { TAGS, tagById, tagImage } from "../lib/tags.js";
import { KEYS } from "../home/constants.jsx";
import { Attachment } from "./PromptComposer.jsx";

const EMPTY = { main: "", line: "", button: "Shop now", idea: "", brief: "", skus: ["", "", ""] };
const NO_KIT = "none";

export default function BannerDialog({ onClose, toast }) {
    const [gmode, setGmodeRaw] = useState(store.get(KEYS.gmode, "fields") === "prompt" ? "prompt" : "fields");
    const [gline, setGline] = useState("offer");
    const [f, setF] = useState(EMPTY);
    const [tags, setTags] = useState([]);
    const [samples, setSamples] = useState([]);       // { id, name, dataUrl, status, kind:"image" }
    const [making, setMaking] = useState("");          // progress text while generating
    const [error, setError] = useState("");
    const [kits, setKits] = useState(null);           // null = loading
    const [kitId, setKitId] = useState("");
    const [models, setModels] = useState([]);
    const [modelId, setModelId] = useState("");
    const fileRef = useRef(null);
    const firstRef = useRef(null);
    const buttonTouched = useRef(false);
    const set = (patch) => { setF((x) => ({ ...x, ...patch })); setError(""); };
    const setGmode = (m) => { setGmodeRaw(m); store.set(KEYS.gmode, m); setError(""); };

    useEffect(() => { setTimeout(() => firstRef.current?.focus(), 50); }, [gmode]);

    // Brand kits + image models (the default kit is picked first, or the one used last time)
    useEffect(() => {
        let live = true;
        Promise.all([listKits().catch(() => ({ kits: [] })), getModels().catch(() => ({ models: [], default: "cf-flux" }))]).then(([k, m]) => {
            if (!live) return;
            const list = k.kits || [];
            const first = list.find((x) => x.id === lastKit()) || list.find((x) => x.isDefault) || list[0] || null;
            setKits(list);
            setKitId(first ? first.id : NO_KIT);
            setModels(m.models || []);
            setModelId(pickModel(m.models || [], first, m.default));
            if (first && !buttonTouched.current) setF((x) => ({ ...x, button: first.defaults.buttontext || x.button }));
        });
        return () => { live = false; };
    }, []);
    const kit = kits?.find((k) => k.id === kitId) || null;
    const model = models.find((m) => m.id === modelId) || null;
    function chooseKit(id) {
        setKitId(id);
        rememberKit(id);
        const next = kits.find((k) => k.id === id);
        if (next?.defaults?.model && models.some((m) => m.id === next.defaults.model && m.available)) setModelId(next.defaults.model);
        if (next && !buttonTouched.current) set({ button: next.defaults.buttontext || "Shop now" });
    }
    function chooseModel(id) { setModelId(id); rememberModel(id); }
    useEffect(() => {
        const onKey = (e) => { if (e.key === "Escape" && !making) onClose(); };
        document.addEventListener("keydown", onKey);
        return () => document.removeEventListener("keydown", onKey);
    }, [making, onClose]);

    function toggleTag(id) {
        const tag = tagById(id);
        setTags((list) => {
            if (list.includes(id)) return list.filter((t) => t !== id);
            const rest = tag.group === "angle" ? list.filter((t) => tagById(t)?.group !== "angle") : list;   // one camera angle at a time
            return [...rest, id];
        });
    }

    async function addSamples(list) {
        for (const file of list) {
            if (!/^image\/(png|jpeg|webp)$/.test(file.type)) { toast(`“${file.name}” isn't an image (PNG, JPG or WebP).`, "error"); continue; }
            if (samples.length >= 3) { toast("Up to 3 sample banners.", "error"); break; }
            const id = uid();
            setSamples((s) => [...s, { id, kind: "image", name: file.name, dataUrl: "", status: "reading" }]);
            const url = URL.createObjectURL(file);
            try {
                const dataUrl = await shrinkImage(url);
                setSamples((s) => s.map((x) => (x.id === id ? { ...x, dataUrl, status: "ready" } : x)));
            } catch {
                setSamples((s) => s.filter((x) => x.id !== id));
                toast(`Couldn't read “${file.name}”.`, "error");
            } finally { URL.revokeObjectURL(url); }
        }
    }

    const links = f.skus.map((s) => s.trim());
    const ready = gmode === "fields" ? f.main.trim() !== "" : Boolean(f.brief.trim() || links.some(Boolean));

    async function generate(e) {
        e?.preventDefault();
        if (making) return;
        if (gmode === "fields" && !f.main.trim()) { setError("Write the main text first."); return firstRef.current?.focus(); }
        if (gmode === "prompt" && !ready) { setError("Describe the banner, or add at least one product link."); return firstRef.current?.focus(); }
        if (links.some((l) => l && !/^https?:\/\//i.test(l))) return setError("Product links must be full links starting with https://");
        if (samples.some((s) => s.status === "reading")) return setError("One moment, the sample images are still loading.");

        const fields = gmode === "fields" ? {
            maintext: f.main.trim(),
            subtext: gline === "sub" ? f.line.trim() : "",
            offercallout: gline === "offer" ? f.line.trim() : "",
            buttontext: f.button.trim() || "Shop now"
        } : null;
        const lookAtSamples = (samples.length || kit?.samples?.length) && model?.usesSamples;
        const painter = model ? `Painting the background with ${model.label}…` : "Painting the background…";
        const steps = fields
            ? [kit ? `Applying “${kit.name}”…` : "Placing your text…", lookAtSamples ? "Looking at your samples…" : "Planning the background…", painter, "Saving your banner…", "Almost there…"]
            : ["Reading your brief…", kit ? `Writing in the “${kit.name}” voice…` : "Writing the text…", lookAtSamples ? "Looking at your samples…" : "Choosing colours…", painter, "Almost there…"];
        let i = 0;
        setMaking(steps[0]);
        setError("");
        const ticker = setInterval(() => { i = Math.min(i + 1, steps.length - 1); setMaking(steps[i]); }, 6000);
        try {
            // Apps Script is used for FLUX, and for the text in "Write a prompt"
            if (!model || model.provider === "apps-script" || !fields) await ensureBackend();
            const data = await generateGuideline({
                model: modelId,
                kitId: kitId || NO_KIT,
                prompt: fields ? f.idea.trim() : f.brief.trim(),
                ...(fields ? { fields } : {}),
                skus: { sku1: links[0], sku2: links[1], sku3: links[2] },
                samples: samples.filter((s) => s.status === "ready").map((s) => s.dataUrl),
                tags: tags.map((t) => "/" + t).join(" ")
            });
            if (!data?.banner) throw new Error(data?.error || "No banner came back. Please try again.");

            // Save it in MongoDB straight away (History shows it), then open the editor
            setMaking("Saving your banner…");
            let id = "";
            let warning = data.warning || "";
            try {
                id = (await createBanner(data.banner, await thumbFrom(data.dataUrl))).id;
            } catch (err) {
                warning = [warning, `It isn't saved yet (${err.message}). Press Save in the editor to keep it.`].filter(Boolean).join(" ");
            }
            try {
                sessionStorage.setItem(HANDOFF_KEY, JSON.stringify({ id, banner: data.banner, dataUrl: data.dataUrl, warning, saved: Boolean(id) }));
            } catch { /* too big for this browser: the editor loads it from the server instead */ }
            clearInterval(ticker);
            setMaking("Done ✓ Opening the editor…");
            location.href = id ? `bannercreation.html?id=${encodeURIComponent(id)}` : "bannercreation.html?new=1";
        } catch (err) {
            console.error("Guideline banner:", err);
            clearInterval(ticker);
            setMaking("");
            setError(err.message || "Couldn't generate. Please try again.");
        }
    }

    return (
        <div className="dialog" role="dialog" aria-modal="true" aria-labelledby="bdTitle" onMouseDown={(e) => { if (e.target === e.currentTarget && !making) onClose(); }}>
            <form className="dialog__box bd" onSubmit={generate} noValidate>
                <header className="dialog__head">
                    <div>
                        <h2 id="bdTitle">New guideline banner</h2>
                        <p className="text-muted">1360 × 800 · headline, offer and button on the left, up to 3 products on the right</p>
                    </div>
                    <button type="button" className="dialog__x" aria-label="Close" onClick={onClose} disabled={Boolean(making)}>×</button>
                </header>

                <div className="dialog__body">
                    <div className="bd__pickers">
                        <div className="field">
                            <div className="field__top">
                                <label className="field__label" htmlFor="bdKit">Brand kit</label>
                                <a className="field__link" href={pageLink("setup.html")}>{kits?.length ? "Edit in Setup" : "Set up"}</a>
                            </div>
                            {kits === null ? <div className="input bd__loading">Loading…</div> : kits.length > 1 ? (
                                <select id="bdKit" className="select bd__select" value={kitId} onChange={(e) => chooseKit(e.target.value)} disabled={Boolean(making)}>
                                    {kits.map((k) => <option key={k.id} value={k.id}>{k.name}{k.isDefault ? " (default)" : ""}</option>)}
                                    <option value={NO_KIT}>No brand kit · vibeMate default look</option>
                                </select>
                            ) : kits.length === 1 ? (
                                <select id="bdKit" className="select bd__select" value={kitId} onChange={(e) => chooseKit(e.target.value)} disabled={Boolean(making)}>
                                    <option value={kits[0].id}>{kits[0].name}</option>
                                    <option value={NO_KIT}>No brand kit · vibeMate default look</option>
                                </select>
                            ) : (
                                <div className="input bd__loading">No brand kit yet · default look</div>
                            )}
                            <small className="field__hint">{kit ? kitSummary(kit) : "Fonts, sizes, tone and samples come from a brand kit. Add up to 5 in Setup."}</small>
                        </div>
                        <div className="field">
                            <label className="field__label" htmlFor="bdModel">Image model</label>
                            <select id="bdModel" className="select bd__select" value={modelId} onChange={(e) => chooseModel(e.target.value)} disabled={Boolean(making) || !models.length}>
                                {!models.length && <option value="">FLUX · Cloudflare</option>}
                                {models.map((m) => (
                                    <option key={m.id} value={m.id} disabled={!m.available}>{m.label}{m.free ? " · Free" : " · Paid"}{m.available ? "" : " · not set up"}</option>
                                ))}
                            </select>
                            <small className="field__hint">{model ? model.note : "Paints the background."}{model && !model.usesSamples && (samples.length || kit?.samples?.length) ? " Sample images are skipped with this model." : ""}</small>
                        </div>
                    </div>

                    <div className="segmented bd__modes" role="radiogroup" aria-label="How to write the text">
                        <label><input type="radio" name="bdmode" checked={gmode === "fields"} onChange={() => setGmode("fields")} /><span>Fill in fields</span></label>
                        <label><input type="radio" name="bdmode" checked={gmode === "prompt"} onChange={() => setGmode("prompt")} /><span>Write a prompt</span></label>
                    </div>

                    {gmode === "fields" ? (
                        <div className="bd__grid">
                            <div className="field bd__wide">
                                <div className="field__top"><label className="field__label" htmlFor="bdMain">Main text <span className="bd__req">required</span></label><Count v={f.main} max={60} /></div>
                                <input ref={firstRef} id="bdMain" className="input" maxLength={60} placeholder="e.g. Buy ketchup worth ₹2,000" value={f.main} onChange={(e) => set({ main: e.target.value })} />
                            </div>
                            <div className="field">
                                <div className="field__top">
                                    <span className="bd__switch" role="radiogroup" aria-label="Second line">
                                        {[["offer", "Offer"], ["sub", "Sub text"]].map(([k, label]) => (
                                            <button key={k} type="button" role="radio" aria-checked={gline === k}
                                                onClick={() => { setGline(k); if (k === "offer" && f.line.length > 40) set({ line: f.line.slice(0, 40) }); }}>{label}</button>
                                        ))}
                                    </span>
                                    <Count v={f.line} max={gline === "sub" ? 50 : 40} />
                                </div>
                                <input id="bdLine" className="input" maxLength={gline === "sub" ? 50 : 40} value={f.line} onChange={(e) => set({ line: e.target.value })}
                                    placeholder={gline === "sub" ? "e.g. Fresh picks for your kitchen" : "e.g. Get up to ₹50 OFF"} />
                            </div>
                            <div className="field">
                                <div className="field__top"><label className="field__label" htmlFor="bdButton">Button text</label><Count v={f.button} max={18} /></div>
                                <input id="bdButton" className="input" maxLength={18} value={f.button} onChange={(e) => { buttonTouched.current = true; set({ button: e.target.value }); }} />
                            </div>
                        </div>
                    ) : (
                        <div className="field">
                            <label className="field__label" htmlFor="bdBrief">Describe the banner</label>
                            <textarea ref={firstRef} id="bdBrief" className="textarea" rows={3} maxLength={1500} value={f.brief} onChange={(e) => set({ brief: e.target.value })}
                                placeholder="e.g. Buy ketchup worth ₹2,000 and get up to ₹50 off, warm kitchen feel" />
                            <small className="field__hint">The AI writes the headline, offer and button{kit ? ` in the “${kit.name}” voice` : ""}. You can change every word in the editor.</small>
                        </div>
                    )}

                    <div className="field">
                        <span className="field__label">Products <span className="text-muted">· image links, optional</span></span>
                        <div className="bd__products">
                            {["left", "hero, centre", "right"].map((where, i) => (
                                <ProductLink key={i} n={i + 1} where={where} value={f.skus[i]}
                                    onChange={(v) => set({ skus: f.skus.map((s, j) => (j === i ? v : s)) })} />
                            ))}
                        </div>
                        <small className="field__hint">Tip: right-click a product photo → <em>Copy image address</em>.</small>
                    </div>

                    {gmode === "fields" && (
                        <div className="field">
                            <label className="field__label" htmlFor="bdIdea">Background idea <span className="text-muted">· optional</span></label>
                            <input id="bdIdea" className="input" maxLength={600} value={f.idea} onChange={(e) => set({ idea: e.target.value })}
                                placeholder="e.g. warm wooden kitchen table, soft window light" />
                            {kit?.defaults?.bgStyle && <small className="field__hint">Brand kit style is added too: “{kit.defaults.bgStyle}”</small>}
                        </div>
                    )}

                    <div className="field">
                        <span className="field__label">Style <span className="text-muted">· optional, one camera angle at a time</span></span>
                        <div className="chips">
                            {TAGS.map((t) => (
                                <button key={t.id} type="button" className={`chip${tags.includes(t.id) ? " is-active" : ""}`} title={t.desc} onClick={() => toggleTag(t.id)}>
                                    <img src={tagImage(t.id)} alt="" />/{t.id}
                                </button>
                            ))}
                        </div>
                    </div>

                    <div className="field">
                        <span className="field__label">Sample banners <span className="text-muted">· optional, up to 3, the background follows their style</span></span>
                        {!samples.length && kit?.samples?.length > 0 && (
                            <div className="bd__kitsamples">
                                {kit.samples.map((src, i) => <img key={i} src={src} alt="" />)}
                                <span>Using {kit.samples.length} sample{kit.samples.length === 1 ? "" : "s"} from “{kit.name}”. Add your own to use those instead.</span>
                            </div>
                        )}
                        <div className="bd__samples">
                            {samples.map((s) => <Attachment key={s.id} f={s} badge="Sample" onRemove={() => setSamples((x) => x.filter((y) => y.id !== s.id))} />)}
                            {samples.length < 3 && (
                                <button type="button" className="bd__add" onClick={() => fileRef.current.click()}>
                                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M12 5v14M5 12h14" /></svg>
                                    Add
                                </button>
                            )}
                            <input ref={fileRef} type="file" hidden multiple accept="image/png,image/jpeg,image/webp"
                                onChange={(e) => { addSamples([...e.target.files]); e.target.value = ""; }} />
                        </div>
                    </div>
                </div>

                <footer className="dialog__foot">
                    <p className="dialog__error" role="alert">{error}</p>
                    <button type="button" className="btn btn--ghost" onClick={onClose} disabled={Boolean(making)}>Cancel</button>
                    <button type="submit" className="btn btn--primary" disabled={!ready || Boolean(making)}>Generate banner</button>
                </footer>

                {making && (
                    <div className="making">
                        <div className="making__art"><i></i><i></i><i></i></div>
                        <p className="making__step">{making}</p>
                        <p className="making__note">This takes about 20–40 seconds{model ? ` with ${model.label}` : ""}. The editor opens by itself.</p>
                    </div>
                )}
            </form>
        </div>
    );
}

function kitSummary(kit) {
    const t = kit.typography;
    return `${t.heading.font} ${t.heading.size}px headline · ${t.offer.font} ${t.offer.size}px · ${kit.tone.preset} tone` + (kit.samples.length ? ` · ${kit.samples.length} sample${kit.samples.length === 1 ? "" : "s"}` : "");
}

const Count = ({ v, max }) => <span className={`field__count${v.length >= max ? " is-limit" : ""}`}>{v.length ? `${v.length}/${max}` : ""}</span>;

// One product link with a thumbnail preview (loads 400 ms after typing stops)
function ProductLink({ n, where, value, onChange }) {
    const [thumb, setThumb] = useState({ state: "", url: "", title: "" });
    useEffect(() => {
        const url = value.trim();
        if (!url) { setThumb({ state: "", url: "", title: "" }); return; }
        if (!/^https?:\/\//i.test(url)) { setThumb({ state: "error", url: "", title: "Paste a full link starting with https://" }); return; }
        let live = true;
        const t = setTimeout(() => {
            const img = new Image();
            img.onload = () => live && setThumb({ state: "ready", url, title: "" });
            img.onerror = () => live && setThumb({ state: "", url: "", title: "No preview here. The editor will still try to load it." });
            img.src = url;
        }, 400);
        return () => { live = false; clearTimeout(t); };
    }, [value]);
    return (
        <label className="product" data-slot={n}>
            <span className={`product__thumb${thumb.state ? " is-" + thumb.state : ""}`} title={thumb.title}
                style={thumb.url ? { backgroundImage: `url("${thumb.url}")` } : undefined}><b>{n}</b></span>
            <span className="product__body">
                <span className="product__label">Product {n} <em>{where}</em></span>
                <input className="product__input" type="url" placeholder="Paste image link" value={value} onChange={(e) => onChange(e.target.value)} />
            </span>
        </label>
    );
}

// A small preview for History (the editor replaces it with the finished banner on the first save)
async function thumbFrom(dataUrl) {
    if (!dataUrl) return "";
    try {
        const img = await loadImage(dataUrl);
        const c = document.createElement("canvas");
        c.width = 272;
        c.height = 160;
        const s = Math.max(c.width / img.naturalWidth, c.height / img.naturalHeight);
        c.getContext("2d").drawImage(img, (c.width - img.naturalWidth * s) / 2, (c.height - img.naturalHeight * s) / 2, img.naturalWidth * s, img.naturalHeight * s);
        return c.toDataURL("image/jpeg", 0.72);
    } catch { return ""; }
}
