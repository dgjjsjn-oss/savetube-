# SaveTube — Free YouTube Downloader Website

A y2mate-style downloader site. Plain HTML, CSS and JavaScript.
**No React, no Vite, no build step, no server, no laptop daemon.**
Upload the folder to a free host and it runs.

---

## What it does

1. Visitor pastes a YouTube link.
2. Your site looks the video up for free and shows the **real title + thumbnail**.
3. Visitor picks a format:
   - **Video (MP4):** 4K (2160p), 1440p, 1080p, 720p, 360p
   - **Audio (MP3):** 320 / 256 / 192 / 128 / 64 kbps
4. They hit the **unlock gate** (one ad step — this is your income).
5. They complete the download on the partner page and come back for more.

The site itself never stores or serves video files, so it stays free.

---

## Files

```
yt-downloader/
  index.html              home + downloader + unlock modal
  404.html                custom not-found
  privacy-policy.html     ~400 words
  terms-of-service.html   ~400 words
  cookie-policy.html      ~400 words
  disclaimer.html         ~400 words
  sitemap.xml
  robots.txt
  favicon.svg
  css/style.css
  js/config.js            EDIT THIS: everything you can change
  js/app.js
  README.md
```

---

## Set it up (5 minutes)

Open `js/config.js`:

| Setting | What it does |
|---|---|
| `domain` | Your real domain once you have one |
| `siteName` | The name shown on the site |
| `adUnlockUrl` | **The money key.** The ad page opened before every download. Leave `""` to skip the gate (fine for testing) |
| `downloadPartnerUrl` | The free service that sends the file bytes. `{VIDEO_ID}` and `{FORMAT}` are replaced automatically |
| `transcriptPartnerUrl` | Free transcript viewer. `{VIDEO_ID}` is replaced |
| `videoFormats` / `audioFormats` | The quality buttons |

Then find/replace `https://yoursite.com` in all HTML files + `sitemap.xml` with your real domain.

---

## How you get paid with NO bank account

The unlock gate is the money maker: every download and every transcript =
at least one ad view (that is 1+ ad clicks per visit = your "at least 100
clicks" goal, per 100 visitors).

### Ad networks that pay without a bank
| Network | Payout methods | Minimum |
|---|---|---|
| **Adsterra** | USDT crypto, WebMoney, Payoneer, PayPal, wire | ~$100 (some methods lower) |
| **PropellerAds** | USDT crypto, Payoneer, WebMoney, wire | ~$50 |

Crypto payout → swap to cash via a local P2P exchanger. **No bank required.**

- Put `adUnlockUrl` = a shortlink/CPA/ad page → visitors pass through it
  before the download (classic link-locker model).
- Also paste banner/popunder codes from these networks into the `.ad-slot`
  divs in `index.html`.

> Avoid Google AdMob/AdSense for now: they pay mostly to bank accounts.

---

## How to get a FREE domain (or nearly free)

Order of trying, cheapest first:

1. **Cloudflare Pages free subdomain** — `anything.pages.dev`
   Deploy the folder there. Free forever. Ad networks often prefer a real
   domain, but this gets you online today at $0.

2. **eu.org — FREE real-looking domain** — `yourname.eu.org`
   - Go to https://nic.eu.org → register an account → request a domain.
   - Approval takes a few days (it is free, no payment needed).
   - It is a real domain with DNS, and many ad networks accept it.

3. **is-a.dev — FREE** — `yourname.is-a.dev`
   - Via GitHub: add a repo `yourname.github.io` and register at
     https://www.is-a.dev → approved in ~1 day.
   - More developer-oriented; ad networks may decline it.

4. **First-year cheap deals (~$1–3)** — only if you ever get a little money:
   - Namecheap / Porkbun first-year `.xyz`, `.top`, `.site` promos.
   - Cloudflare Registrar sells at wholesale price (no markup) once you have any domain.

For ad-network approval, aim for **eu.org** before free subdomains.

---

## Why the download completes on a partner, not on your server

YouTube blocks free websites from streaming video files (2026: direct player
API is locked behind tokens, and every free downloader API has been shut down
or bot-protected). This is also why y2mate clones redirect users.

Your site still owns the whole experience: lookup, quality selection,
unlock gate, transcript, design, domain, ads. Only the final file bytes come
from a free partner site.

**Want 100% own downloads?** The only way is your own server with `yt-dlp`
(a small VPS costs ~$3–5/month and YouTube also blocks many data-center IPs).
The current setup costs $0 and earns per click.

---

## Deploy free

**Cloudflare Pages:**
1. Push this folder to a GitHub repo (or use direct upload).
2. Cloudflare dashboard → Pages → Create project → connect repo.
3. Build command: leave empty. Output: `/`. Deploy.

**GitHub Pages:** push to repo → Settings → Pages → deploy from branch root.
`404.html` is served automatically.

**Netlify:** create `_redirects` with `/* /404.html 404`.

---

## Test locally (preview only)

```
cd yt-downloader
python -m http.server 8080
```

Visit http://localhost:8080. This is only for preview; the live site needs no server.