// =====================================================
// vibeMate 3.2 · Thread.jsx   The conversation
//   Create anything (kind "chat"):  assistant answers in Markdown, code blocks with Copy, Preview (HTML) and Download
//   Image studio (kind "image"):    short replies + the generated image (Edit with pins, Again, Prompt, Download)
// =====================================================
import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { LIBS, cachedImage, fetchImage, fmtSize, loadImage, loadScript, saveFile } from "../lib/api.js";
import { tagImage } from "../lib/tags.js";
import { isPreviewable, parseMarkdown } from "../lib/markdown.js";
import * as Icon from "./Icons.jsx";

export default function Thread({ chat, onRetry, onAgain, onEdit, onRegenerate, toast }) {
    const ref = useRef(null);
    const [dlOpen, setDlOpen] = useState(null);     // message id whose download menu is open
    const [preview, setPreview] = useState(null);   // { code, lang } of the HTML being previewed
    const last = chat.messages[chat.messages.length - 1];
    const lastAiId = [...chat.messages].reverse().find((m) => m.role === "assistant")?.id;

    // Keep the newest message in view
    useEffect(() => {
        requestAnimationFrame(() => { if (ref.current) ref.current.scrollTop = ref.current.scrollHeight; });
    }, [chat.id, chat.messages.length, last?.pending, last?.image?.id]);

    // Close the download menu on any outside click / Esc
    useEffect(() => {
        if (!dlOpen) return;
        const close = (e) => { if (e.type === "keydown" ? e.key === "Escape" : !e.target.closest(".dl")) setDlOpen(null); };
        document.addEventListener("click", close);
        document.addEventListener("keydown", close);
        return () => { document.removeEventListener("click", close); document.removeEventListener("keydown", close); };
    }, [dlOpen]);

    return (
        <section className="thread" ref={ref} aria-label="Conversation" aria-live="polite">
            <div className="thread__inner">
                {chat.messages.map((m) => m.role === "user"
                    ? <UserMessage key={m.id} m={m} />
                    : <AiMessage key={m.id} m={m} kind={chat.kind} isLast={m.id === lastAiId}
                        dlOpen={dlOpen === m.id} setDlOpen={setDlOpen} onPreview={setPreview}
                        onRetry={onRetry} onAgain={onAgain} onEdit={onEdit} onRegenerate={onRegenerate} toast={toast} />)}
            </div>
            {preview && createPortal(<HtmlPreview code={preview.code} onClose={() => setPreview(null)} />, document.body)}
        </section>
    );
}

function UserMessage({ m }) {
    const chips = [
        ...(m.tags || []).map((id) => <span key={"t" + id} className="meta-chip"><img src={tagImage(id)} alt="" />/{id}</span>),
        m.size && <span key="size" className="meta-chip meta-chip--plain">{fmtSize(m.size)}</span>,
        ...(m.docs || []).map((name, i) => <span key={"d" + i} className="meta-chip meta-chip--plain">📄 {name}</span>),
        m.editing && <span key="ed" className="meta-chip meta-chip--plain">✎ editing an earlier image</span>,
        m.pinEdit && <span key="pin" className="meta-chip meta-chip--plain">📍 {m.pinCount || 0} pin edit{m.pinCount === 1 ? "" : "s"}</span>
    ].filter(Boolean);
    const thumbs = m.thumbs || [];
    const count = !thumbs.length && m.imageCount ? <span className="meta-chip meta-chip--plain">🖼 {m.imageCount} image{m.imageCount > 1 ? "s" : ""}</span> : null;
    return (
        <article className="msg msg--user" data-msg={m.id}>
            {thumbs.length > 0 && <div className="msg__files">{thumbs.map((src, i) => <img key={i} className="msg__file-img" src={src} alt="" />)}</div>}
            {m.text && <div className="msg__bubble">{m.text}</div>}
            {(chips.length > 0 || count) && <div className="msg__meta">{chips}{count}</div>}
        </article>
    );
}

function AiMessage({ m, kind, isLast, dlOpen, setDlOpen, onPreview, onRetry, onAgain, onEdit, onRegenerate, toast }) {
    let body;
    if (m.pending) {
        const s = m.size || { w: 1, h: 1 };
        body = kind === "image" ? (
            <div className="shot" style={{ "--shot-max": `${s.h > s.w ? 380 : 560}px` }}>
                <div className="shot__frame is-loading" style={{ "--ratio": `${s.w}/${s.h}` }}></div>
                <span className="shot__status" data-status>{m.status || "Thinking…"}</span>
            </div>
        ) : (
            <div className="typing" aria-label="vibeMate is writing"><span className="typing__dots"><i /><i /><i /></span><span>{m.status || "Thinking…"}</span></div>
        );
    } else if (m.error) {
        body = <div className="msg__error">{m.error}<button type="button" className="msg__retry" onClick={() => onRetry(m.id)}>Try again</button></div>;
    } else {
        body = <>
            {m.text && <Answer text={m.text} onPreview={onPreview} toast={toast} />}
            {m.image && <Shot m={m} dlOpen={dlOpen} setDlOpen={setDlOpen} onAgain={onAgain} onEdit={onEdit} toast={toast} />}
            {m.warning && <p className="msg__warn">{m.warning}</p>}
            {kind === "chat" && m.text && (
                <div className="msg__actions">
                    <CopyButton text={m.text} toast={toast} label="Copy" />
                    {isLast && onRegenerate && <button type="button" className="act act--quiet" onClick={() => onRegenerate(m.id)} title="Write a new answer"><Icon.Again />Regenerate</button>}
                </div>
            )}
        </>;
    }
    return (
        <article className={`msg msg--ai msg--${kind}`} data-msg={m.id}>
            <span className="msg__avatar"><Icon.Spark /></span>
            <div className="msg__body">{body}</div>
        </article>
    );
}

