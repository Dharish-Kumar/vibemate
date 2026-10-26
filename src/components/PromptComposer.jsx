// =====================================================
// vibeMate 3.2 · PromptComposer.jsx   The message box
//   Create anything: message, attachments (images + documents), voice, send
//   Image studio:    + style tags (/ menu and gallery) and the image size
// =====================================================
import { useEffect, useImperativeHandle, useLayoutEffect, useRef, useState } from "react";
import { fmtBytes, fmtSize } from "../lib/api.js";
import { TAGS, tagById, tagImage } from "../lib/tags.js";
import { DOC_TYPES, SIZES, ratioBox } from "../home/constants.jsx";
import { MicIcon, SpeakToggle, VoiceLangSelect } from "./VoiceControls.jsx";

export default function PromptComposer(p) {
    const { apiRef, inputRef, mode, prompt, placeholder, tags, files, focus, size, sendDisabled, busy, voice, hasThread } = p;
    const isImage = mode === "image";
    const composerRef = useRef(null);
    const fileRef = useRef(null);
    const caretRef = useRef(null);           // caret to restore after a programmatic change
    const [pop, setPop] = useState(null);    // "gallery" | "size" | "voice" | null
    const [place, setPlace] = useState({ up: true, max: 600 });
    const [slash, setSlash] = useState({ open: false, items: [], index: 0, start: -1, q: "" });
    const [drop, setDrop] = useState(false);

    const closePops = () => { setPop(null); setSlash((s) => (s.open ? { ...s, open: false } : s)); };
    useImperativeHandle(apiRef, () => ({ closePops }));
    useEffect(() => { closePops(); }, [mode]);

    // Open a pop-up above or below the composer, whichever side has more room
    function measure(kind) {
        const r = composerRef.current.getBoundingClientRect();
        const above = r.top - 16, below = innerHeight - r.bottom - 16;
        const up = above >= below;
        const cap = kind === "slash" ? 340 : 600;
        setPlace({ up, max: Math.min(cap, Math.max(180, up ? above : below)) });
    }
    function togglePop(name) {
        if (pop === name) return setPop(null);
        setSlash((s) => ({ ...s, open: false }));
        measure(name);
        setPop(name);
    }

    // Outside click closes the pop-ups
    useEffect(() => {
        const onClick = (e) => { if (!e.target.closest(".pop, [data-pop-btn], #prompt")) closePops(); };
        document.addEventListener("click", onClick);
        return () => document.removeEventListener("click", onClick);
    }, []);

    // Grow the message box with its text; put the caret back after a tag was picked
    useLayoutEffect(() => {
        const box = inputRef.current;
        if (!box) return;
        box.style.height = "auto";
        box.style.height = Math.min(box.scrollHeight, isImage ? 200 : 280) + "px";
        if (caretRef.current !== null) { box.setSelectionRange(caretRef.current, caretRef.current); caretRef.current = null; }
    }, [prompt, inputRef, isImage]);

    // ---------- Slash menu (Image studio only): "/cin" before the caret -> tags filtered by "cin" ----------
    function checkSlash(value, caret) {
        if (!isImage) return;
        const before = value.slice(0, caret);
        const m = before.match(/(^|\s)\/([a-z0-9]*)$/i);
        if (!m) return setSlash((s) => (s.open ? { ...s, open: false } : s));
        const q = m[2].toLowerCase();
        // Best matches first: name starts with the letters, then name contains them, then the description does
        const score = (t) => {
            const name = t.id + " " + t.label.toLowerCase().replace(/\s/g, "");
            if (!q) return 1;
            if (t.id.startsWith(q) || t.label.toLowerCase().startsWith(q)) return 3;
            if (name.includes(q)) return 2;
            return q.length > 1 && t.desc.toLowerCase().includes(q) ? 1 : 0;
        };
        const items = TAGS.map((t) => [t, score(t)]).filter(([, s]) => s > 0).sort((a, b) => b[1] - a[1]).map(([t]) => t);
        if (!slash.open) { setPop(null); measure("slash"); }
        setSlash({ open: true, items, index: 0, start: before.length - m[2].length - 1, q });
    }
    function pickSlash(i) {
        const t = slash.items[i];
        if (!t) return;
        const box = inputRef.current;
        const end = box.selectionStart;
        let value = prompt.slice(0, slash.start) + prompt.slice(end).replace(/^\s+/, slash.start > 0 ? " " : "");
        value = value.replace(/\s{2,}/g, " ");
        caretRef.current = Math.min(slash.start, value.length);
        p.onSetPrompt(value);
        p.onAddTag(t.id);
        setSlash((s) => ({ ...s, open: false }));
        box.focus();
    }

    function onInput(e) {
        p.onPrompt(e.target.value);
        checkSlash(e.target.value, e.target.selectionStart);
    }
    function onKeyDown(e) {
        if (slash.open && slash.items.length) {
            if (e.key === "ArrowDown") { e.preventDefault(); return setSlash((s) => ({ ...s, index: (s.index + 1) % s.items.length })); }
            if (e.key === "ArrowUp") { e.preventDefault(); return setSlash((s) => ({ ...s, index: (s.index - 1 + s.items.length) % s.items.length })); }
            if (e.key === "Enter" || e.key === "Tab") { e.preventDefault(); return pickSlash(slash.index); }
        }
        if (e.key === "Escape" && slash.open) { e.preventDefault(); return setSlash((s) => ({ ...s, open: false })); }
        if (isImage && e.key === "Backspace" && !e.target.value && tags.length) { p.onRemoveTag(tags[tags.length - 1]); return; }
        if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); p.onSubmit(); }
    }

    // ---------- Paste / drop files ----------
    const onPaste = (e) => {
        const list = [...(e.clipboardData?.files || [])];
        if (list.length) { e.preventDefault(); p.onAddFiles(list); }
    };
    const dragOn = (e) => { e.preventDefault(); setDrop(true); };
    const onDrop = (e) => { e.preventDefault(); setDrop(false); p.onAddFiles([...e.dataTransfer.files]); };

    const r = ratioBox(size.w, size.h);

    return (
        <div className={`dock dock--${mode}`}>
            <form ref={composerRef} className={`composer${drop ? " is-drop" : ""}`} autoComplete="off" noValidate
                onSubmit={(e) => p.onSubmit(e)} onPaste={onPaste}
                onDragEnter={dragOn} onDragOver={dragOn} onDragLeave={() => setDrop(false)} onDrop={onDrop}>

                {/* Attached images and documents */}
                {files.length > 0 && (
                    <div className="tray">
                        {files.map((f) => <Attachment key={f.id} f={f} onRemove={() => p.onRemoveFile(f.id)} />)}
                    </div>
                )}

                {/* Image studio: editing a specific earlier image */}
                {isImage && focus && (
                    <div className="focus">
                        <span className="focus__thumb"></span>
                        <span>Editing this image. Describe the change.</span>
                        <button type="button" className="focus__x" aria-label="Stop editing this image" onClick={p.onClearFocus}>×</button>
                    </div>
                )}

                <div className="composer__field">
                    {isImage && tags.length > 0 && (
                        <div className="tagchips">
                            {tags.map((id) => (
                                <span key={id} className="tagchip" title={tagById(id)?.desc}>
                                    <img src={tagImage(id)} alt="" />/{id}
                                    <button type="button" aria-label={`Remove tag ${id}`} onClick={() => { p.onRemoveTag(id); inputRef.current?.focus(); }}>×</button>
                                </span>
                            ))}
                        </div>
                    )}
                    <label className="sr-only" htmlFor="prompt">Message</label>
                    <textarea ref={inputRef} id="prompt" className="composer__prompt" rows={1} maxLength={isImage ? 2000 : 8000} placeholder={placeholder}
                        value={prompt} onChange={onInput} onKeyDown={onKeyDown}
                        onClick={(e) => checkSlash(e.target.value, e.target.selectionStart)}
                        onBlur={() => setTimeout(() => setSlash((s) => ({ ...s, open: false })), 120)} />
                </div>
                {voice.listening && <p className="voice__live composer__live" aria-live="polite">{voice.live}</p>}

                <div className="composer__bar">
                    <input ref={fileRef} type="file" multiple hidden accept="image/png,image/jpeg,image/webp,.pdf,.docx,.txt,.md,.csv,.json"
                        onChange={(e) => { p.onAddFiles([...e.target.files]); e.target.value = ""; }} />
                    <button type="button" className="tool tool--icon" title="Attach images or documents" aria-label="Attach images or documents" onClick={() => fileRef.current.click()}>
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 11.5l-8.6 8.6a5.5 5.5 0 01-7.8-7.8l8.6-8.6a3.7 3.7 0 015.2 5.2l-8.6 8.6a1.8 1.8 0 01-2.6-2.6l7.9-7.9" /></svg>
                    </button>
                    {isImage && <>
                        <button type="button" className="tool tool--icon" id="tagBtn" data-pop-btn aria-haspopup="dialog" aria-expanded={pop === "gallery"}
                            title="Style tags (or type /)" aria-label="Style tags" onClick={() => togglePop("gallery")}>
                            <span className="tool__slash">/</span>
                            {tags.length > 0 && <span className="tool__count">{tags.length}</span>}
                        </button>
                        <button type="button" className="tool tool--chip" id="sizeBtn" data-pop-btn aria-haspopup="dialog" aria-expanded={pop === "size"}
                            title="Image size" onClick={() => togglePop("size")}>
                            <span className="ratio" style={{ "--rw": r.w + "px", "--rh": r.h + "px" }}></span>
                            <span id="sizeLabel">{fmtSize(size)}</span>
                        </button>
                    </>}

                    <span className="composer__spacer"></span>

                    {/* Voice (speak, then say "send" / "generate"). Language + spoken replies sit in a small menu. */}
                    <div className={`voice composer__voice${voice.listening ? " is-listening" : ""}${voice.supported ? "" : " is-unsupported"}`}>
                        <button type="button" className="tool tool--icon voice__mic" aria-pressed={voice.listening} aria-label="Speak"
                            title={voice.supported ? "Speak (Alt + M), then say “send”" : "Voice works in Chrome, Edge or Safari"} onClick={voice.toggle}>
                            <MicIcon />
                        </button>
                        <button type="button" className="voice__more" data-pop-btn aria-haspopup="dialog" aria-expanded={pop === "voice"}
                            title="Voice settings" aria-label="Voice settings" onClick={() => togglePop("voice")}>
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round"><path d="M6 9l6 6 6-6" /></svg>
                        </button>
                        {pop === "voice" && (
                            <div className={`pop voicepop${place.up ? " is-up" : ""}`} role="dialog" aria-label="Voice settings" style={{ maxHeight: place.max }}>
                                <label className="voicepop__row">Language<VoiceLangSelect /></label>
                                <div className="voicepop__row">Read replies aloud <SpeakToggle /></div>
                                <p className="voicepop__hint">Say “send” at the end to send. Shortcut: Alt + M.</p>
                            </div>
                        )}
                    </div>

                    <button type="submit" className={`send${busy ? " is-busy" : ""}`} disabled={sendDisabled} aria-label={isImage ? "Generate image" : "Send"}>
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M12 19V5M5 12l7-7 7 7" /></svg>
                    </button>
                </div>

                {/* Pop-ups */}
                {slash.open && (
                    <div className={`pop slash${place.up ? " is-up" : ""}`} role="listbox" aria-label="Style tags" style={{ maxHeight: place.max }}>
                        {slash.items.length ? <>
                            <p className="slash__head">Style tags</p>
                            {slash.items.map((t, i) => (
                                <SlashItem key={t.id} t={t} active={i === slash.index} on={tags.includes(t.id)}
                                    onHover={() => setSlash((s) => ({ ...s, index: i }))} onPick={() => pickSlash(i)} />
                            ))}
                        </> : <p className="slash__none">No tag called “/{slash.q}”. Press space to keep it as text.</p>}
                    </div>
                )}
                {pop === "gallery" && (
                    <div className={`pop gallery${place.up ? " is-up" : ""}`} role="dialog" aria-label="Style tags" style={{ maxHeight: place.max }}>
                        <div className="gallery__head"><strong>Style tags</strong>{tags.length > 0 && <button type="button" onClick={p.onClearTags}>Clear all</button>}</div>
                        {[["Look and quality", "quality"], ["Camera angle · pick one", "angle"]].map(([name, grp]) => (
                            <div key={grp}>
                                <p className="gallery__group">{name}</p>
                                <div className="gallery__grid">
                                    {TAGS.filter((t) => t.group === grp).map((t) => (
                                        <button key={t.id} type="button" className={`tagcard${tags.includes(t.id) ? " is-on" : ""}`} onClick={() => p.onToggleTag(t.id)}>
                                            <img src={tagImage(t.id)} alt="" loading="lazy" /><strong>/{t.id}</strong><span>{t.desc}</span>
                                        </button>
                                    ))}
                                </div>
                            </div>
                        ))}
                        <p className="gallery__note">Tip: type <kbd className="kbd-soft">/</kbd> in the message box to add a tag without leaving the keyboard.</p>
                    </div>
                )}
                {pop === "size" && (
                    <div className={`pop sizes${place.up ? " is-up" : ""}`} role="dialog" aria-label="Image size" style={{ maxHeight: place.max }}>
                        <SizePicker size={size} toast={p.toast} onPick={(s) => { p.onSize(s); setPop(null); inputRef.current?.focus(); }} />
                    </div>
                )}
            </form>
            <p className="dock__foot">
                {isImage
                    ? <>Type <kbd className="kbd-soft">/</kbd> for style tags · <kbd className="kbd-soft">Shift</kbd> + <kbd className="kbd-soft">Enter</kbd> for a new line</>
                    : hasThread ? "vibeMate can make mistakes. Check important facts and test code before you use it."
                        : <><kbd className="kbd-soft">Enter</kbd> to send · <kbd className="kbd-soft">Shift</kbd> + <kbd className="kbd-soft">Enter</kbd> for a new line</>}
            </p>
        </div>
    );
}

