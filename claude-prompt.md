# You are a senior product designer + front-end engineer.

Build the COMPLETE, BEST-POSSIBLE version of a professional YouTube downloader website (product name: **SaveTube** — fastest YouTube downloader). This is a real working product people will use daily. Do not produce a demo or placeholder. Every page, button, and animation must be production-grade.

## Product behavior (must be implemented exactly)
1. Visitor pastes a YouTube URL (or video ID, or "youtube.com/watch?v=" link, or shorts link) into a big input on the home page and clicks **Start**.
2. The site calls the backend API (details below) to get the video info + available formats.
3. Visitor picks a video quality OR audio quality, clicks **Download**, and the file download starts.
4. Every page must work: Home, How to Download, FAQ, About, Contact, Privacy Policy, Terms.
5. The whole site must be in English, ultra-fast, mobile-first, and SEO-ready.

## Backend API contract (use these EXACT endpoints — do not invent others)
- `GET /api/info?v=VIDEO_ID` → JSON:
```json
{
  "ok": true,
  "videoId": "abc123",
  "title": "Video Title",
  "author": "Channel Name",
  "thumbnail": "https://i.ytimg.com/vi/abc123/hqdefault.jpg",
  "durationText": "12:34",
  "qualities": [{"label":"1080p","value":"1080","sizeText":"240 MB"}, {"label":"720p","value":"720","sizeText":"120 MB"}],
  "audioBitrates": [{"label":"320 kbps","value":"320"}]
}
```
- Download (open in browser, file downloads automatically):
`GET /api/download?v=VIDEO_ID&type=video&quality=1080`
`GET /api/download?v=VIDEO_ID&type=audio&bitrate=320`
- Transcript: `GET /api/transcript?v=VIDEO_ID` → JSON with `{ok, lines:[{start, dur, text}]}` (show formatted transcript in-page with click-to-seek).
- On any API error: show a friendly animated error state, never a blank page.

## Design direction
- **Modern, clean, premium, professional** — think Stripe × y2mate, but better. NOT a cheap clone. No generic bootstrappy look.
- Dark navy + white light theme with a **dark/light mode toggle** (persisted in localStorage).
- Typography: big, bold, confident headline (system font stack or Google Fonts — Inter + Space Grotesk).
- Subtle, tasteful, smooth animations: fade/slide on section reveal, hover micro-interactions, animated gradient/aurora background on the home hero (CSS only, GPU-friendly), button press effects. Do NOT overanimate — it must not hurt Lighthouse.
- Rounded cards, soft shadows, good spacing. The hero should feature the big download input with animated placeholder + a "Start" button with pulse/glow.
- After info loads, show a beautiful results card: thumbnail, title, quality grid (video) with sizes, audio toggle (bitrates), transcript toggle. Selecting quality highlights it with a ring + checkmark.

## ADS (very important — this is how the site makes money)
- Integrate **Google AdSense** (adsbygoogle) properly for production, with **ad slot IDs as clearly-marked constants** at the top of the JS (so real AdSense units can be swapped in: `const ADSENSE_CLIENT = "ca-pub-PLACEHOLDER"; const ADSENSE_SLOTS = {leaderboard: "1234567890", in_content: "2234567890", sidebar: "3234567890", popup: "4234567890"};`).
- Ad placements (professional, not spammy):
  1. **Leaderboard** — top of page (728x90 desktop / responsive).
  2. **In-content** — one ad between the results card and the "how it works" section.
  3. **Sidebar/right** — on FAQ and content pages (skyscraper 160x600 desktop, hidden on mobile).
  4. **Footer** — one responsive footer ad.
- **Animated popup ad** (this is the signature request):
  - After the user completes their FIRST download interaction (or 8 seconds after page load), show a single, professional animated popup ad.
  - Design it like a premium product promotion card, NOT a spammy popup: rounded 16px card, soft shadow, small "Ad" label in the corner (required by AdSense policy), clear **X close button**, entrance animation (scale+fade+slide-up, 300ms ease), subtle pulse/glow on the CTA button.
  - Contents: a placeholder promotional banner (headline + subtext + CTA button) with `data-ad-slot` regions — the real AdSense "interscroller"/"anchor"/"pop-under" can replace it.
  - Show it at most once per session (localStorage flag). Never block the page; always dismissable; never auto-open more than once.
  - Add **animation** to the ad: shimmer sweep across the CTA, floating badge on the product mockup, smooth entrance, gentle floating animation on the card (8s loop, translateY ±6px).
