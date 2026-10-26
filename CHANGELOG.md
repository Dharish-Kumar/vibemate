# Changelog

## 1.1 · October 2026

### New
- **Setup** in the left sidebar (`setup.html`): brand kits with four tabs
  - **Sample images**: up to 3 per kit. FLUX copies their background style (not their text or products).
  - **Voice of tone**: Friendly, Professional, Bold, Playful, Premium or Festive, English or Hinglish, voice notes, audience, words to avoid.
  - **Typography**: font, weight, size and colour for headline, sub text, offer and button (24 Google Fonts, including Devanagari ones). Headline ALL CAPS and line height; button shape and text colour.
  - **Banner defaults**: image model, background theme, background style words, button text, text background, T&C, use brand colours.
  - Live 1360 × 800 preview. **Up to 5 brand kits**, enforced in MongoDB; an info message on the page shows how many are used. One kit is the **default**.
- **New guideline banner** pop-up: **Brand kit** dropdown (default kit first, remembers the last one) and **Image model** dropdown.
- New banners follow the chosen brand kit: tone goes into the text prompt, samples and background style into the image prompt, and fonts, sizes, weights and colours go onto the banner.
- **Pixazo image models** for guideline banners: Flux Schnell, SDXL and SDXL Lightning (free). Paid Flux 2 Klein and FLUX 3 Klein can be switched on in `server/.env`. "Create anything" and the AI image chat stay on FLUX.
- Editor, Manual tab: **Brand kit** section to apply a kit to an existing banner, and an **Image model** picker for the AI background.

### Changed
- The banner editor draws text with the banner's own brand kit style (kept in the banner's `extras`), so changing a kit later never changes banners you already made.
- If a Pixazo model fails, FLUX paints the background instead and you get a note. Nothing is lost.
- Pixazo backgrounds are stored in MongoDB (`aiimages`) as `px:<id>` and kept for as long as the banner that uses them.
- `extras` can now hold up to 8,000 characters (it was 4,000).

### Server
- New: `imageModels.js`, `pixazo.js`, `routes/ai.js`, `routes/brandKits.js`, `src/lib/brandKit.js` (shared by the browser and the server).
- New collections: `brandkits`, `aiimages` (TTL index).
- New `.env` settings: `PIXAZO_API_KEY`, `PIXAZO_MODELS`, `IMAGE_MODEL_DEFAULT`, `BRANDKIT_SCOPE`.
- No new npm packages. **Code.gs is unchanged** (v9.0).
