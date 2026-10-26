// =====================================================
// vibeMate 1.1 · setup/SetupPage.jsx   Setup (left sidebar) · brand kits
// A brand kit guides every new guideline banner:
//   Sample images · Voice of tone · Typography (fonts, sizes, weights, colours) · Banner defaults (model, theme, button…)
// Up to 5 kits (MAX_KITS). The default kit is picked first in "New guideline banner".
// =====================================================
import { useCallback, useEffect, useMemo, useState } from "react";
import {
    BACKGROUND_THEMES, BUTTON_SHAPES, DEFAULT_KIT, FONTS, LANGUAGES, MAX_KITS, MAX_KIT_SAMPLES, MAX_SAMPLE_CHARS, SIZE_LIMITS, TONES,
    fontByFamily, fontStack, normalizeKit, toneText
} from "../lib/brandKit.js";
import { createKit, deleteKit, getModels, listKits, saveKit, setDefaultKit } from "../lib/setupApi.js";
import { shrinkImage } from "../lib/api.js";
import { fmtWhen } from "../lib/historyApi.js";
import { ensureFonts } from "../lib/fonts.js";
import { THEMES } from "../editor/layout.js";
import { Toast, useToast } from "../components/Toast.jsx";
import KitPreview from "./KitPreview.jsx";

const TABS = [
    { id: "samples", label: "Sample images" },
    { id: "tone", label: "Voice of tone" },
    { id: "type", label: "Typography" },
    { id: "defaults", label: "Banner defaults" }
];
const TEXT_PARTS = [
    { id: "heading", label: "Headline", hint: "Largest size. Long headlines shrink to fit two or three lines." },
    { id: "sub", label: "Sub text", hint: "The second line when there is no offer." },
    { id: "offer", label: "Offer callout", hint: "Amounts like ₹50 OFF turn bold by themselves." },
    { id: "button", label: "Button", hint: "Call to action at the bottom left." }
];
const KINDS = [...new Set(FONTS.map((f) => f.kind))];
const WEIGHT_NAMES = { 100: "Thin", 200: "Extra light", 300: "Light", 400: "Regular", 500: "Medium", 600: "Semibold", 700: "Bold", 800: "Extra bold", 900: "Black" };

