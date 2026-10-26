# vibeMate 1.1

A design and writing tool for bigbasket, built with React + Vite, a small Node server and MongoDB.

| Part | What it does |
|---|---|
| **Create anything** | An AI assistant: questions, writing, ideas, documents, code. Code comes in blocks with **Copy**, **Download** and (for web pages) a live **Preview**. |
| **Image studio · AI image** | Describe any image: any size, `/` style tags, reference images, **Edit with pins**, download as PNG / JPG / PDF. Uses FLUX. |
| **Image studio · Guideline banner** | **New guideline banner** opens a pop-up with a **brand kit** and an **image model** (FLUX or Pixazo). The banner opens in the editor and is saved in your account. |
| **History** | Everything from the last 30 days. |
| **Setup** (new in 1.1) | Up to **5 brand kits**: sample images, voice of tone, fonts and sizes for headline, sub text, offer and button, and banner defaults. |

Everything is saved per person in MongoDB and **deleted automatically 30 days after its last change**. Brand kits are kept until you delete them.

## What's new in 1.1
See [CHANGELOG.md](CHANGELOG.md).

## Set it up

1. Restore your `node_modules` (root and `src/server`), or run `npm install` in both folders. 1.1 adds **no new packages**.
2. Keep your existing `src/server/.env` and add the new lines from `src/server/.env.example`:
   ```
   PIXAZO_API_KEY=your-key        # free key: https://api-console.pixazo.ai/api_keys
   BRANDKIT_SCOPE=user            # or "team": everyone shares the same 5 kits
   ```
3. Apps Script: **nothing to change**. 1.1 still uses Code.gs v9.0.

## Run it

```bash
# terminal 1: the server (port 4000)
cd src/server
npm run dev

# terminal 2: the app (port 5173)
npm run dev
```

Open http://localhost:5173, log in, then go to **Setup** to make your first brand kit.

## Put it online

```bash
npm run build                # makes dist/
cd src/server && npm start   # serves the API and dist/ together
```

## Image models (guideline banners)

| Model | Cost | Uses sample images | Notes |
|---|---|---|---|
| FLUX · Cloudflare (`cf-flux`) | Free (Cloudflare quota) | Yes | The 1.0 model, through Apps Script |
| Flux Schnell · Pixazo | Free | No (text prompt) | Fast, sharp |
| SDXL · Pixazo | Free | No | Photographic |
| SDXL Lightning · Pixazo | Free | No | Quickest |
| Flux 2 Klein · Pixazo | Paid, very low cost | No | Add it to `PIXAZO_MODELS` |
| FLUX 3 Klein · Pixazo | Paid | No | Add it to `PIXAZO_MODELS` |

- **Fill in fields**: your text is used as typed, and the chosen model paints the background.
- **Write a prompt**: Apps Script writes the text in the brand kit's voice while Pixazo paints the background, both at the same time.
- If Pixazo fails, FLUX paints the background instead and the editor shows a note.
- To add a model, add one entry to `src/server/imageModels.js`.

## Where things are

| Path | What it is |
|---|---|
| `index.html`, `src/main.jsx`, `src/App.jsx` | Home: Create anything + Image studio |
| `src/components/AppShell.jsx` | Shared layout: sidebar (now with **Setup**), mode switch, Recent, Log out |
| `src/components/BannerDialog.jsx` | "New guideline banner" pop-up, with the brand kit and model dropdowns |
| `setup.html`, `src/setup/` | **Setup** page: brand kits (`SetupPage.jsx`) and live preview (`KitPreview.jsx`) |
| `src/lib/brandKit.js` | Brand kit rules (tones, fonts, sizes, cleaning), shared by the browser and the server |
| `src/lib/setupApi.js`, `src/lib/fonts.js` | Brand kit / AI calls · Google Fonts loader |
| `bannercreation.html`, `src/editor/` | Guideline banner editor (`?id=<banner id>`), drawn with the banner's brand kit style |
| `history.html`, `src/history/` | History page |
| `login.html`, `src/auth/` | Log in / sign up |
| `src/styles/` | `style.css` (theme), `shell.css`, `app.css`, `bannercreation.css`, `auth.css`, `setup.css` |
| `src/server/` | Node server: login, chats, banners, history, Apps Script proxy |
| `src/server/routes/brandKits.js` | `/api/brandkits`: up to 5 kits, one default |
| `src/server/routes/ai.js` | `/api/ai`: models, new guideline banner, AI background, Pixazo images |
| `src/server/imageModels.js`, `src/server/pixazo.js` | Model list · Pixazo API client (the key stays on the server) |
