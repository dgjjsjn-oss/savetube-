# MASTER PROMPT — Build SaveTube, the Complete Professional YouTube Downloader

You are a senior product designer AND a senior front-end engineer. Build the
entire SaveTube product — a professional, fast, trustworthy YouTube
downloader website — as one complete, production-grade codebase. Work through
the phases in order. Do not skip steps. Do not produce placeholders or demos.

---

## PHASE 0 — LOAD YOUR SKILLS (do this first, before writing any code)

These skills are ALREADY installed on this machine at `~/.claude/skills/`.
Load the ones you need with your skills tool. At minimum load:
- `ui-ux-pro-max` — overall professional UI/UX standards
- `design-taste-frontend` — premium front-end taste and polish
- `high-end-visual-design` — high-end visual quality bar
- `minimalist-ui` — clean, minimal, focused design
- `stitch-design-taste` — cohesive visual stitching
- `design-motion-principles` — professional motion, transitions, micro-interactions
- `liquid-glass-js` — premium glass surfaces with real WebGL refraction
- `shadergradient` — animated 3D gradient hero background
- `design-system`, `brand`, `ui-styling`, `banner-design`, `slides` — as needed
If any skill is unavailable, continue anyway — this prompt contains every
requirement inline.

---

## PHASE 1 — PRODUCT SPEC (what you are building)

**SaveTube** is a YouTube video and audio downloader. The user flow:
1. Visitor pastes a YouTube URL (or shorts link, or plain video ID) into a big
   input on the home page and clicks **Start**.
2. The site calls the backend API and shows a beautiful result card: thumbnail,
   title, channel, duration, a grid of video qualities with file sizes, and an
   audio tab with bitrates.
3. Visitor picks a quality and clicks **Download** — the file downloads.
4. There is also a **Transcript** toggle that shows the video's captions in-page.

The site must work on mobile and desktop, be in English, load fast, look like a
trusted funded startup (NOT a spammy clone site), and monetize with clean,
policy-compliant ads.

---

## PHASE 2 — API CONTRACT (use EXACTLY these endpoints, never invent others)

- `GET /api/info?v=VIDEO_ID` → JSON:
```json
{
  "ok": true,
  "videoId": "abc123",
  "title": "Video Title",
  "author": "Channel Name",
  "thumbnail": "https://i.ytimg.com/vi/abc123/hqdefault.jpg",
  "durationText": "12:34",
  "qualities": [{"label":"1080p","value":"1080","sizeText":"240 MB"},{"label":"720p","value":"720","sizeText":"120 MB"}],
  "audioBitrates": [{"label":"320 kbps","value":"320"},{"label":"192 kbps","value":"192"}]
}
```
- Download (open in a new tab; the file downloads automatically):
`GET /api/download?v=VIDEO_ID&type=video&quality=1080`
`GET /api/download?v=VIDEO_ID&type=audio&bitrate=320`
- Transcript: `GET /api/transcript?v=VIDEO_ID` → JSON `{ok:true, lines:[{start, dur, text}]}`.
  Render the transcript in-page with timestamps; clicking a timestamp seeks/clicks nothing broken.
- Handle every error state with a friendly, animated, recoverable message — never
  a blank page or raw JSON. Show "try again" and clear guidance.

---

## PHASE 3 — PAGES (all complete, styled, linked in nav + footer, with breadcrumbs)

1. **Home** — hero (animated background + big input + Start), result card,
   How It Works (3 steps), supported formats strip, FAQ accordion (5 best
   questions), and ad placements.
2. **How to Download** — 6 clear steps with visual placeholders, supported
   formats table (video 144p–4K, audio 64–320 kbps, transcript), device
   instructions (Windows/Mac/Android/iPhone), troubleshooting.
3. **FAQ** — 12+ real questions, working animated accordion.
4. **About** — story, what makes SaveTube different, contact CTA.
5. **Contact** — form (name, email, message) with front-end validation and a
   success animation (simulate send after 800ms; no backend needed).
6. **Privacy Policy** — honest and professional: data collected, cookies,
   third-party ads (Google AdSense/DoubleClick), analytics, children's privacy,
   contact.
7. **Terms** — professional ToS: license, acceptable use (personal use,
   respect copyright), disclaimers, liability, changes.

