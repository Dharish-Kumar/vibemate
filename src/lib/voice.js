// =====================================================
// vibeMate 3.0 · voice.js   Voice assistant, shared by both pages
// Same engine as 2.x (browser Web Speech API: free, no key). React version:
//   const v = useVoice("composer", {
//       target:  () => ({ get: () => text, set: (value) => setText(value) }),   // where words are typed live (optional)
//       onStart: () => {},
//       onFinal: ({ text, base, setTarget, join, target }) => {},
//       onError: (message) => {},
//       listeningHint: "Listening…"
//   })
//   v.listening · v.live (live caption when listening) · v.toggle() · v.supported
//   say("text") · narrate(statusElement) · parseNumber("two") -> 2 · useVoiceSettings() for language + spoken replies
// =====================================================
import { useEffect, useRef, useSyncExternalStore } from "react";

const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;
export const supported = Boolean(Recognition);
export const canSpeak = "speechSynthesis" in window;

// English + Indian languages the browser speech engine can listen in (Chrome / Edge list)
export const LANGS = [
    { code: "en-IN", label: "English", name: "English (India)" },
    { code: "hi-IN", label: "हिन्दी", name: "Hindi" },
    { code: "bn-IN", label: "বাংলা", name: "Bengali" },
    { code: "te-IN", label: "తెలుగు", name: "Telugu" },
    { code: "mr-IN", label: "मराठी", name: "Marathi" },
    { code: "ta-IN", label: "தமிழ்", name: "Tamil" },
    { code: "gu-IN", label: "ગુજરાતી", name: "Gujarati" },
    { code: "kn-IN", label: "ಕನ್ನಡ", name: "Kannada" },
    { code: "ml-IN", label: "മലയാളം", name: "Malayalam" },
    { code: "pa-Guru-IN", label: "ਪੰਜਾਬੀ", name: "Punjabi" },
    { code: "or-IN", label: "ଓଡ଼ିଆ", name: "Odia" },
    { code: "as-IN", label: "অসমীয়া", name: "Assamese" },
    { code: "ur-IN", label: "اردو", name: "Urdu" }
];
const REPLY_LANG = "en-IN";           // spoken replies are English text
const SILENCE_MS = 2200;              // stop listening after this much quiet
const KEY_LANG = "vibemate:voice-lang";
const KEY_SPEAK = "vibemate:voice-speak";

const ls = {
    get(key, fallback) { try { return localStorage.getItem(key) ?? fallback; } catch { return fallback; } },
    set(key, value) { try { localStorage.setItem(key, value); } catch { /* private mode */ } }
};

const ERRORS = {
    "not-allowed": "Microphone is blocked. Allow it from the lock icon in the address bar, then try again.",
    "service-not-allowed": "Microphone is blocked. Allow it from the lock icon in the address bar, then try again.",
    "audio-capture": "No microphone found. Plug one in and try again.",
    "network": "Voice needs an internet connection. Check it and try again.",
    "no-speech": "Didn't hear anything. Tap the mic and speak again.",
    "language-not-supported": "This browser can't listen in that language yet. Pick another one from the list."
};

// ---------- Shared state (read by components through useSyncExternalStore) ----------
let snap = {
    lang: LANGS.some((l) => l.code === ls.get(KEY_LANG)) ? ls.get(KEY_LANG) : LANGS[0].code,
    speakOn: ls.get(KEY_SPEAK, "1") === "1",
    active: null,     // id of the control that is listening
    live: ""          // live caption for that control
};
const listeners = new Set();
const setSnap = (patch) => { snap = { ...snap, ...patch }; listeners.forEach((f) => f()); };
const subscribe = (f) => { listeners.add(f); return () => listeners.delete(f); };
const getSnap = () => snap;

const controls = new Map();   // id -> ref to the latest options
let session = null;           // the one recognition running right now

// ---------- Speaking ----------
function pickVoice() {
    const voices = speechSynthesis.getVoices();
    return voices.find((v) => v.lang.replace("_", "-") === REPLY_LANG) || voices.find((v) => v.lang.startsWith("en")) || null;
}
export function say(text) {
    if (!canSpeak || !snap.speakOn || !text) return;
    const clean = String(text).replace(/[✓✔×•·]/g, " ").replace(/…/g, ",").replace(/\s+/g, " ").trim();
    if (!clean) return;
    speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(clean);
    u.lang = REPLY_LANG;
    const v = pickVoice();
    if (v) u.voice = v;
    u.rate = 1.05;
    speechSynthesis.speak(u);
}

// Read the next messages that appear in a status element (after a voice command started something)
let narrator = null;
export function narrate(el, { timeout = 120000 } = {}) {
    if (!el) return;
    if (narrator) narrator.stop();
    let last = el.textContent.trim();
    const obs = new MutationObserver(() => {
        const text = el.textContent.trim();
        if (!text || text === last) return;
        last = text;
        say(text);
        if (el.classList.contains("is-ok") || el.classList.contains("is-error")) stop();
    });
    const timer = setTimeout(() => stop(), timeout);
    function stop() { obs.disconnect(); clearTimeout(timer); if (narrator?.obs === obs) narrator = null; }
    obs.observe(el, { childList: true, characterData: true, subtree: true, attributes: true, attributeFilter: ["class"] });
    narrator = { obs, stop };
}

// ---------- Listening ----------
const tidy = (s) => s.replace(/\s+/g, " ").trim();