// ---------- An answer in Markdown ----------
function Answer({ text, onPreview, toast }) {
    const blocks = useMemo(() => parseMarkdown(text), [text]);
    return (
        <div className="msg__text md">
            {blocks.map((b, i) => b.type === "code"
                ? <CodeBlock key={i} block={b} onPreview={onPreview} toast={toast} />
                : <div key={i} dangerouslySetInnerHTML={{ __html: b.html }} />)}
        </div>
    );
}

const LANG_NAMES = { html: "HTML", htm: "HTML", css: "CSS", js: "JavaScript", javascript: "JavaScript", jsx: "JSX", ts: "TypeScript", typescript: "TypeScript",
    tsx: "TSX", json: "JSON", py: "Python", python: "Python", sql: "SQL", bash: "Terminal", sh: "Terminal", shell: "Terminal", java: "Java", php: "PHP",
    xml: "XML", svg: "SVG", md: "Markdown", markdown: "Markdown", yaml: "YAML", yml: "YAML", c: "C", cpp: "C++", csharp: "C#", go: "Go", kotlin: "Kotlin", swift: "Swift" };
const EXT = { html: "html", htm: "html", css: "css", js: "js", javascript: "js", jsx: "jsx", ts: "ts", typescript: "ts", tsx: "tsx", json: "json",
    py: "py", python: "py", sql: "sql", svg: "svg", xml: "xml", md: "md", markdown: "md", yaml: "yml", yml: "yml", bash: "sh", sh: "sh" };

function CodeBlock({ block, onPreview, toast }) {
    const canPreview = isPreviewable(block) && !block.open;
    const download = () => {
        const ext = EXT[block.lang] || (canPreview ? "html" : "txt");
        const url = URL.createObjectURL(new Blob([block.code], { type: "text/plain;charset=utf-8" }));
        saveFile(url, `vibemate-code.${ext}`);
        setTimeout(() => URL.revokeObjectURL(url), 2000);
    };
    return (
        <div className="code">
            <div className="code__bar">
                <span className="code__lang">{LANG_NAMES[block.lang] || block.lang || "Code"}</span>
                <span className="code__actions">
                    {canPreview && <button type="button" className="code__btn code__btn--accent" onClick={() => onPreview({ code: block.code, lang: block.lang })}><EyeIcon />Preview</button>}
                    <button type="button" className="code__btn" onClick={download} title="Download as a file"><Icon.Download />Download</button>
                    <CopyButton text={block.code} toast={toast} label="Copy" className="code__btn" />
                </span>
            </div>
            <pre className="code__pre"><code>{block.code}</code></pre>
            {block.open && <p className="code__cut">The answer stopped here (it was too long). Type “continue” to get the rest.</p>}
        </div>
    );
}

function CopyButton({ text, label, toast, className = "act act--quiet" }) {
    const [done, setDone] = useState(false);
    async function copy() {
        try {
            await navigator.clipboard.writeText(text);
            setDone(true);
            setTimeout(() => setDone(false), 1600);
        } catch { toast("Couldn't copy. Select the text and press Ctrl + C.", "error"); }
    }
    return (
        <button type="button" className={className} onClick={copy} title="Copy to the clipboard">
            {done ? <CheckIcon /> : <Icon.Copy />}{done ? "Copied" : label}
        </button>
    );
}

// Live preview of an HTML answer in a sandbox (scripts run, but can't reach vibeMate, your login or other sites' data)
function HtmlPreview({ code, onClose }) {
    const [width, setWidth] = useState("desktop");
    useEffect(() => {
        const onKey = (e) => { if (e.key === "Escape") onClose(); };
        document.addEventListener("keydown", onKey);
        return () => document.removeEventListener("keydown", onKey);
    }, [onClose]);
    const download = () => {
        const url = URL.createObjectURL(new Blob([code], { type: "text/html;charset=utf-8" }));
        saveFile(url, "vibemate-page.html");
        setTimeout(() => URL.revokeObjectURL(url), 2000);
    };
    return (
        <div className="preview-modal" role="dialog" aria-modal="true" aria-label="Preview" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
            <div className="preview-modal__box">
                <header className="preview-modal__top">
                    <strong>Preview</strong>
                    <div className="segmented preview-modal__sizes" role="radiogroup" aria-label="Screen size">
                        {[["desktop", "Desktop"], ["tablet", "Tablet"], ["mobile", "Phone"]].map(([k, label]) => (
                            <label key={k}><input type="radio" name="pvw" checked={width === k} onChange={() => setWidth(k)} /><span>{label}</span></label>
                        ))}
                    </div>
                    <span className="preview-modal__spacer" />
                    <button type="button" className="btn btn--ghost btn--sm" onClick={download}><Icon.Download />Download HTML</button>
                    <button type="button" className="btn btn--soft btn--sm" onClick={onClose}>Close</button>
                </header>
                <div className="preview-modal__stage">
                    <iframe className={`preview-modal__frame is-${width}`} title="Preview of the page" sandbox="allow-scripts allow-forms allow-modals" srcDoc={code} />
                </div>
            </div>
        </div>
    );
}