Navigation: sticky translucent header with backdrop blur, logo, links, dark/light
toggle, mobile hamburger with smooth slide-down. Footer: 4 columns (Product,
Company, Legal, Social) + copyright line.

---

## PHASE 4 — DESIGN SYSTEM (exact tokens)

- **Themes**: dark navy (`#0b1220` base) + light mode; toggle persisted in
  localStorage, respects `prefers-color-scheme` on first visit. Never flash the
  wrong theme (inline theme script in `<head>`).
- **Colors**: primary electric blue `#3b82f6`→`#8b5cf6` gradient accent,
  success `#10b981`, error `#ef4444`, neutral grays. Define CSS custom
  properties for every token (colors, spacing, radius, shadows, fonts).
- **Type**: Inter (body) + Space Grotesk (display) via Google Fonts, preconnect.
  Display sizes with `clamp()`: hero headline ~`clamp(2.2rem, 5vw, 4rem)`.
  Proper type scale, line-height 1.1 for headings / 1.65 for body, max measure ~65ch.
- **Shape**: radius tokens 8/12/16/24px; cards use 16–20px; inputs 12px.
- **Depth**: layered soft shadows (2–3 shadow layers), subtle borders
  `rgba(255,255,255,.08)` in dark / `rgba(0,0,0,.06)` in light.
- **Spacing**: consistent 4px base scale (4,8,12,16,24,32,48,64,96).

---

## PHASE 5 — ANIMATIONS (premium but restrained, GPU-friendly only)

Use `design-motion-principles` and `liquid-glass-js` sensibilities:
- Hero: animated aurora/gradient mesh background (CSS `@keyframes` with blurred
  radial gradients — slow 18–30s loops), micro parallax on mouse (transform only).
- Optional premium upgrade (only if smooth): `shadergradient`-style 3D gradient
  hero background in the hero section. If used, reserve section height (no CLS),
  keep content above with z-index, respect reduced motion.
- Glass touches: subtle frosted elements via `backdrop-filter` on the header,
  popup, and result card accents. Use `liquid-glass-js` only for at most 1–2
  signature glass surfaces (e.g., the popup ad card) — never overuse.
- Input + Start button: focus ring animation, Start button subtle pulse/glow ring,
  press scale(0.98), disabled loading state with spinner.
- Result card: staggered fade/slide-in of thumbnail, title, and quality grid.
- Quality selection: ring + checkmark, hover lift 2px.
- Success: checkmark draw-in SVG animation + subtle sparkle (CSS only).
- Error: friendly shake on the card + message.
- Accordions (FAQ): smooth max-height/grid-row animation with proper
  `prefers-reduced-motion` fallback.
- Popup ad: see Phase 7. All animations use transform/opacity ONLY.
  `@media (prefers-reduced-motion: reduce)` disables non-essential motion.

---

## PHASE 6 — ADS (the money layer — smart, professional, policy-safe)

AdSense constants at top of `js/app.js`:
```js
const ADSENSE_CLIENT = "ca-pub-PLACEHOLDER";
const ADSENSE_SLOTS = { leaderboard: "0000000000", in_content: "0000000001", sidebar: "0000000002", footer: "0000000003", popup: "0000000004" };
```
Placements (exact, minimal, not spammy):
1. **Leaderboard** — below header, above hero (responsive; hidden on very small screens if it causes CLS issues).
2. **In-content** — one unit between the result card and How It Works.
3. **Sidebar** — on FAQ/How-to/About pages, desktop (160x600), hidden on mobile.
4. **Footer** — one responsive unit above the footer.
Every ad container has `min-height` reserved (e.g., 250px for responsive units,
600px sidebar) so layout never shifts (CLS = 0).
Populated ONLY when the real AdSense IDs are present (guard with a check: if
`ADSENSE_CLIENT` contains "PLACEHOLDER", render an empty labelled slot instead
of loading the real ad script — keeps the demo clean and the site policy-safe).

**Animated popup ad (signature feature, exactly once per session):**
- Trigger: 8 seconds after load OR immediately after the visitor completes their
  FIRST download action (whichever comes first) — but only once per session
  (localStorage flag `savetube_popup_seen`).
