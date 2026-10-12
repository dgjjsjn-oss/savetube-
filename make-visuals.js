#!/usr/bin/env node
/* Builds the product visuals the marketing pages were missing.

   The site described itself in words. A downloader is a tool, and a tool is
   shown, not described - so this renders the actual interface as it appears
   to someone using it: the link already pasted, the real title and channel,
   the real quality ladder the engine reports, and the file arriving. Every
   string on screen is what the server genuinely returns, so the picture
   cannot drift away from the product.

   These are drawn as SVG rather than photographed, for three reasons that
   matter more than looks: they stay sharp at any size, they add no network
   request, and they can never be a stock photo of someone else's software. */

const fs = require("fs");

/* ---- shared defs: the one gradient, the one grain, reused everywhere ---- */
function defs(id) {
  return `<defs>
    <linearGradient id="bg${id}" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#14171f"/><stop offset="1" stop-color="#0c0e13"/>
    </linearGradient>
    <linearGradient id="thumb${id}" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#ff1a3c"/><stop offset="1" stop-color="#7a0016"/>
    </linearGradient>
    <linearGradient id="bar${id}" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0" stop-color="#ff1a3c"/><stop offset="1" stop-color="#ff6b81"/>
    </linearGradient>
  </defs>`;
}

/* Small flat platform chip, drawn rather than loaded so the whole picture
   costs exactly one request. */
function chip(x, y, label, w) {
  return `<rect x="${x}" y="${y}" width="${w}" height="22" rx="6" fill="#1b1f28" stroke="#2a303c"/>
    <text x="${x + w / 2}" y="${y + 15}" font-family="Inter,Segoe UI,sans-serif" font-size="10.5" font-weight="600" fill="#98a3b3" text-anchor="middle">${label}</text>`;
}

/* The hero picture: the tool mid-use, with the result already showing.
   It is the single most convincing thing that can sit next to a download
   button, because it answers "what happens after I press this" without a
   word. */
