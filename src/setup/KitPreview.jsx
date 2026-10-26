// =====================================================
// vibeMate 1.1 · setup/KitPreview.jsx
// A live, scaled-down guideline banner (1360 × 800) drawn with a brand kit's fonts, sizes and colours.
// Same positions as the editor stage (styles/bannercreation.css), so what you set here is what banners get.
// =====================================================
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { BUTTON_SHAPES, fontStack } from "../lib/brandKit.js";
import { THEMES, contrastText, richLine } from "../editor/layout.js";

export const SAMPLE_TEXT = {
    maintext: "Buy ketchup worth ₹2,000",
    offercallout: "Get up to ₹50 OFF",
    subtext: "Fresh picks for your kitchen",
    buttontext: "Shop now"
};

export default function KitPreview({ style, background = "blush", image = "", line = "offer", text = SAMPLE_TEXT, buttontext, tnc = true, fontsVersion = 0 }) {
    const frameRef = useRef(null);
    const headRef = useRef(null);
    const lineRef = useRef(null);
    const [scale, setScale] = useState(0.3);

    useEffect(() => {
        const ro = new ResizeObserver(([e]) => setScale(e.contentRect.width / 1360));
        ro.observe(frameRef.current);
        return () => ro.disconnect();
    }, []);

    // Same fitting as the editor: the size is the largest size, long text shrinks to fit
    useLayoutEffect(() => {
        const fit = (el, max, min, maxHeight) => {
            if (!el) return;
            let size = max;
            el.style.fontSize = size + "px";
            while (el.scrollHeight > maxHeight && size > min) { size -= 2; el.style.fontSize = size + "px"; }
        };
        fit(headRef.current, style.heading.size, Math.round(style.heading.size * 0.6), 320);
        const t = line === "sub" ? style.sub : style.offer;
        fit(lineRef.current, t.size, Math.round(t.size * 0.75), 90);
    }, [style, line, text, fontsVersion]);

    const [a, b] = THEMES[background] || THEMES.blush;
    const bg = image ? `url("${image}") center / cover no-repeat` : `linear-gradient(120deg, ${a} 0%, ${b} 100%)`;
    const t = line === "sub" ? style.sub : style.offer;
    const radius = BUTTON_SHAPES.find((s) => s.id === style.button.shape)?.radius ?? 999;
    const btnColor = style.button.color === "auto" ? contrastText(style.button.bg) : style.button.color;

    return (
        <div className="kitprev" ref={frameRef}>
            <div className="kitprev__stage" style={{ background: bg, transform: `scale(${scale})` }} aria-hidden="true">
                {!image && <div className="kitprev__floor" />}
                <div className="kitprev__content">
                    <h2 ref={headRef} className="kitprev__heading" style={{
                        fontFamily: fontStack(style.heading.font), fontWeight: style.heading.weight, color: style.heading.color,
                        lineHeight: style.heading.lineHeight, textTransform: style.heading.uppercase ? "uppercase" : "none"
                    }}>{text.maintext}</h2>
                    <p ref={lineRef} className="kitprev__line" style={{ fontFamily: fontStack(t.font), fontWeight: t.weight, color: t.color }}
                        dangerouslySetInnerHTML={{ __html: richLine(line === "sub" ? text.subtext : text.offercallout) }} />
                </div>
                <span className="kitprev__btn" style={{
                    fontFamily: fontStack(style.button.font), fontWeight: style.button.weight, fontSize: style.button.size + "px",
                    background: style.button.bg, color: btnColor, borderRadius: radius + "px"
                }}>{buttontext || text.buttontext}</span>
                {tnc && line === "offer" && <span className="kitprev__tnc" style={{ fontFamily: fontStack(style.sub.font) }}>*T&amp;C Apply</span>}
                <div className="kitprev__products"><i /><i /><i /></div>
            </div>
        </div>
    );
}