- Design: premium product-promotion card, NOT a spam popup. Rounded 16–20px,
  layered shadow, small gray "Ad" label top-right (required), clear X close
  button (44px hit area), generous padding.
- Animation: entrance scale(0.92→1) + fade + slide-up 14px over 300ms cubic
  ease; CTA button shimmer sweep (a light band crosses once every 6s); floating
  badge on the mock product (`translateY ±6px`, 8s loop); gentle card float on
  the whole popup; exit animation (scale down + fade, 200ms) before removal.
- Contents: placeholder promo (headline + subtext + CTA button + small product
  mockup) with `data-ad-slot` region for the real AdSense interscroller/ad unit.
- Overlay: `rgba(0,0,0,.5)` backdrop blur 4px, click-outside closes. Never
  blocks required UI; always dismissible; never auto-opens more than once.
- Respect reduced motion: fade only, no float/shake.

---

## PHASE 7 — SEO (Lighthouse SEO = 100)

- Unique `<title>` + meta description per page; meta robots, canonical.
- Open Graph + Twitter Card tags everywhere (image, title, description, url).
- JSON-LD structured data: `WebApplication` on Home, `FAQPage` on FAQ,
  `BreadcrumbList` on inner pages, `Organization` in footer/site-wide.
- Semantic HTML5 (header/nav/main/section/article/footer), exactly one `h1` per
  page, logical heading hierarchy, descriptive alt text on all images.
- `robots.txt` + `sitemap.xml` (all 7 pages) + preconnect to fonts,
  defer all JS, inline critical CSS.
- WCAG AA: contrast verified, keyboard operable, visible focus rings, ARIA
  labels, `prefers-reduced-motion` support.

---

## PHASE 8 — PERFORMANCE (Lighthouse ≥ 95 mobile)

- No render-blocking JS: all scripts `defer`; critical CSS inlined in `<head>`.
- Lazy-load below-fold images (`loading="lazy"`), `fetchpriority="high"` on hero image.
- Zero layout shift: reserved heights for ads, hero, buttons, and result card.
- Mobile-first responsive: breakpoints 640/768/1024/1280; verify every screen at 360px.
- Modern CSS only (grid, clamp(), gap, custom properties). No jQuery. Vanilla JS.
- Keep the JS bundle small; organize with clear section comments.

---

## PHASE 9 — CONTENT (write real copy — no lorem ipsum anywhere)

Write natural, confident, human copy throughout. Home hero H1 example direction:
"Download YouTube videos in seconds — free, fast, no install." Subhead explains
formats and safety. How It Works steps are numbered and concrete. FAQ answers
are complete, honest paragraphs (include "Is SaveTube free?" = yes; "Is it
legal?" = personal-use framing + respect copyright; "Why is the download
slow?" = first download may take time, repeats are instant; "Do I need to
install anything?" = no). Match the tone: helpful, professional, zero hype.

---

## PHASE 10 — DELIVERABLES (complete file set, self-contained, no build step)

- `index.html` — home
- `how-it-works.html`
- `faq.html`
- `about.html`
- `contact.html`
- `privacy.html`
- `terms.html`
- `css/styles.css` — one shared stylesheet, fully commented, token-driven
- `js/app.js` — download flow, API calls, dark mode, popup ad, analytics hooks.
  Top-of-file `// README` comment: how to swap in real AdSense IDs, how to
  change the API base URL.
- `js/theme.js` — tiny inline-friendly theme script (dark/light, no flash)
- `robots.txt`
- `sitemap.xml`
Output every file completely. Then, in your final message, give a short
build-order summary and a checklist of what maps to each requirement above so
it is easy to verify against this prompt.

---

## QUALITY BAR (verify before you finish)

1. Open every page at 360px and 1440px — nothing breaks, nothing overflows.
2. Paste any valid YouTube URL → Start → result card appears → picking a
   quality and clicking Download actually starts a file download.
3. Dark/light toggle works everywhere and never flashes on load.
4. Popup ad appears exactly once per session, animates smoothly, closes cleanly.
5. No console errors. Lighthouse mobile ≥ 95 Performance, 100 SEO.
6. Every link navigates to a real page; no dead buttons; no placeholder copy.
Deliver only when ALL of the above pass. You may iterate as many times as needed.