- All ad containers must have minimum height reserved to prevent layout shift (CLS = 0).

## Pages (all must be complete, styled, linked in nav + footer)
1. **Home** — hero input + results card + how-it-works (3 steps) + FAQ accordion (see below) + ad placements.
2. **How to Download** — step-by-step guide (with screenshots-style illustrated placeholders), supported formats table (MP4 144p–4K, MP3 64–320kbps, transcripts), troubleshooting tips.
3. **FAQ** — 12+ real questions with working accordion animation:
   - Is SaveTube free? / Why is the download slow? / What formats are supported? / How do I download only audio? / Can I download 4K? / Is it legal? / Do I need to install anything? / Why did the download not start? / How do I get a transcript? / Does it work on mobile? / Is my data safe? / How do I contact support?
4. **About** — mission, why SaveTube, what makes it fast, contact CTA.
5. **Contact** — simple working form (name, email, message) with front-end validation + success animation (mailer backend NOT needed — simulate success after 800ms).
6. **Privacy Policy** — honest, professional, sections: data we collect, analytics (Google Analytics + AdSense), cookies, third-party ads (Google AdSense/DoubleClick), children's privacy, contact.
7. **Terms** — professional terms of service: license to use, acceptable use (no copyright infringement, personal use, respecting YouTube ToS), disclaimers, liability, changes.

## Navigation
- Sticky translucent header with blur (backdrop-filter), logo left, nav links center/right, dark/light toggle, mobile hamburger menu with slide-down animation.
- Breadcrumbs on inner pages. Working footer (4 columns: Product, Company, Legal, Social) + copyright.

## SEO (score 100 on Lighthouse SEO)
- Unique `<title>` + meta description per page.
- Open Graph + Twitter Card tags on every page.
- Canonical URLs, JSON-LD structured data (WebApplication + FAQPage on the FAQ page + BreadcrumbList).
- Semantic HTML5 (header/nav/main/section/article/footer), one h1 per page, proper heading hierarchy, alt texts.
- `robots.txt` reference + sitemap link. Preconnect to fonts. Defer all JS, inline critical CSS.
- Perfect contrast (WCAG AA). All interactive elements keyboard-accessible, focus-visible styles, ARIA labels, reduced-motion support (`@media (prefers-reduced-motion: reduce)`).

## Performance (Lighthouse ≥ 95 on mobile)
- Single-page app feel for the download flow, but MUST work without JS for static content (progressive enhancement).
- No render-blocking JS (defer), CSS critical inline, lazy-load images below the fold.
- Responsive: mobile-first, breakpoints at 640/768/1024/1280. Test every component at 360px width.
- No layout shift: fixed aspect/height for ad slots, images, and buttons.
- Use modern CSS (grid, clamp(), gap, custom properties). No jQuery. Vanilla JS or small modules only.
- All animations use transform/opacity only (GPU-cheap). `will-change` only when needed.

## Deliverables
Output a complete, copy-pasteable project:
- `index.html` (home)
- `how-it-works.html`
- `faq.html`
- `about.html`
- `contact.html`
- `privacy.html`
- `terms.html`
- `css/styles.css` (one shared stylesheet, fully commented, with CSS custom properties for the theme)
- `js/app.js` (download flow + API calls + dark mode + popup ad logic + analytics hooks)
- `js/seo.js` (JSON-LD generation) – optional, can be inline
- `robots.txt`
- `sitemap.xml` (with all pages)
Everything must be self-contained (no build step, no framework) and run when opened locally. Keep JavaScript organized with clear section comments. Add a `README` section comment at the top of app.js explaining how to swap in real AdSense IDs and how to change the API base URL if needed.

Quality bar: this should look like a funded startup's product page — something a user would trust and actually use. Polish every state: loading (spinner + skeleton shimmer), success (checkmark animation + confetti-ish subtle sparkle), error (friendly, recoverable). No lorem ipsum in visible text; write real, natural copy.