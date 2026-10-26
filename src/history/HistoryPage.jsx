// =====================================================
// vibeMate 3.2 · HistoryPage.jsx
// A note that everything is deleted 30 days after its last change, then two tables side by side:
//   Create anything (assistant chats) | Image studio (AI image chats + guideline banners)
// Each row: open (Edit) and Delete.
// =====================================================
import { useEffect, useState } from "react";
import { getHistory, deleteBanner, deleteChat, editLink, homeLink, fmtWhen, KIND_LABEL } from "../lib/historyApi.js";
import { ICONS } from "../components/AppShell.jsx";

const SECTIONS = [
    { list: "chat", title: "Create anything", hint: "AI assistant chats", empty: "No chats yet.", start: "Start a chat", href: homeLink("create"), icon: ICONS.spark },
    { list: "studio", title: "Image studio", hint: "AI images and guideline banners", empty: "No images or banners yet.", start: "Open the Image studio", href: homeLink("image"), icon: ICONS.image }
];

const EditIcon = <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M4 20h4L19 9l-4-4L4 16v4z"/></svg>;
const TrashIcon = <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M4 7h16M10 11v6M14 11v6M6 7l1 12a2 2 0 002 2h6a2 2 0 002-2l1-12M9 7V4h6v3"/></svg>;
const InfoIcon = <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 8v5M12 16.5v.01"/></svg>;

export default function HistoryPage() {
    const [data, setData] = useState(null);
    const [error, setError] = useState("");
    const [busy, setBusy] = useState("");          // id being deleted
    const [toast, setToast] = useState(null);

    const load = () => {
        setError("");
        getHistory(200).then(setData).catch((err) => setError(err.message));
    };
    useEffect(load, []);

    useEffect(() => {
        if (!toast) return;
        const t = setTimeout(() => setToast(null), 3600);
        return () => clearTimeout(t);
    }, [toast]);

    async function remove(section, item) {
        if (!confirm(`Delete “${item.title}”?\nThis can't be undone.`)) return;
        setBusy(item.id);
        try {
            await (item.kind === "banner" ? deleteBanner(item.id) : deleteChat(item.id));
            setData((d) => ({ ...d, [section.list]: d[section.list].filter((x) => !(x.id === item.id && x.kind === item.kind)) }));
            setToast({ type: "success", text: `Deleted “${item.title}”.` });
        } catch (err) {
            setToast({ type: "error", text: err.message });
        } finally {
            setBusy("");
        }
    }

    const days = data?.days || 30;
    const detail = (item) => {
        if (item.kind === "banner") return "";
        if (item.kind === "image") return item.images ? `${item.images} image${item.images === 1 ? "" : "s"}` : "no images yet";
        return item.messages ? `${item.messages} message${item.messages === 1 ? "" : "s"}` : "";
    };

    return (
        <div className="history">
            <div className="history__head">
                <div>
                    <h1 className="history__title">History</h1>
                    <p className="text-muted">Everything you made in the last {days} days, in one place.</p>
                </div>
            </div>

            <div className="notice notice--warning history__notice" role="note">
                {InfoIcon}
                <span>
                    <strong>History is kept for {days} days.</strong> Anything you haven't changed for {days} days is deleted
                    automatically and can't be brought back. Download images, banners and code you want to keep.
                </span>
            </div>

            {error && (
                <div className="msgbox history__error">
                    {error} <button type="button" className="text-link history__retry" onClick={load}>Try again</button>
                </div>
            )}

            <div className="history__grid">
                {SECTIONS.map((section) => {
                    const rows = data?.[section.list];
                    return (
                        <section key={section.list} className="card history-card" aria-labelledby={"h-" + section.list}>
                            <header className="history-card__head">
                                <span className="history-card__icon">{section.icon}</span>
                                <h2 id={"h-" + section.list}>{section.title}</h2>
                                {rows && <span className="badge">{rows.length}</span>}
                                <small>{section.hint}</small>
                            </header>

                            {!rows && !error && <div className="history-card__loading"><i /><i /><i /></div>}

                            {rows && !rows.length && (
                                <div className="history-card__empty">
                                    <p>{section.empty}</p>
                                    <a href={section.href} className="btn btn--soft btn--sm">{section.start}</a>
                                </div>
                            )}

                            {rows && rows.length > 0 && (
                                <div className="history-table__wrap">
                                    <table className="history-table">
                                        <thead>
                                            <tr><th>Name</th><th>Deletes in</th><th><span className="sr-only">Actions</span></th></tr>
                                        </thead>
                                        <tbody>
                                            {rows.map((item) => (
                                                <tr key={item.kind + item.id} className={busy === item.id ? "is-busy" : ""}>
                                                    <td>
                                                        <a href={editLink(item.kind, item.id)} className="history-name">
                                                            {item.kind === "banner"
                                                                ? <span className="history-thumb" style={item.thumb ? { backgroundImage: `url("${item.thumb}")` } : undefined}>{!item.thumb && ICONS.banner}</span>
                                                                : <span className="history-thumb history-thumb--chat">{item.kind === "image" ? ICONS.image : ICONS.chat}</span>}
                                                            <span className="history-name__text">
                                                                <strong>{item.title}</strong>
                                                                <small>
                                                                    {section.list === "studio" && <span className={`history-type is-${item.kind}`}>{KIND_LABEL[item.kind]}</span>}
                                                                    Edited {fmtWhen(item.updatedAt)}
                                                                    {detail(item) && ` · ${detail(item)}`}
                                                                    <span className="history-days-inline"> · {item.daysLeft} day{item.daysLeft === 1 ? "" : "s"} left</span>
                                                                </small>
                                                            </span>
                                                        </a>
                                                    </td>
                                                    <td><span className={"history-days" + (item.daysLeft <= 3 ? " is-soon" : "")}>{item.daysLeft} day{item.daysLeft === 1 ? "" : "s"}</span></td>
                                                    <td className="history-actions">
                                                        <a href={editLink(item.kind, item.id)} className="btn btn--soft btn--sm">{EditIcon}{item.kind === "banner" ? "Edit" : "Open"}</a>
                                                        <button type="button" className="btn btn--danger btn--sm history-del" onClick={() => remove(section, item)} disabled={busy === item.id} aria-label={`Delete ${item.title}`} title="Delete">
                                                            {TrashIcon}
                                                        </button>
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            )}
                        </section>
                    );
                })}
            </div>

            {toast && <div className={`toast is-visible toast--${toast.type}`} role="status">{toast.text}</div>}
        </div>
    );
}