function SlashItem({ t, active, on, onHover, onPick }) {
    const ref = useRef(null);
    useEffect(() => { if (active) ref.current?.scrollIntoView({ block: "nearest" }); }, [active]);
    return (
        <button ref={ref} type="button" role="option" aria-selected={active} className={`slash__item${active ? " is-active" : ""}${on ? " is-on" : ""}`}
            onMouseDown={(e) => e.preventDefault()} onMouseEnter={onHover} onClick={onPick}>
            <img src={tagImage(t.id)} alt="" /><span><strong>/{t.id}</strong><span>{t.desc}</span></span><kbd className="kbd-soft">Enter</kbd>
        </button>
    );
}

function SizePicker({ size, onPick, toast }) {
    const [w, setW] = useState(size.w);
    const [h, setH] = useState(size.h);
    function setCustom() {
        const W = Math.round(Number(w)), H = Math.round(Number(h));
        if (!(W >= 256 && W <= 4096 && H >= 256 && H <= 4096)) return toast("Width and height must be between 256 and 4096 px.", "error");
        const preset = SIZES.find((p) => p.w === W && p.h === H);
        onPick(preset ? { ...preset } : { key: "custom", name: "Custom", w: W, h: H });
    }
    const enter = (e) => { if (e.key === "Enter") { e.preventDefault(); e.stopPropagation(); setCustom(); } };
    return <>
        <div className="sizes__title"><strong>Image size</strong><span>Downloads at exactly this size</span></div>
        <div className="sizes__grid">
            {SIZES.map((p) => {
                const r = ratioBox(p.w, p.h, 20);
                return (
                    <button key={p.key} type="button" className={`size${size.key === p.key ? " is-on" : ""}`} onClick={() => onPick({ ...p })}>
                        <span className="size__icon"><span className="ratio" style={{ "--rw": r.w + "px", "--rh": r.h + "px" }}></span></span>
                        <span><strong>{p.name}</strong><small>{fmtSize(p)}</small></span>
                    </button>
                );
            })}
        </div>
        <div className="sizes__custom">
            <label>Width<input className="input" type="number" min="256" max="4096" step="1" value={w} onChange={(e) => setW(e.target.value)} onKeyDown={enter} /></label>
            <span className="sizes__x">×</span>
            <label>Height<input className="input" type="number" min="256" max="4096" step="1" value={h} onChange={(e) => setH(e.target.value)} onKeyDown={enter} /></label>
            <button type="button" className="btn btn--ghost" onClick={setCustom}>Set</button>
        </div>
    </>;
}

export function Attachment({ f, onRemove, badge }) {
    const isImg = f.kind === "image";
    const t = DOC_TYPES[f.ext] || DOC_TYPES.txt;
    return (
        <div className={`att att--${isImg ? "img" : "doc"} is-${f.status}`} title={f.name}
            style={isImg && f.dataUrl ? { backgroundImage: `url("${f.dataUrl}")` } : undefined}>
            {isImg ? (badge && <span className="att__badge">{badge}</span>) : <>
                <span className="att__icon" style={{ "--doc": t.color }}>{t.label}</span>
                <span className="att__text">
                    <span className="att__name">{f.name}</span>
                    <span className="att__info">{f.status === "reading" ? "Reading" : f.info || fmtBytes(f.bytes)}</span>
                </span>
            </>}
            <button type="button" className="att__x" aria-label={`Remove ${f.name}`} onClick={onRemove}>×</button>
        </div>
    );
}
