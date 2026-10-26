// =====================================================
// PIN EDITOR (Image studio)
// "Edit with pins" on a generated image: click the image to drop numbered pins, write a change
// for each pin (plus an optional whole-image change), Apply. The edited image is added to the chat
// and shown here, so you can keep pinning. Undo goes back to the previous version.
// =====================================================
import { useEffect, useRef, useState } from "react";
import { backendAtLeast, ensureBackend } from "../lib/config.js";
import { cacheImage, fetchImage, fmtSize, post, shrinkImage, uid } from "../lib/api.js";
import { MAX_EDIT_PINS, areaLabel } from "../home/constants.jsx";

export default function PinEditor({ start, onAdd, onClose, toast }) {
    const [versions, setVersions] = useState([start]);
    const [pins, setPins] = useState([]);                 // { x, y (0–1), text }
    const [overall, setOverall] = useState("");
    const [status, setStatus] = useState({ text: "", type: "" });
    const [busy, setBusy] = useState(false);
    const [busyText, setBusyText] = useState("Applying your edits…");
    const [img, setImg] = useState({ src: "", loading: true });
    const [activePin, setActivePin] = useState(-1);
    const pinsRef = useRef(null);
    const focusNext = useRef(-1);

    const msg = versions[versions.length - 1];
    const size = msg.size || { w: msg.image.w, h: msg.image.h };

    // Load the image of the current version
    useEffect(() => {
        let live = true;
        setImg({ src: "", loading: true });
        fetchImage(msg.image.id)
            .then((src) => live && setImg({ src, loading: false }))
            .catch(() => { if (live) { setImg({ src: "", loading: false }); setStatus({ text: "Couldn't load this image. Close and try again.", type: "error" }); } });
        return () => { live = false; };
    }, [msg.image.id]);

    // Focus the text box of a pin that was just dropped or moved
    useEffect(() => {
        if (focusNext.current > -1) { document.getElementById("peText" + focusNext.current)?.focus(); focusNext.current = -1; }
    });

    function close() {
        if (busy) return toast("Edits are being applied. One moment…");
        if (pins.some((p) => p.text.trim()) && !confirm("Close without applying your pin edits?")) return;
        onClose();
    }
    const closeRef = useRef(close);
    closeRef.current = close;
    useEffect(() => {
        const onKey = (e) => { if (e.key === "Escape") { e.preventDefault(); closeRef.current(); } };
        document.addEventListener("keydown", onKey);
        return () => document.removeEventListener("keydown", onKey);
    }, []);

    // Click the image -> new pin
    function addPin(e) {
        if (e.target !== pinsRef.current || busy) return;
        if (pins.length >= MAX_EDIT_PINS) return setStatus({ text: `Up to ${MAX_EDIT_PINS} pins at a time. Apply these first.`, type: "error" });
        const r = pinsRef.current.getBoundingClientRect();
        focusNext.current = pins.length;
        setPins([...pins, { id: uid(), x: (e.clientX - r.left) / r.width, y: (e.clientY - r.top) / r.height, text: "" }]);
        setStatus({ text: "", type: "" });
    }

    // Drag a pin to move it (a tap without moving jumps to its text box)
    function startDrag(e, i) {
        if (busy) return;
        e.preventDefault();
        e.stopPropagation();
        const dot = e.currentTarget;
        const r = pinsRef.current.getBoundingClientRect();
        const from = { x: e.clientX, y: e.clientY };
        let moved = false;
        dot.setPointerCapture(e.pointerId);
        const move = (ev) => {
            if (Math.hypot(ev.clientX - from.x, ev.clientY - from.y) > 3) moved = true;
            if (!moved) return;
            const x = Math.min(1, Math.max(0, (ev.clientX - r.left) / r.width));
            const y = Math.min(1, Math.max(0, (ev.clientY - r.top) / r.height));
            setPins((ps) => ps.map((p, j) => (j === i ? { ...p, x, y } : p)));
        };
        const up = () => {
            dot.removeEventListener("pointermove", move);
            dot.removeEventListener("pointerup", up);
            dot.removeEventListener("pointercancel", up);
            document.getElementById("peText" + i)?.focus();
        };
        dot.addEventListener("pointermove", move);
        dot.addEventListener("pointerup", up);
        dot.addEventListener("pointercancel", up);
    }

    async function apply() {
        if (busy) return;
        const list = pins.map((p, i) => ({ n: i + 1, x: p.x, y: p.y, text: p.text.trim() })).filter((p) => p.text);
        const whole = overall.trim();
        if (!list.length && !whole) {
            return setStatus({ text: pins.length ? "Write what should change at your pin." : "Click the image to drop a pin first.", type: "error" });
        }
        const base = msg;
        setBusy(true);
        setStatus({ text: "", type: "" });
        const steps = ["Applying your edits…", "Repainting the pinned spots…", "Keeping the rest the same…", "Almost there…"];
        let k = 0;
        setBusyText(steps[0]);
        const ticker = setInterval(() => { k = Math.min(k + 1, steps.length - 1); setBusyText(steps[k]); }, 5000);
        try {
            await ensureBackend();
            await backendAtLeast(8.1);
            const image = await shrinkImage(await fetchImage(base.image.id));
            const res = await post({ action: "editImage", image, pins: list, overall: whole, size: { w: size.w, h: size.h }, prompt: base.image.prompt || "" });
            if (res.error) throw new Error(res.error);
            if (!res.image?.id) throw new Error("No edited image came back. Please try again.");
            if (res.image.dataUrl) cacheImage(res.image.id, res.image.dataUrl);

            // Into the chat: what was asked + the new version
            const userMsg = {
                id: uid(), role: "user", size, pinEdit: true, pinCount: list.length,
                text: list.map((p) => `${p.n}. ${p.text}`).concat(whole ? ["Whole image: " + whole] : []).join("\n")
            };
            const reply = {
                id: uid(), role: "assistant", size, text: res.reply || "Here's the edited version.", warning: res.warning || "",
                image: { id: res.image.id, w: size.w, h: size.h, prompt: base.image.prompt || res.image.prompt || "" }
            };
            onAdd(userMsg, reply);
            setVersions((vs) => [...vs, reply]);
            setPins([]);
            setOverall("");
            setStatus({ text: (res.reply || "Edits applied.") + " Keep pinning, or press Done.", type: "ok" });
        } catch (err) {
            console.error("Pin edits:", err);
            setStatus({ text: err.message || "Couldn't apply the edits. Please try again.", type: "error" });
        } finally {
            clearInterval(ticker);
            setBusy(false);
        }
    }

    function undo() {
        if (busy || versions.length < 2) return;
        setVersions((vs) => vs.slice(0, -1));
        setStatus({ text: "Back to the previous version. The newer one stays in the chat.", type: "ok" });
    }

    const ctrlEnter = (e) => { if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) { e.preventDefault(); apply(); } };

    return (
        <div className="pe" role="dialog" aria-modal="true" aria-labelledby="peTitle">
            <header className="pe__top">
                <button type="button" className="pe__back" aria-label="Back to chat" title="Back to chat" onClick={close}>
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M15 18l-6-6 6-6" /></svg>
                    <span>Back to chat</span>
                </button>
                <div className="pe__title">
                    <strong id="peTitle">Edit with pins</strong>
                    <span>{fmtSize(size)} · version {versions.length}</span>
                </div>
                <div className="pe__top-actions">
                    <button type="button" className="btn btn--ghost" disabled={busy || versions.length < 2} title="Go back to the previous version" onClick={undo}>
                        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 14L4 9l5-5" /><path d="M4 9h11a5 5 0 010 10h-3" /></svg>
                        Undo
                    </button>
                    <button type="button" className="btn btn--primary" disabled={busy} onClick={close}>Done</button>
                </div>
            </header>
            <div className="pe__body">
                <div className="pe__view">
                    <div className={`pe__stage${img.loading ? " is-loading" : ""}`} style={{ "--ratio": size.w / size.h }}>
                        {img.src && <img src={img.src} alt="Image being edited" />}
                        <div className="pe__pins" ref={pinsRef} title="Click to drop a pin" onClick={addPin}>
                            {pins.map((pin, i) => (
                                <button key={pin.id} type="button" className={`pin${activePin === i ? " is-active" : ""}`}
                                    style={{ left: pin.x * 100 + "%", top: pin.y * 100 + "%" }} title={`Pin ${i + 1} · drag to move`}
                                    onPointerDown={(e) => startDrag(e, i)}><span>{i + 1}</span></button>
                            ))}
                        </div>
                        {busy && <div className="pe__busy"><span>{busyText}</span></div>}
                    </div>
                    <p className="pe__hint">Click the image to drop a pin · drag a pin to move it</p>
                </div>
                <aside className="pe__panel">
                    <div className="pe__scroll">
                        {!pins.length && <p className="pe__empty">No pins yet. Click anywhere on the image, then write what should change there.</p>}
                        <ol className="pe__list">
                            {pins.map((pin, i) => (
                                <li key={pin.id} className={`pe-card${i === pins.length - 1 && !pin.text ? " is-new" : ""}`}>
                                    <div className="pe-card__head">
                                        <span className="pin-num">{i + 1}</span>
                                        <label htmlFor={"peText" + i}>Pin {i + 1} <em>· {areaLabel(pin.x, pin.y)}</em></label>
                                        <button type="button" className="pe-card__x" aria-label={`Remove pin ${i + 1}`} onClick={() => setPins(pins.filter((_, j) => j !== i))}>×</button>
                                    </div>
                                    <textarea className="textarea" id={"peText" + i} maxLength={400} rows={2} placeholder="What should change here? e.g. Add a glass of mango juice"
                                        value={pin.text} onChange={(e) => setPins(pins.map((p, j) => (j === i ? { ...p, text: e.target.value } : p)))}
                                        onKeyDown={ctrlEnter} onFocus={() => setActivePin(i)} onBlur={() => setActivePin(-1)} />
                                </li>
                            ))}
                        </ol>
                        <label className="pe__field">
                            <span>Whole image <em>optional</em></span>
                            <textarea className="textarea" maxLength={600} placeholder="e.g. Make the whole image warmer" value={overall}
                                onChange={(e) => setOverall(e.target.value)} onKeyDown={ctrlEnter} />
                        </label>
                        <p className={`pe__status${status.type ? " is-" + status.type : ""}`} aria-live="polite">{status.text}</p>
                    </div>
                    <div className="pe__actions">
                        <button type="button" className={`btn btn--primary${busy ? " is-busy" : ""}`} disabled={busy} onClick={apply}>Apply edits</button>
                        <button type="button" className="btn btn--ghost" disabled={busy} onClick={() => { setPins([]); setOverall(""); setStatus({ text: "", type: "" }); }}>Clear pins</button>
                    </div>
                </aside>
            </div>
        </div>
    );
}
