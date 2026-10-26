// =====================================================
// vibeMate 1.1 · AppShell.jsx
// The shared layout for the home page and History:
//   left sidebar : logo · Create anything · Image studio · History · Setup · (page extras, e.g. your chats) · status · you
//   top bar      : mode toggle (Create anything / Image studio) · Recent creations · Log out
// Props:
//   active   "create" | "image" | "history" | "setup"   which sidebar item is selected
//   mode     "create" | "image" | null        which side of the toggle is on (null on History)
//   onMode   (mode) => void   switch modes on the same page (home page) instead of opening a link
//   side     (closeSide) => node   extra sidebar content (the home page lists your chats here)
//   status   { state: "ok"|"warn"|"error"|"checking", text, help }   connection status (optional)
//   user     { name, email }
//   title    text shown next to the toggle (e.g. the open chat's title)
// =====================================================
import { useEffect, useRef, useState } from "react";
import { logout } from "../lib/auth.js";
import { getHistory, editLink, homeLink, pageLink, fmtWhen, KIND_LABEL } from "../lib/historyApi.js";
import { MODES } from "../home/constants.jsx";

export const ICONS = {
    spark: <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 2l1.9 5.6L19.5 9.5l-5.6 1.9L12 17l-1.9-5.6L4.5 9.5l5.6-1.9zM19 14l.9 2.6 2.6.9-2.6.9L19 21l-.9-2.6-2.6-.9 2.6-.9z"/></svg>,
    image: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="3" y="3" width="18" height="18" rx="4"/><circle cx="9" cy="9" r="1.8"/><path d="M21 15l-4.5-4.5L7 20"/></svg>,
    banner: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" aria-hidden="true"><rect x="2.5" y="5" width="19" height="14" rx="3"/><path d="M6 10h5M6 13h3.5" strokeLinecap="round"/><rect x="13.5" y="11" width="2.5" height="5" rx=".6"/><rect x="17" y="9.5" width="2.5" height="6.5" rx=".6"/></svg>,
    history: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M3 12a9 9 0 103-6.7"/><path d="M3 4v4h4"/><path d="M12 7.5V12l3 2"/></svg>,
    chat: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M21 12a8 8 0 01-11.6 7.1L4 20.5l1.4-4.9A8 8 0 1121 12z"/></svg>,
    clock: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 7.5V12l3 2"/></svg>,
    chevron: <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M6 9l6 6 6-6"/></svg>,
    logout: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M15 4h3a2 2 0 012 2v12a2 2 0 01-2 2h-3"/><path d="M10 17l-5-5 5-5M5 12h11"/></svg>,
    menu: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><path d="M4 7h16M4 12h16M4 17h10"/></svg>,
    close: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg>,
    setup: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M4 6h10M18 6h2M4 12h4M12 12h8M4 18h12"/><circle cx="16" cy="6" r="2"/><circle cx="10" cy="12" r="2"/><circle cx="18" cy="18" r="2"/></svg>,
    plus: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg>
};
const KIND_ICON = { chat: ICONS.chat, image: ICONS.image, banner: ICONS.banner };

const NAV = [
    { id: "create", icon: ICONS.spark, href: homeLink("create") },
    { id: "image", icon: ICONS.image, href: homeLink("image") },
    { id: "history", label: "History", hint: "Everything from the last 30 days", icon: ICONS.history, href: pageLink("history.html") },
    { id: "setup", label: "Setup", hint: "Brand kits: samples, tone, fonts", icon: ICONS.setup, href: pageLink("setup.html") }
].map((n) => ({ ...MODES[n.id], ...n }));