export function start(id) {
    const opts = controls.get(id)?.current;
    if (!opts) return;
    if (!supported) { opts.onError?.("Voice works in Chrome, Edge or Safari. Please open vibeMate in one of those."); return; }
    stop(true);
    if (canSpeak) speechSynthesis.cancel();
    opts.onStart?.();

    const target = opts.target?.() || null;
    const base = target ? String(target.get() || "").replace(/\s+$/, "") : "";
    const join = (text) => (base && text ? base + " " : base) + text;
    const setTarget = (value) => target?.set(value);

    const rec = new Recognition();
    rec.lang = snap.lang;
    rec.continuous = true;
    rec.interimResults = true;
    rec.maxAlternatives = 1;

    const s = { rec, id, final: "", error: "", cancelled: false, silence: 0 };
    session = s;
    const quietSoon = () => { clearTimeout(s.silence); s.silence = setTimeout(() => rec.stop(), SILENCE_MS); };

    rec.onresult = (e) => {
        // Rebuild from all results each time (avoids doubled words on some phones)
        let final = "", interim = "";
        for (const r of e.results) (r.isFinal ? (final += r[0].transcript + " ") : (interim += r[0].transcript));
        s.final = tidy(final);
        if (target) setTarget(join(tidy(final + interim)));
        else setSnap({ live: tidy(final + interim) || "Listening…" });
        quietSoon();
    };
    rec.onerror = (e) => { s.error = e.error; };
    rec.onend = () => {
        clearTimeout(s.silence);
        if (session === s) { session = null; setSnap({ active: null, live: "" }); }
        const o = controls.get(id)?.current || opts;
        if (s.cancelled) { setTarget(base); return; }
        if (s.error && s.error !== "aborted" && !s.final) { o.onError?.(ERRORS[s.error] || "Voice stopped. Please try again."); return; }
        if (!s.final) return;
        setTarget(join(s.final));
        o.onFinal?.({ text: s.final, target, base, setTarget, join });
    };

    try { rec.start(); }
    catch { session = null; opts.onError?.("Couldn't start the microphone. Please try again."); return; }
    quietSoon();
    setSnap({ active: id, live: opts.listeningHint || "Listening…" });
}

// finish = keep what was heard; cancel = throw it away
export function stop(cancel = false) {
    if (!session) return;
    session.cancelled = cancel;
    try { cancel ? session.rec.abort() : session.rec.stop(); } catch { /* already stopped */ }
}

export function toggle(id) { session?.id === id ? stop() : start(id); }

export function setLang(code) {
    ls.set(KEY_LANG, code);
    const restart = session?.id;
    setSnap({ lang: code });
    if (restart) { stop(true); setTimeout(() => start(restart), 150); }
}
export function toggleSpeak() {
    const on = !snap.speakOn;
    ls.set(KEY_SPEAK, on ? "1" : "0");
    if (!on && canSpeak) speechSynthesis.cancel();
    setSnap({ speakOn: on });
}

// Alt + M = talk / stop (first voice control on the page), Esc = cancel
document.addEventListener("keydown", (e) => {
    if (!controls.size) return;
    if (e.altKey && !e.ctrlKey && !e.metaKey && e.code === "KeyM") {
        e.preventDefault();
        session ? stop() : start(controls.keys().next().value);
    } else if (e.key === "Escape" && session) {
        e.preventDefault();
        stop(true);
    }
});
if (canSpeak) speechSynthesis.getVoices();   // starts loading the voice list early (Chrome)

// ---------- React hooks ----------
export function useVoiceSettings() {
    return useSyncExternalStore(subscribe, getSnap);
}

export function useVoice(id, opts) {
    const ref = useRef(opts);
    ref.current = opts;                      // always the latest callbacks (they read current state)
    useEffect(() => {
        controls.set(id, ref);
        return () => { if (session?.id === id) stop(true); controls.delete(id); };
    }, [id]);
    const s = useSyncExternalStore(subscribe, getSnap);
    return {
        supported,
        listening: s.active === id,
        live: s.active === id ? s.live : "",
        toggle: () => toggle(id),
        start: () => start(id),
        stop: () => stop(),
        cancel: () => stop(true)
    };
}

// "two" / "2" / "दो" -> 2
const NUMBERS = { one: 1, two: 2, to: 2, too: 2, three: 3, four: 4, for: 4, five: 5, six: 6, seven: 7, eight: 8,
    first: 1, second: 2, third: 3, fourth: 4, fifth: 5, sixth: 6, seventh: 7, eighth: 8,
    "एक": 1, "दो": 2, "तीन": 3, "चार": 4, "पांच": 5, "पाँच": 5, "छह": 6, "सात": 7, "आठ": 8 };
// Indian-script digits (०-९, ০-৯, ௦-௯ …) -> 0-9
const DIGIT_BASES = [0x966, 0x9E6, 0xA66, 0xAE6, 0xB66, 0xBE6, 0xC66, 0xCE6, 0xD66, 0x6F0, 0x660];
const toAscii = (w) => [...String(w)].map((ch) => {
    const code = ch.charCodeAt(0);
    const b = DIGIT_BASES.find((x) => code >= x && code <= x + 9);
    return b === undefined ? ch : String(code - b);
}).join("");
export const parseNumber = (word) => {
    const w = toAscii(word);
    return /^\d+$/.test(w) ? Number(w) : NUMBERS[w.toLowerCase()] || 0;
};
