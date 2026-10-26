// =====================================================
// vibeMate 1.1 · fonts.js
// Loads the Google Fonts a brand kit uses (once per family), so the banner, the preview and the download match.
// =====================================================
import { fontByFamily, googleFontsUrl } from "./brandKit.js";

const loaded = new Set(["Anton", "Rubik", "Poppins"]);   // already in style.css

// families: ["Montserrat", "Inter"] · resolves when the fonts are ready to draw (or after 4 s)
export async function ensureFonts(families) {
    const fresh = [...new Set(families)].filter((f) => f && !loaded.has(f) && fontByFamily(f));
    if (fresh.length) {
        fresh.forEach((f) => loaded.add(f));
        const link = document.createElement("link");
        link.rel = "stylesheet";
        link.href = googleFontsUrl(fresh);
        document.head.append(link);
        await new Promise((resolve) => { link.onload = resolve; link.onerror = resolve; setTimeout(resolve, 4000); });
    }
    try {
        await Promise.race([
            Promise.all([...new Set(families)].filter(Boolean).flatMap((f) => (fontByFamily(f)?.weights || [400]).map((w) => document.fonts.load(`${w} 40px "${f}"`)))),
            new Promise((r) => setTimeout(r, 4000))
        ]);
    } catch { /* old browser: the fonts still arrive, just a moment later */ }
}

// Every family of every font in a list of kits (for the font pickers)
export const allFamilies = (style) => Object.values(style || {}).map((t) => t?.font).filter(Boolean);
