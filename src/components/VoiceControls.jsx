// Language picker + "read replies aloud" toggle, shared by both pages
import { LANGS, canSpeak, setLang, toggleSpeak, useVoiceSettings } from "../lib/voice.js";

export function VoiceLangSelect() {
    const { lang } = useVoiceSettings();
    return (
        <select className="voice__lang" aria-label="Voice language" value={lang}
            title={`Voice language: ${LANGS.find((l) => l.code === lang)?.name}`}
            onChange={(e) => setLang(e.target.value)}>
            {LANGS.map((l) => <option key={l.code} value={l.code}>{l.label}</option>)}
        </select>
    );
}

export function SpeakToggle() {
    const { speakOn } = useVoiceSettings();
    if (!canSpeak) return null;
    return (
        <button type="button" className="voice__opt" aria-pressed={speakOn} aria-label="Spoken replies" onClick={toggleSpeak}
            title={speakOn ? "Spoken replies on (click to mute)" : "Spoken replies off (click to turn on)"}>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M11 5L6 9H3v6h3l5 4V5z" />
                <path className="voice__wave" d="M15.5 8.5a5 5 0 010 7M18.5 5.5a9 9 0 010 13" />
                <path className="voice__mute" d="M16 9l5 6M21 9l-5 6" />
            </svg>
        </button>
    );
}

export const MicIcon = ({ size = 19 }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <rect x="9" y="2" width="6" height="12" rx="3" /><path d="M5 10a7 7 0 0014 0M12 17v5M8 22h8" />
    </svg>
);