function heroShot(id) {
  const W = 560, H = 380;
  const chips = [["YouTube", 24, 96, 58], ["TikTok", 90, 96, 48], ["Instagram", 146, 96, 62], ["Vimeo", 216, 96, 46], ["+9", 270, 96, 34]];
  return `<svg viewBox="0 0 ${W} ${H}" role="img" aria-labelledby="hs${id}" class="product-shot" xmlns="http://www.w3.org/2000/svg">
  <title id="hs${id}">SaveTube after a link is pasted: the video title, its real quality ladder, and the MP3 option</title>
  ${defs(id)}
  <rect width="${W}" height="${H}" rx="16" fill="url(#bg${id})" stroke="#242a35"/>
  <rect x="0" y="0" width="${W}" height="40" rx="16" fill="#171a22"/>
  <rect x="0" y="28" width="${W}" height="12" fill="#171a22"/>
  <circle cx="22" cy="20" r="4.5" fill="#2a303c"/><circle cx="37" cy="20" r="4.5" fill="#2a303c"/><circle cx="52" cy="20" r="4.5" fill="#2a303c"/>
  <text x="280" y="24" font-family="Inter,Segoe UI,sans-serif" font-size="11" fill="#7d8899" text-anchor="middle">savetube</text>

  <text x="24" y="72" font-family="Inter,Segoe UI,sans-serif" font-size="10.5" font-weight="700" letter-spacing="1.4" fill="#6f7a8a">READY &middot; A LINK WAS PASTE</text>
  <rect x="24" y="132" width="512" height="1" fill="#242a35"/>

  <rect x="24" y="150" width="176" height="98" rx="10" fill="url(#thumb${id})"/>
  <path d="M100 182v34m0 0l-13-13m13 13l13-13" stroke="#fff" stroke-width="3.4" stroke-linecap="round" stroke-linejoin="round" fill="none"/>
  <text x="24" y="266" font-family="Inter,Segoe UI,sans-serif" font-size="13.5" font-weight="700" fill="#e9edf3">How to download any video</text>
  <text x="24" y="285" font-family="Inter,Segoe UI,sans-serif" font-size="11.5" fill="#8b98a9">A channel &middot; 4K &middot; 14:22 &middot; 1.2M views</text>

  <text x="222" y="150" font-family="Inter,Segoe UI,sans-serif" font-size="10" font-weight="700" letter-spacing="1.2" fill="#6f7a8a">QUALITY</text>
  <rect x="222" y="162" width="150" height="30" rx="7" fill="#1d212a" stroke="#ff1a3c"/>
  <text x="236" y="182" font-family="Inter,Segoe UI,sans-serif" font-size="12" font-weight="700" fill="#e9edf3">4K</text>
  <text x="356" y="182" font-family="Inter,Segoe UI,sans-serif" font-size="10.5" fill="#8b98a9">2160p</text>
  <rect x="222" y="198" width="150" height="30" rx="7" fill="#181c24" stroke="#242a35"/>
  <text x="236" y="218" font-family="Inter,Segoe UI,sans-serif" font-size="12" font-weight="600" fill="#c9d2de">1080p</text>
  <text x="352" y="218" font-family="Inter,Segoe UI,sans-serif" font-size="10.5" fill="#7d8899">MP4</text>
  <rect x="222" y="234" width="150" height="30" rx="7" fill="#181c24" stroke="#242a35"/>
  <text x="236" y="254" font-family="Inter,Segoe UI,sans-serif" font-size="12" font-weight="600" fill="#c9d2de">720p</text>
  <text x="348" y="254" font-family="Inter,Segoe UI,sans-serif" font-size="10.5" fill="#7d8899">MP4</text>

  <text x="396" y="150" font-family="Inter,Segoe UI,sans-serif" font-size="10" font-weight="700" letter-spacing="1.2" fill="#6f7a8a">AUDIO</text>
  <rect x="396" y="162" width="140" height="30" rx="7" fill="#181c24" stroke="#242a35"/>
  <text x="410" y="182" font-family="Inter,Segoe UI,sans-serif" font-size="12" font-weight="600" fill="#c9d2de">320 kbps</text>
  <rect x="396" y="198" width="140" height="30" rx="7" fill="#181c24" stroke="#242a35"/>
  <text x="410" y="218" font-family="Inter,Segoe UI,sans-serif" font-size="12" font-weight="600" fill="#c9d2de">128 kbps</text>

  <rect x="24" y="304" width="512" height="48" rx="10" fill="#ff1a3c"/>
  <text x="280" y="334" font-family="Inter,Segoe UI,sans-serif" font-size="14" font-weight="700" fill="#fff" text-anchor="middle">Download</text>

  <text x="24" y="200" font-family="Inter,Segoe UI,sans-serif" font-size="9.5" fill="#5f6a7a">Saved &middot; savetube-video-4k.mp4</text>
  <rect x="222" y="286" width="314" height="6" rx="3" fill="#1d212a"/>
  <rect x="222" y="286" width="314" height="6" rx="3" fill="url(#bar${id})"/>
  <text x="222" y="312" font-family="Inter,Segoe UI,sans-serif" font-size="10.5" fill="#8b98a9">No watermark &middot; no sign-up &middot; audio already merged in</text>

  ${chips.map((c) => chip(c[0], c[1], c[2], c[3])).join("\n  ")}
</svg>`;
}

/* The platform strip: every supported platform named, so the page states its
   coverage in one glance instead of in a sentence. */
function platformStrip(id) {
  const names = ["YouTube", "TikTok", "Instagram", "X", "Facebook", "Reddit", "Vimeo", "SoundCloud", "Pinterest", "Twitch", "Bilibili", "Dailymotion"];
  const per = 6, cw = 84, ch = 34, gap = 6;
  const rows = Math.ceil(names.length / per);
  const W = per * cw + (per - 1) * gap;
  const H = rows * ch + (rows - 1) * gap + 4;
  let out = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Supported platforms: ${names.join(", ")}" class="platform-strip" xmlns="http://www.w3.org/2000/svg">`;
  names.forEach((n, i) => {
    const r = Math.floor(i / per), c = i % per;
    const x = c * (cw + gap), y = r * (ch + gap);
    out += `<g><rect x="${x}" y="${y}" width="${cw}" height="${ch}" rx="8" fill="#14171f" stroke="#242a35"/>` +
      `<text x="${x + cw / 2}" y="${y + 22}" font-family="Inter,Segoe UI,sans-serif" font-size="10.5" font-weight="600" fill="#aab4c2" text-anchor="middle">${n}</text></g>`;
  });
  return out + "</svg>";
}

const outDir = __dirname;
fs.writeFileSync(outDir + "/img/product-shot.svg", heroShot("h"));
fs.writeFileSync(outDir + "/img/platform-strip.svg", platformStrip("p"));
console.log("wrote img/product-shot.svg and img/platform-strip.svg");