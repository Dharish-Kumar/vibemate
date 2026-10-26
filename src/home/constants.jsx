// =====================================================
// vibeMate 3.2 · home page settings
//   mode "create" = Create anything (the AI assistant: answers, writing, code)
//   mode "image"  = Image studio, with two tabs:
//       tab "image"  = AI image chat (any size, style tags, edit with pins)
//       tab "banner" = guideline banner (details in a pop-up, then the editor)
// =====================================================
export const SPLASH_MS = 2000;
export const MAX_IMAGES = { create: 3, image: 3, banner: 3 };
export const MAX_DOCS = 3;
export const MAX_DOC_CHARS = 6000;        // per document (sent to the AI)
export const MAX_FILE_MB = 15;
export const HISTORY_SENT = 10;           // earlier messages sent with each image request
export const ASSISTANT_HISTORY = 12;      // earlier messages sent with each assistant question
export const MAX_CHATS = 60;              // both kinds together (same as the server)
export const MAX_EDIT_PINS = 8;
export const KEYS = { mode: "vibemate:mode", tab: "vibemate:studiotab", size: "vibemate:size", splash: "vibemate:splash", gmode: "vibemate:gmode" };

export const MODES = {
    create: { label: "Create anything", short: "Create", hint: "AI assistant: answers, writing, code" },
    image: { label: "Image studio", short: "Images", hint: "AI images and guideline banners" }
};

export const GUIDELINE_SIZE = { w: 1360, h: 800 };
export const SIZES = [
    { key: "banner",   name: "Web banner",     w: 1360, h: 800 },
    { key: "square",   name: "Square post",    w: 1080, h: 1080 },
    { key: "portrait", name: "Portrait post",  w: 1080, h: 1350 },
    { key: "story",    name: "Story / Reel",   w: 1080, h: 1920 },
    { key: "wide",     name: "Landscape HD",   w: 1920, h: 1080 },
    { key: "link",     name: "Link preview",   w: 1200, h: 628 },
    { key: "a4",       name: "A4 poster",      w: 2480, h: 3508 },
    { key: "strip",    name: "Wide strip",     w: 1920, h: 480 }
];

export const DOC_TYPES = {
    pdf:  { label: "PDF",  color: "#d64545" },
    docx: { label: "DOC",  color: "#2b65f0" },
    txt:  { label: "TXT",  color: "#667085" },
    md:   { label: "MD",   color: "#667085" },
    csv:  { label: "CSV",  color: "#15925f" },
    json: { label: "JSON", color: "#b45309" }
};

export const GREETINGS = {
    create: {
        title: "How can I help you today?",
        sub: "Ask anything: questions, writing, ideas, documents or code. Attach images or files for context.",
        placeholder: "Message vibeMate…"
    },
    image: {
        title: "What image shall we create?",
        sub: <>Describe any visual: a poster, a social post, a product shot. Add <kbd className="kbd-soft">/</kbd> tags for the look and camera angle.</>,
        placeholder: "Describe the image…  Type / for style tags"
    },
    banner: {
        title: "Guideline banners",
        sub: "The bigbasket layout: headline, offer and button on the left, up to 3 products on the right, 1360 × 800. Fill in the details and vibeMate paints a background to match."
    }
};

// Starter ideas on the empty Create anything screen (click = put in the message box)
export const SUGGESTIONS = [
    { title: "Build a login page", text: "Write a modern, responsive login page in HTML and CSS with email, password, a “Remember me” checkbox and a blue Log in button." },
    { title: "Campaign ideas", text: "Give me 5 campaign ideas for a Diwali dry-fruit sale on bigbasket, each with a headline, a tagline and the target audience." },
    { title: "Write taglines", text: "Write 10 short, catchy taglines for fresh Alphonso mangoes. Keep each under 6 words." },
    { title: "Explain simply", text: "Explain how a CSS grid layout works, with a small example." }
];

// Starter ideas on the empty Image studio screen
export const IMAGE_SUGGESTIONS = [
    "A square social post of fresh Alphonso mangoes on a wooden table, bright morning light",
    "Diwali poster for dry fruit gift boxes with warm golden lights that says “Gift sweetness”",
    "Top-down flat lay of breakfast items: cereal, milk, berries and orange juice"
];

export function normaliseSize(s) {
    if (!s || !(s.w > 0) || !(s.h > 0)) return null;
    const preset = SIZES.find((p) => p.key === s.key);
    return preset ? { ...preset } : { key: "custom", name: "Custom", w: Math.round(s.w), h: Math.round(s.h) };
}

export function ratioBox(w, h, max = 16) {
    const k = max / Math.max(w, h);
    return { w: Math.max(5, Math.round(w * k)), h: Math.max(5, Math.round(h * k)) };
}

export const extOf = (name) => (name.split(".").pop() || "").toLowerCase();

export const areaLabel = (x, y) => {
    const row = y < 0.34 ? "top" : y > 0.66 ? "bottom" : "middle";
    const col = x < 0.34 ? "left" : x > 0.66 ? "right" : "centre";
    return row === "middle" ? (col === "centre" ? "centre" : col) : `${row} ${col}`;
};

// Voice commands on the home page. Ending with "generate" / "send" (or "बनाओ") sends.
export const VOICE_GO = /[\s,.]*\b(?:(?:and\s+|now\s+)?(?:generate(?:\s+(?:it|the banner|my banner|a banner|banner|the image|an image|image|the design|design))?|create\s+(?:it|the banner|my banner|a banner|banner|the image|the design))(?:\s+now)?|go ahead|submit|send(?: it)?)[\s.!]*$/i;
export const VOICE_GO_HI = /[\s,.।]*(?:(?:बैनर\s+)?(?:बनाओ|बना दो|बनाइए)|(?:जनरेट|जेनरेट|জেনারেট|জেনেরেট|జనరేట్|జెనరేట్|ஜெனரேட்|ஜெனரேட|જનરેટ|જેનરેટ|ಜನರೇಟ್|ಜನರೇಟ|ജനറേറ്റ്|ਜਨਰੇਟ|ଜେନେରେଟ|جنریٹ)\S*(?:\s+\S+)?)[\s.!।]*$/;
export const VOICE_CLEAR = /^(?:clear|clear (?:it|all|that|the prompt|prompt|everything)|start over|delete (?:it|all|that))[.!]?$/i;
export const VOICE_HELP = /^(?:help|what can i say)[.?!]?$/i;
export const VOICE_MODE = /^(?:switch to |open |go to )?(create anything|chat mode|assistant|image studio|images?|image mode|guideline(?: banners?)?|banner mode)[.!]?$/i;
