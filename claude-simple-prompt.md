# Build SaveTube — a complete YouTube downloader website

You are a senior full-stack developer AND designer. Build the ENTIRE website
now — complete, working, production-ready. Do not ask questions. Do not show
plans. Do not explain your approach. Just build everything and output all files.

YOU decide the design — colors, fonts, layout, animations, everything. Make it
look premium and professional (think: a trusted startup, not a spammy clone
site). Use your best taste.

## What it is
SaveTube — a free YouTube downloader like y2mate. Users paste a YouTube link,
see the video's info + all quality options, download as video (MP4) or audio
(MP3), and can view the transcript.

## How it works (backend already built — use these APIs EXACTLY)
- GET /api/info?v=VIDEO_ID → returns JSON: { ok, videoId, title, author,
  thumbnail, durationText, qualities:[{label,value,sizeText}], audioBitrates:[{label,value}] }
- GET /api/download?v=VIDEO_ID&type=video&quality=1080 → starts video download
- GET /api/download?v=VIDEO_ID&type=audio&bitrate=320 → starts MP3 download
- GET /api/transcript?v=VIDEO_ID → returns JSON: { ok, lines:[{start,dur,text}] }

Test video ID: dQw4w9WgXcQ

Handle every error with a friendly, clear message — NEVER show raw JSON or a
blank page. Always let the user try again.

## Pages (build all 7, linked in nav + footer)
1. Home — big URL input + Start button, result card (thumbnail, title, channel,
   duration), video quality buttons, audio tab, transcript toggle
2. How to Download — steps + supported formats + device instructions
3. FAQ — 12+ real questions, working accordion
4. About — what SaveTube is and why it's different
5. Contact — name/email/message form with validation + success animation
6. Privacy Policy — honest, professional, includes third-party Adsense cookies
7. Terms — professional ToS, personal-use + copyright-respect framing

## Ads (money layer)
- Google AdSense-ready: define ADSENSE_CLIENT = "ca-pub-PLACEHOLDER" and slots
  at the top of js/app.js so it's one-line to swap in real IDs.
- 4 placements max: leaderboard, one in content, sidebar (desktop only), footer.
  Reserve min-height for every ad container so NOTHING shifts layout.
- ONE professional popup ad per session: "Ad" label, close button, appears once
  (8s after load OR right after first download — whichever comes first), smooth
  entrance/exit animations, click-outside closes. Never more than once.
- If ADSENSE_CLIENT contains "PLACEHOLDER", do NOT load the real ad script —
  render empty labelled slots instead.

## Requirements
- Mobile-first responsive (must work perfectly at 360px), dark theme with a
  light toggle, no theme flash on load
- Fast: defer all JS, inline critical CSS, lazy-load images, zero layout shift
- SEO: unique titles + meta descriptions per page, Open Graph tags, JSON-LD
  (WebApplication on home, FAQPage on FAQ), robots.txt, sitemap.xml
- Lighthouse ≥ 95 Performance mobile, 100 SEO
- Real, natural English copy everywhere — no lorem ipsum

## Deliverables (all complete, no build step, plain HTML/CSS/JS)
- index.html, how-it-works.html, faq.html, about.html, contact.html,
  privacy.html, terms.html
- css/styles.css (one shared stylesheet, commented, css variables)
- js/app.js (download flow, dark mode, ads, popup — with README comment on top
  explaining how to swap in real AdSense IDs)
- js/theme.js, robots.txt, sitemap.xml

Output every file completely. Then a 5-line summary: what you built and how it
maps to this prompt.