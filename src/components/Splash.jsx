// Animated vibeMate wordmark (about 2 s, once per browser session; ?splash=1 forces it)
import { useEffect, useState } from "react";
import { KEYS, SPLASH_MS } from "../home/constants.jsx";

let seenThisLoad = null;
function shouldShow() {
    if (seenThisLoad !== null) return seenThisLoad;
    let seen = false;
    try { seen = sessionStorage.getItem(KEYS.splash) === "1"; sessionStorage.setItem(KEYS.splash, "1"); } catch { /* storage blocked */ }
    seenThisLoad = !seen || /[?&]splash=1/.test(location.search);
    return seenThisLoad;
}

const WORD = ["v", "i", "b", "e", "M", "a", "t", "e"];

export default function Splash({ onDone }) {
    const [show] = useState(shouldShow);
    const [phase, setPhase] = useState(show ? "on" : "gone");   // on → done (fading) → gone

    useEffect(() => {
        if (!show) { onDone(); return; }
        const t1 = setTimeout(() => { setPhase("done"); onDone(); }, SPLASH_MS);
        const t2 = setTimeout(() => setPhase("gone"), SPLASH_MS + 600);
        return () => { clearTimeout(t1); clearTimeout(t2); };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    if (phase === "gone") return null;
    return (
        <div className={`splash${phase === "done" ? " is-done" : ""}`} role="status" aria-label="Loading vibeMate">
            <div className="splash__mark" aria-hidden="true">
                <span className="splash__word">
                    {WORD.map((ch, i) => <span key={i} className={i >= 4 ? "is-accent" : undefined} style={{ "--i": i }}>{ch}</span>)}
                </span>
                <svg className="splash__spark" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 1.5l2.2 7.3 7.3 2.2-7.3 2.2-2.2 7.3-2.2-7.3L2.5 11l7.3-2.2z" /></svg>
            </div>
            <div className="splash__bar"><i></i></div>
        </div>
    );
}