export default function AppShell({ active, mode = null, onMode, user, title = "", side, status, onStatusClick, children }) {
    const [sideOpen, setSideOpen] = useState(false);
    const [recentOpen, setRecentOpen] = useState(false);
    const [recent, setRecent] = useState(null);       // null = loading
    const [recentError, setRecentError] = useState("");
    const recentRef = useRef(null);

    // Recent creations: everything together, newest first (reloaded each time the menu opens)
    useEffect(() => {
        if (!recentOpen) return;
        let live = true;
        setRecent(null);
        setRecentError("");
        getHistory(8)
            .then((h) => {
                if (!live) return;
                const items = [...(h.chat || []), ...(h.studio || [])]
                    .sort((a, b) => new Date(b.updatedAt || 0) - new Date(a.updatedAt || 0)).slice(0, 8);
                setRecent(items);
            })
            .catch((err) => live && setRecentError(err.message));
        return () => { live = false; };
    }, [recentOpen]);

    // Close the Recent menu / side menu on an outside click or Esc
    useEffect(() => {
        if (!recentOpen && !sideOpen) return;
        const onClick = (e) => { if (recentRef.current && !recentRef.current.contains(e.target)) setRecentOpen(false); };
        const onKey = (e) => { if (e.key === "Escape") { setRecentOpen(false); setSideOpen(false); } };
        document.addEventListener("mousedown", onClick);
        document.addEventListener("keydown", onKey);
        return () => { document.removeEventListener("mousedown", onClick); document.removeEventListener("keydown", onKey); };
    }, [recentOpen, sideOpen]);

    const closeSide = () => setSideOpen(false);
    const pickMode = (m) => (e) => {
        if (onMode) { e.preventDefault(); onMode(m); setSideOpen(false); }
    };

    const name = user?.name || (user?.email || "").split("@")[0] || "You";

    return (
        <div className={"shell" + (sideOpen ? " is-side-open" : "")}>
            {/* ---------- Left sidebar ---------- */}
            <aside className="shell-side" aria-label="Main menu">
                <div className="shell-side__top">
                    <a href={homeLink("create")} className="shell-brand">vibe<span>Mate</span></a>
                    <button type="button" className="shell-side__close" onClick={closeSide} aria-label="Close menu">{ICONS.close}</button>
                </div>
                <nav className="shell-nav">
                    {NAV.map((item) => (
                        <a
                            key={item.id}
                            href={item.href}
                            onClick={MODES[item.id] ? pickMode(item.id) : undefined}
                            className={"menu-item shell-nav__item" + (active === item.id ? " is-active" : "")}
                            aria-current={active === item.id ? "page" : undefined}
                        >
                            <span className="shell-nav__icon">{item.icon}</span>
                            <span className="shell-nav__text"><strong>{item.label}</strong><small>{item.hint}</small></span>
                        </a>
                    ))}
                </nav>

                <div className="shell-side__extra">{typeof side === "function" ? side(closeSide) : side}</div>

                <div className="shell-side__foot">
                    {status && (
                        <button type="button" className="shell-status" data-state={status.state} title={status.help || status.text} onClick={onStatusClick}>
                            {status.text}
                        </button>
                    )}
                    <div className="shell-me">
                        <span className="shell-avatar" aria-hidden="true">{name.slice(0, 1).toUpperCase()}</span>
                        <span className="shell-user"><strong>{name}</strong>{user?.email && <small>{user.email}</small>}</span>
                    </div>
                </div>
            </aside>
            <div className="shell-scrim" onClick={closeSide} />

            {/* ---------- Main column ---------- */}
            <div className="shell-main">
                <header className="shell-top">
                    <button type="button" className="shell-top__menu" onClick={() => setSideOpen(true)} aria-label="Open menu">{ICONS.menu}</button>

                    <nav className="shell-toggle" aria-label="Mode">
                        {NAV.slice(0, 2).map((item) => (
                            <a
                                key={item.id}
                                href={item.href}
                                onClick={pickMode(item.id)}
                                className={"shell-toggle__btn" + (mode === item.id ? " is-active" : "")}
                                aria-current={mode === item.id ? "true" : undefined}
                            >
                                <span className="shell-toggle__long">{item.label}</span>
                                <span className="shell-toggle__short">{item.short}</span>
                            </a>
                        ))}
                    </nav>
                    {title && <span className="shell-top__title" title={title}>{title}</span>}

                    <div className="shell-top__right">
                        <div className="shell-recent" ref={recentRef}>
                            <button type="button" className="shell-top__btn" aria-haspopup="menu" aria-expanded={recentOpen} onClick={() => setRecentOpen((o) => !o)}>
                                {ICONS.clock}<span className="shell-top__label">Recent</span>{ICONS.chevron}
                            </button>
                            {recentOpen && (
                                <div className="shell-recent__menu" role="menu">
                                    <p className="shell-recent__head">Recent creations</p>
                                    {recentError && <p className="shell-recent__empty">{recentError}</p>}
                                    {!recentError && !recent && <p className="shell-recent__empty">Loading…</p>}
                                    {recent && !recent.length && <p className="shell-recent__empty">Nothing yet. What you make shows up here.</p>}
                                    {recent && recent.map((item) => (
                                        <a key={item.kind + item.id} href={editLink(item.kind, item.id)} className="shell-recent__item" role="menuitem">
                                            <span className={"shell-recent__icon is-" + item.kind}>
                                                {item.thumb ? <img src={item.thumb} alt="" /> : KIND_ICON[item.kind]}
                                            </span>
                                            <span className="shell-recent__text">
                                                <strong>{item.title}</strong>
                                                <small>{KIND_LABEL[item.kind]} · {fmtWhen(item.updatedAt)}</small>
                                            </span>
                                        </a>
                                    ))}
                                    <a href={pageLink("history.html")} className="shell-recent__all">View all history</a>
                                </div>
                            )}
                        </div>
                        <button type="button" className="shell-top__btn" onClick={() => logout()} title="Log out">
                            {ICONS.logout}<span className="shell-top__label">Log out</span>
                        </button>
                    </div>
                </header>
                <main className="shell-content">{children}</main>
            </div>
        </div>
    );
}