const EyeIcon = () => <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z" /><circle cx="12" cy="12" r="3" /></svg>;
const CheckIcon = () => <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M5 12l5 5 9-10" /></svg>;

// ---------- A generated image ----------
function Shot({ m, dlOpen, setDlOpen, onAgain, onEdit, toast }) {
    const { image } = m;
    const size = m.size || { w: image.w, h: image.h };
    const [src, setSrc] = useState(() => cachedImage(image.id) || "");
    const [missing, setMissing] = useState(false);

    useEffect(() => {
        if (src) return;
        let live = true;
        fetchImage(image.id).then((s) => live && setSrc(s)).catch(() => live && setMissing(true));
        return () => { live = false; };
    }, [image.id, src]);

    async function copyPrompt() {
        try { await navigator.clipboard.writeText(image.prompt || ""); toast("Image prompt copied."); } catch { toast("Couldn't copy.", "error"); }
    }

    return (
        <div className="msg__shot">
            <div className="shot" style={{ "--shot-max": `${size.h > size.w ? 380 : 560}px` }}>
                <div className={`shot__frame${src || missing ? "" : " is-loading"}`} style={{ "--ratio": `${size.w}/${size.h}` }}
                    title="Click to edit with pins" onClick={() => onEdit(m)}>
                    {src && <img src={src} alt="Generated design" />}
                    {missing && <span className="shot__missing">Image not available</span>}
                </div>
            </div>
            <div className="shot__bar">
                <span className="shot__size">{fmtSize(size)}</span>
                <button type="button" className="act act--accent" onClick={() => onEdit(m)}><Icon.Pin />Edit with pins</button>
                <button type="button" className="act" onClick={() => onAgain(m.id)}><Icon.Again />Again</button>
                <button type="button" className="act" title="Copy the image prompt" onClick={copyPrompt}><Icon.Copy />Prompt</button>
                <span className="dl">
                    <button type="button" className="act act--primary" aria-haspopup="menu" aria-expanded={dlOpen}
                        onClick={() => setDlOpen(dlOpen ? null : m.id)}><Icon.Download />Download</button>
                    {dlOpen && (
                        <div className="dl__menu" role="menu">
                            {["png", "jpg", "pdf"].map((f) => (
                                <button key={f} type="button" role="menuitem" onClick={() => { setDlOpen(null); downloadImage(m, f, toast); }}>
                                    <span>{f.toUpperCase()}</span><small>{fmtSize(size)}</small>
                                </button>
                            ))}
                        </div>
                    )}
                </span>
            </div>
        </div>
    );
}

// Download at the exact chosen size (fills it like CSS "cover"; the image is generated at the same shape)
async function downloadImage(m, format, toast) {
    try {
        const src = await fetchImage(m.image.id);
        const size = m.size || { w: m.image.w, h: m.image.h };
        const img = await loadImage(src);
        const c = document.createElement("canvas");
        c.width = size.w;
        c.height = size.h;
        const ctx = c.getContext("2d");
        ctx.imageSmoothingQuality = "high";
        ctx.fillStyle = "#ffffff";
        ctx.fillRect(0, 0, c.width, c.height);
        const s = Math.max(size.w / img.naturalWidth, size.h / img.naturalHeight);
        ctx.drawImage(img, (size.w - img.naturalWidth * s) / 2, (size.h - img.naturalHeight * s) / 2, img.naturalWidth * s, img.naturalHeight * s);

        const name = "vibemate-" + ((m.image.prompt || "design").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 36) || "design");
        if (format === "pdf") {
            await loadScript(LIBS.jspdf);
            const { jsPDF } = window.jspdf;
            const pdf = new jsPDF({ orientation: size.w >= size.h ? "landscape" : "portrait", unit: "px", format: [size.w, size.h], hotfixes: ["px_scaling"] });
            pdf.addImage(c.toDataURL("image/jpeg", 0.95), "JPEG", 0, 0, size.w, size.h);
            pdf.save(name + ".pdf");
            return;
        }
        saveFile(c.toDataURL(format === "png" ? "image/png" : "image/jpeg", 0.95), `${name}.${format}`);
    } catch (err) {
        console.error("Download:", err);
        toast("Download failed. Please try again.", "error");
    }
}