export default function SetupPage() {
    const [toast, showToast] = useToast();
    const [kits, setKits] = useState(null);           // null = loading
    const [max, setMax] = useState(MAX_KITS);
    const [scope, setScope] = useState("user");
    const [loadError, setLoadError] = useState("");
    const [models, setModels] = useState([]);
    const [selected, setSelected] = useState("");      // kit id, or "new" for one not saved yet
    const [draft, setDraft] = useState(null);
    const [dirty, setDirty] = useState(false);
    const [busy, setBusy] = useState("");              // "save" | "delete" | "default"
    const [tab, setTab] = useState("samples");
    const [line, setLine] = useState("offer");
    const [previewImage, setPreviewImage] = useState(-1);   // -1 = theme, 0–2 = a sample image
    const [fontsVersion, setFontsVersion] = useState(0);

    const isNew = selected === "new";
    const full = (kits?.length || 0) >= max;

    // ---------- Load ----------
    const reload = useCallback(async (selectId) => {
        try {
            const res = await listKits();
            setKits(res.kits);
            setMax(res.max || MAX_KITS);
            setScope(res.scope || "user");
            const pick = res.kits.find((k) => k.id === selectId) || res.kits.find((k) => k.isDefault) || res.kits[0];
            if (pick) { setSelected(pick.id); setDraft(normalizeKit(pick)); setDirty(false); }
            else { setSelected("new"); setDraft(normalizeKit({ ...DEFAULT_KIT, name: "bigbasket" })); setDirty(true); }
            setLoadError("");
        } catch (err) {
            setLoadError(err.message);
        }
    }, []);
    useEffect(() => { reload(); }, [reload]);
    useEffect(() => { getModels().then((m) => setModels(m.models || [])).catch(() => setModels([])); }, []);
    // Every font in the pickers can be previewed
    useEffect(() => { ensureFonts(FONTS.map((f) => f.family)).then(() => setFontsVersion((v) => v + 1)); }, []);

    // Warn before leaving with unsaved changes
    useEffect(() => {
        const onLeave = (e) => { if (dirty) e.preventDefault(); };
        window.addEventListener("beforeunload", onLeave);
        return () => window.removeEventListener("beforeunload", onLeave);
    }, [dirty]);

    const askToDrop = () => !dirty || confirm("You have unsaved changes in this brand kit. Leave them?");

    // ---------- Editing ----------
    const edit = (fn) => { setDraft((d) => fn(structuredClone(d))); setDirty(true); };
    const setTone = (patch) => edit((d) => { Object.assign(d.tone, patch); return d; });
    const setDefaults = (patch) => edit((d) => { Object.assign(d.defaults, patch); return d; });
    const setText = (part, patch) => edit((d) => {
        const t = d.typography[part];
        Object.assign(t, patch);
        if (patch.font) {   // keep a weight the new font really has
            const weights = fontByFamily(patch.font).weights;
            if (!weights.includes(t.weight)) t.weight = weights.reduce((a, b) => (Math.abs(b - t.weight) < Math.abs(a - t.weight) ? b : a));
        }
        return d;
    });

    function openKit(kit) {
        if (kit.id === selected || !askToDrop()) return;
        setSelected(kit.id);
        setDraft(normalizeKit(kit));
        setDirty(false);
        setPreviewImage(-1);
    }
    function newKit(copyOf = null) {
        if (full) return showToast(`You can keep up to ${max} brand kits. Delete one to add a new one.`, "error");
        if (!askToDrop()) return;
        const base = copyOf ? { ...copyOf, name: `${copyOf.name} copy`.slice(0, 40) } : { ...DEFAULT_KIT, name: `Brand kit ${(kits?.length || 0) + 1}` };
        setSelected("new");
        setDraft(normalizeKit(base));
        setDirty(true);
        setTab(copyOf ? tab : "samples");
        setPreviewImage(-1);
    }

    async function save() {
        if (!draft.name.trim()) return showToast("Give the brand kit a name first.", "error");
        setBusy("save");
        try {
            const clean = normalizeKit(draft);
            const kit = isNew ? await createKit(clean) : await saveKit(selected, clean);
            await reload(kit.id);
            showToast(isNew ? "Brand kit saved. New guideline banners can use it now." : "Changes saved. New guideline banners follow them.", "success");
        } catch (err) {
            showToast(err.message, "error");
        } finally { setBusy(""); }
    }
    async function remove() {
        if (isNew) { setDirty(false); return reload(); }
        if (!confirm(`Delete the brand kit “${draft.name}”? Banners you already made keep their look.`)) return;
        setBusy("delete");
        try {
            await deleteKit(selected);
            setDirty(false);
            await reload();
            showToast("Brand kit deleted.");
        } catch (err) { showToast(err.message, "error"); } finally { setBusy(""); }
    }
    async function makeDefault() {
        setBusy("default");
        try {
            await setDefaultKit(selected);
            await reload(selected);
            showToast(`“${draft.name}” is now the default brand kit.`, "success");
        } catch (err) { showToast(err.message, "error"); } finally { setBusy(""); }
    }

    // ---------- Sample images ----------
    async function addSamples(files) {
        let list = draft.samples.slice();
        for (const file of files) {
            if (list.length >= MAX_KIT_SAMPLES) { showToast(`Up to ${MAX_KIT_SAMPLES} sample images per brand kit.`, "error"); break; }
            if (!/^image\/(png|jpeg|webp)$/.test(file.type)) { showToast(`“${file.name}” isn't an image (PNG, JPG or WebP).`, "error"); continue; }
            const url = URL.createObjectURL(file);
            try {
                let dataUrl = await shrinkImage(url);
                if (dataUrl.length > MAX_SAMPLE_CHARS) dataUrl = await shrinkImage(url, 380);
                list = [...list, dataUrl];
            } catch { showToast(`Couldn't read “${file.name}”.`, "error"); }
            finally { URL.revokeObjectURL(url); }
        }
        edit((d) => { d.samples = list; return d; });
    }

    const style = draft?.typography;
    const previewBg = previewImage >= 0 && draft?.samples[previewImage] ? draft.samples[previewImage] : "";
    const prompt = useMemo(() => (draft ? toneText(draft) : ""), [draft]);
    const sampleModels = models.filter((m) => m.usesSamples).map((m) => m.label).join(", ") || "FLUX · Cloudflare";

    if (loadError) return <div className="setup"><div className="msgbox">{loadError}</div></div>;
    if (!kits || !draft) return <div className="setup"><div className="setup__loading"><span className="loader__spinner" /></div></div>;

    return (
        <div className="setup">
            <Toast toast={toast} />
            <header className="setup__head">
                <div>
                    <h1>Setup</h1>
                    <p className="text-muted">Brand kits guide every new guideline banner: sample images, voice of tone, fonts and sizes.</p>
                </div>
            </header>

            <div className="setup__info" role="note">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><circle cx="12" cy="12" r="9" /><path d="M12 11v5M12 8h.01" /></svg>
                <p>
                    You can keep up to <strong>{max} brand kits</strong> ({kits.length} of {max} used{scope === "team" ? ", shared with your whole team" : ""}).
                    The <strong>default</strong> kit is picked first when you make a guideline banner. Changes apply to new banners; banners you already made keep their look.
                </p>
            </div>

            <div className="setup__layout">
                {/* ---------- Kit list ---------- */}
                <aside className="kitlist card" aria-label="Brand kits">
                    <div className="kitlist__head">
                        <strong>Brand kits</strong>
                        <span className={`kitlist__count${full ? " is-full" : ""}`}>{kits.length}/{max}</span>
                    </div>
                    <ul className="kitlist__items">
                        {kits.map((k) => (
                            <li key={k.id}>
                                <button type="button" className={`kitlist__item${selected === k.id ? " is-active" : ""}`} onClick={() => openKit(k)}>
                                    <span className="kitlist__swatch" style={{ background: `linear-gradient(120deg, ${THEMES[k.defaults.background][0]}, ${THEMES[k.defaults.background][1]})` }}>
                                        <b style={{ fontFamily: fontStack(k.typography.heading.font), color: k.typography.heading.color }}>Aa</b>
                                    </span>
                                    <span className="kitlist__text">
                                        <strong>{k.name}</strong>
                                        <small>{k.isDefault ? "Default · " : ""}{fmtWhen(k.updatedAt)}</small>
                                    </span>
                                </button>
                            </li>
                        ))}
                        {isNew && (
                            <li><span className="kitlist__item is-active is-new"><span className="kitlist__swatch is-new">+</span><span className="kitlist__text"><strong>{draft.name || "New brand kit"}</strong><small>Not saved yet</small></span></span></li>
                        )}
                    </ul>
                    <button type="button" className="btn btn--soft btn--block" disabled={full || isNew} onClick={() => newKit()}
                        title={full ? `Up to ${max} brand kits. Delete one to add another.` : "Add a brand kit"}>+ New brand kit</button>
                    {full && <p className="kitlist__full">All {max} places are used. Delete a kit to add another.</p>}
                </aside>

                {/* ---------- Editor ---------- */}
                <section className="kitedit card" aria-label="Edit brand kit">
                    <div className="kitedit__top">
                        <div className="field kitedit__name">
                            <label className="field__label" htmlFor="kitName">Brand kit name</label>
                            <input id="kitName" className="input" maxLength={40} value={draft.name} placeholder="e.g. bigbasket · Festive"
                                onChange={(e) => edit((d) => { d.name = e.target.value; return d; })} />
                        </div>
                        <div className="kitedit__actions">
                            {!isNew && (kits.find((k) => k.id === selected)?.isDefault
                                ? <span className="badge">Default kit</span>
                                : <button type="button" className="btn btn--ghost btn--sm" disabled={Boolean(busy) || dirty} title={dirty ? "Save first" : "Pick this kit first in New guideline banner"} onClick={makeDefault}>Make default</button>)}
                            {!isNew && <button type="button" className="btn btn--ghost btn--sm" disabled={full || Boolean(busy)} title={full ? `Up to ${max} brand kits` : "Copy this kit"} onClick={() => newKit(draft)}>Duplicate</button>}
                            <button type="button" className="btn btn--danger btn--sm" disabled={Boolean(busy)} onClick={remove}>{isNew ? "Discard" : "Delete"}</button>
                        </div>
                    </div>

                    <div className="tabs kitedit__tabs" role="tablist">
                        {TABS.map((t) => (
                            <button key={t.id} type="button" role="tab" aria-selected={tab === t.id} className={`tab${tab === t.id ? " is-active" : ""}`} onClick={() => setTab(t.id)}>
                                {t.label}{t.id === "samples" && draft.samples.length ? <span className="tab__count">{draft.samples.length}</span> : null}
                            </button>
                        ))}
                    </div>

                    <div className="kitedit__body">
                        {/* ===== Sample images ===== */}
                        {tab === "samples" && (
                            <div className="kitpane">
                                <p className="field__hint">Add up to {MAX_KIT_SAMPLES} banners or photos that show your look. The AI copies their background style (colours, light, mood), never their text or products.</p>
                                <div className="kitsamples">
                                    {draft.samples.map((src, i) => (
                                        <figure key={i + src.slice(-12)} className="kitsample">
                                            <img src={src} alt={`Sample ${i + 1}`} />
                                            <button type="button" className="kitsample__x" aria-label={`Remove sample ${i + 1}`}
                                                onClick={() => { edit((d) => { d.samples.splice(i, 1); return d; }); setPreviewImage(-1); }}>×</button>
                                            <figcaption>Sample {i + 1}</figcaption>
                                        </figure>
                                    ))}
                                    {draft.samples.length < MAX_KIT_SAMPLES && (
                                        <label className="kitsample is-add">
                                            <input type="file" hidden multiple accept="image/png,image/jpeg,image/webp"
                                                onChange={(e) => { addSamples([...e.target.files]); e.target.value = ""; }} />
                                            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><path d="M12 5v14M5 12h14" /></svg>
                                            <span>Add image</span>
                                            <small>PNG, JPG or WebP</small>
                                        </label>
                                    )}
                                </div>
                                <div className="msgbox kitnote">
                                    Samples are used by <strong>{sampleModels}</strong>. The free Pixazo models work from a text prompt only, so for them describe your look under <button type="button" className="linklike" onClick={() => setTab("defaults")}>Banner defaults → Background style</button>.
                                </div>
                            </div>
                        )}

                        {/* ===== Voice of tone ===== */}
                        {tab === "tone" && (
                            <div className="kitpane">
                                <div className="field">
                                    <span className="field__label">Tone</span>
                                    <div className="tones" role="radiogroup" aria-label="Tone">
                                        {TONES.map((t) => (
                                            <label key={t.id} className={`tone${draft.tone.preset === t.id ? " is-active" : ""}`}>
                                                <input type="radio" name="tone" checked={draft.tone.preset === t.id} onChange={() => setTone({ preset: t.id })} />
                                                <strong>{t.label}</strong>
                                                <small>{t.words}</small>
                                            </label>
                                        ))}
                                    </div>
                                </div>
                                <div className="field">
                                    <span className="field__label">Language</span>
                                    <div className="segmented" role="radiogroup" aria-label="Language">
                                        {LANGUAGES.map((l) => (
                                            <label key={l.id}><input type="radio" name="lang" checked={draft.tone.language === l.id} onChange={() => setTone({ language: l.id })} /><span>{l.label}</span></label>
                                        ))}
                                    </div>
                                </div>
                                <div className="field">
                                    <div className="field__top"><label className="field__label" htmlFor="toneNotes">Voice notes <span className="text-muted">· optional</span></label><span className="field__count">{draft.tone.notes.length ? `${draft.tone.notes.length}/400` : ""}</span></div>
                                    <textarea id="toneNotes" className="textarea" rows={3} maxLength={400} value={draft.tone.notes} onChange={(e) => setTone({ notes: e.target.value })}
                                        placeholder="e.g. Always mention freshness. Use ₹ amounts, not percentages, when both are possible." />
                                </div>
                                <div className="kitgrid2">
                                    <div className="field">
                                        <label className="field__label" htmlFor="toneAudience">Audience <span className="text-muted">· optional</span></label>
                                        <input id="toneAudience" className="input" maxLength={160} value={draft.tone.audience} onChange={(e) => setTone({ audience: e.target.value })} placeholder="e.g. Busy families in Indian cities" />
                                    </div>
                                    <div className="field">
                                        <label className="field__label" htmlFor="toneAvoid">Never say <span className="text-muted">· optional</span></label>
                                        <input id="toneAvoid" className="input" maxLength={200} value={draft.tone.avoid} onChange={(e) => setTone({ avoid: e.target.value })} placeholder="e.g. cheap, hurry, limited stock" />
                                    </div>
                                </div>
                                <div className="kitprompt">
                                    <span className="field__label">What the AI is told</span>
                                    <p>{prompt || "Nothing yet."}</p>
                                    <small className="field__hint">Used when the AI writes the text (“Write a prompt” in New guideline banner). With “Fill in fields” your own words are used exactly as typed.</small>
                                </div>
                            </div>
                        )}

                        {/* ===== Typography ===== */}
                        {tab === "type" && (
                            <div className="kitpane">
                                {TEXT_PARTS.map((part) => {
                                    const t = style[part.id];
                                    const lim = SIZE_LIMITS[part.id];
                                    return (
                                        <section key={part.id} className="typeblock">
                                            <div className="typeblock__title"><strong>{part.label}</strong><small>{part.hint}</small></div>
                                            <div className="typeblock__grid">
                                                <div className="field typeblock__font">
                                                    <label className="field__label" htmlFor={`font-${part.id}`}>Font</label>
                                                    <select id={`font-${part.id}`} className="select" value={t.font} onChange={(e) => setText(part.id, { font: e.target.value })}>
                                                        {KINDS.map((kind) => (
                                                            <optgroup key={kind} label={kind}>
                                                                {FONTS.filter((f) => f.kind === kind).map((f) => <option key={f.family} value={f.family}>{f.family}</option>)}
                                                            </optgroup>
                                                        ))}
                                                    </select>
                                                </div>
                                                <div className="field">
                                                    <label className="field__label" htmlFor={`weight-${part.id}`}>Weight</label>
                                                    <select id={`weight-${part.id}`} className="select" value={t.weight} onChange={(e) => setText(part.id, { weight: Number(e.target.value) })}>
                                                        {fontByFamily(t.font).weights.map((w) => <option key={w} value={w}>{WEIGHT_NAMES[w]} · {w}</option>)}
                                                    </select>
                                                </div>
                                                <div className="field">
                                                    <label className="field__label" htmlFor={`color-${part.id}`}>{part.id === "button" ? "Button colour" : "Colour"}</label>
                                                    <input id={`color-${part.id}`} className="swatch" type="color" value={part.id === "button" ? t.bg : t.color}
                                                        onChange={(e) => setText(part.id, part.id === "button" ? { bg: e.target.value } : { color: e.target.value })} />
                                                </div>
                                                <div className="field typeblock__size">
                                                    <div className="field__top"><label className="field__label" htmlFor={`size-${part.id}`}>{part.id === "heading" ? "Size (largest)" : "Size"}</label><span className="typeblock__val">{t.size}px</span></div>
                                                    <input id={`size-${part.id}`} className="range" type="range" min={lim.min} max={lim.max} step="1" value={t.size} onChange={(e) => setText(part.id, { size: Number(e.target.value) })} />
                                                </div>
                                            </div>
                                            {part.id === "heading" && (
                                                <div className="typeblock__extra">
                                                    <label className="check"><input type="checkbox" checked={t.uppercase} onChange={(e) => setText("heading", { uppercase: e.target.checked })} /> ALL CAPS</label>
                                                    <div className="field typeblock__lh">
                                                        <div className="field__top"><label className="field__label" htmlFor="lh">Line height</label><span className="typeblock__val">{t.lineHeight.toFixed(2)}</span></div>
                                                        <input id="lh" className="range" type="range" min="0.85" max="1.5" step="0.01" value={t.lineHeight} onChange={(e) => setText("heading", { lineHeight: Number(e.target.value) })} />
                                                    </div>
                                                </div>
                                            )}
                                            {part.id === "button" && (
                                                <div className="typeblock__extra">
                                                    <label className="check"><input type="checkbox" checked={t.color === "auto"} onChange={(e) => setText("button", { color: e.target.checked ? "auto" : "#ffffff" })} /> Text colour: automatic</label>
                                                    {t.color !== "auto" && <input className="swatch" type="color" aria-label="Button text colour" value={t.color} onChange={(e) => setText("button", { color: e.target.value })} />}
                                                    <div className="segmented" role="radiogroup" aria-label="Button shape">
                                                        {BUTTON_SHAPES.map((s) => (
                                                            <label key={s.id}><input type="radio" name="shape" checked={t.shape === s.id} onChange={() => setText("button", { shape: s.id })} /><span>{s.label}</span></label>
                                                        ))}
                                                    </div>
                                                </div>
                                            )}
                                            <p className="typeblock__sample" style={{ fontFamily: fontStack(t.font), fontWeight: t.weight, textTransform: part.id === "heading" && t.uppercase ? "uppercase" : "none" }}>
                                                {part.id === "heading" ? "Fresh deals every day" : part.id === "button" ? "Shop now" : "Get up to ₹50 OFF · ताज़ा"}
                                            </p>
                                        </section>
                                    );
                                })}
                            </div>
                        )}

                        {/* ===== Banner defaults ===== */}
                        {tab === "defaults" && (
                            <div className="kitpane">
                                <div className="field">
                                    <label className="field__label" htmlFor="defModel">Image model</label>
                                    <select id="defModel" className="select kitselect" value={draft.defaults.model} onChange={(e) => setDefaults({ model: e.target.value })}>
                                        <option value="">Last one used (or the app default)</option>
                                        {models.map((m) => (
                                            <option key={m.id} value={m.id} disabled={!m.available}>{m.label}{m.free ? " · Free" : " · Paid"}{m.available ? "" : " · not set up"}</option>
                                        ))}
                                    </select>
                                    <small className="field__hint">{models.find((m) => m.id === draft.defaults.model)?.note || "You can still change the model in New guideline banner."}</small>
                                </div>
                                <div className="field">
                                    <span className="field__label">Background theme <span className="text-muted">· used when no AI background is made</span></span>
                                    <div className="themes" role="radiogroup" aria-label="Background theme">
                                        {BACKGROUND_THEMES.map((key) => (
                                            <label key={key} title={key[0].toUpperCase() + key.slice(1)}>
                                                <input type="radio" name="kitTheme" checked={draft.defaults.background === key} onChange={() => setDefaults({ background: key })} />
                                                <span style={{ "--a": THEMES[key][0], "--b": THEMES[key][1] }}></span>
                                            </label>
                                        ))}
                                    </div>
                                </div>
                                <div className="field">
                                    <div className="field__top"><label className="field__label" htmlFor="bgStyle">Background style</label><span className="field__count">{draft.defaults.bgStyle.length ? `${draft.defaults.bgStyle.length}/300` : ""}</span></div>
                                    <textarea id="bgStyle" className="textarea" rows={2} maxLength={300} value={draft.defaults.bgStyle} onChange={(e) => setDefaults({ bgStyle: e.target.value })}
                                        placeholder="e.g. soft pastel studio, warm morning light, light wooden surfaces, fresh green leaves" />
                                    <small className="field__hint">Added to every AI background, with every model.</small>
                                </div>
                                <div className="kitgrid2">
                                    <div className="field">
                                        <label className="field__label" htmlFor="defButton">Button text</label>
                                        <input id="defButton" className="input" maxLength={18} value={draft.defaults.buttontext} onChange={(e) => setDefaults({ buttontext: e.target.value })} />
                                    </div>
                                    <div className="field">
                                        <span className="field__label">Text background</span>
                                        <div className="segmented" role="radiogroup" aria-label="Text background">
                                            {[["auto", "Auto"], ["off", "Off"]].map(([k, label]) => (
                                                <label key={k}><input type="radio" name="kitPatch" checked={draft.defaults.patch === k} onChange={() => setDefaults({ patch: k })} /><span>{label}</span></label>
                                            ))}
                                        </div>
                                    </div>
                                </div>
                                <label className="check"><input type="checkbox" checked={draft.defaults.useColors} onChange={(e) => setDefaults({ useColors: e.target.checked })} /> Use the brand colours from Typography for the text and button</label>
                                <label className="check"><input type="checkbox" checked={draft.defaults.tnc} onChange={(e) => setDefaults({ tnc: e.target.checked })} /> Show *T&amp;C Apply with offers</label>
                            </div>
                        )}
                    </div>

                    <footer className="kitedit__foot">
                        <span className="save-state" data-state={dirty ? "dirty" : "saved"}>{dirty ? (isNew ? "Not saved yet" : "Unsaved changes") : "All changes saved"}</span>
                        {dirty && !isNew && <button type="button" className="btn btn--ghost" disabled={Boolean(busy)} onClick={() => { setDraft(normalizeKit(kits.find((k) => k.id === selected))); setDirty(false); }}>Undo changes</button>}
                        <button type="button" className={`btn btn--primary${busy === "save" ? " is-busy" : ""}`} disabled={!dirty || Boolean(busy)} onClick={save}>{busy === "save" ? "Saving…" : isNew ? "Save brand kit" : "Save changes"}</button>
                    </footer>
                </section>

                {/* ---------- Live preview ---------- */}
                <aside className="kitpreview card" aria-label="Preview">
                    <div className="kitpreview__head">
                        <strong>Preview</strong>
                        <div className="segmented segmented--sm" role="radiogroup" aria-label="Second line">
                            {[["offer", "Offer"], ["sub", "Sub text"]].map(([k, label]) => (
                                <label key={k}><input type="radio" name="pline" checked={line === k} onChange={() => setLine(k)} /><span>{label}</span></label>
                            ))}
                        </div>
                    </div>
                    <KitPreview style={style} background={draft.defaults.background} image={previewBg} line={line}
                        buttontext={draft.defaults.buttontext} tnc={draft.defaults.tnc} fontsVersion={fontsVersion} />
                    {draft.samples.length > 0 && (
                        <div className="kitpreview__bgs">
                            <span className="text-muted">Try on</span>
                            <button type="button" className={`chip${previewImage < 0 ? " is-active" : ""}`} onClick={() => setPreviewImage(-1)}>Theme</button>
                            {draft.samples.map((_, i) => (
                                <button key={"bg" + i} type="button" className={`chip${previewImage === i ? " is-active" : ""}`} onClick={() => setPreviewImage(i)}>Sample {i + 1}</button>
                            ))}
                        </div>
                    )}
                    <p className="field__hint">Guideline banner 1360 × 800. Product places are shown as outlines.</p>
                </aside>
            </div>
        </div>
    );
}
