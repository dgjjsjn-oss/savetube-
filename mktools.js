#!/usr/bin/env node
/* ============================================================
   mktools.js  -  generate the per-platform downloader pages.

   WHY A GENERATOR
   ---------------
   Each platform page is the same working console with different words on
   it. Hand-writing each one means the next time the console markup, the
   script versions or the footer change, six pages drift apart and the site
   slowly looks broken in six places instead of one. Generating them from
   one description per platform means a single edit here updates all of
   them, and a new platform is one more entry rather than one more file.

   The console itself is COPIED from an existing page verbatim, so these
   pages behave exactly like the hand-built ones - same ids, same form, same
   script stack. Only the words around it change.

   HOW TO USE
   ---------
     node mktools.js            regenerate every page below
     node mktools.js --check    report drift without writing anything
   ============================================================ */

const fs = require("fs");
const path = require("path");

const HERE = __dirname;
const BASE = "https://savetube-0mrq.onrender.com";

/* The page used as the structural donor. If the console markup ever changes
   in the repo, re-point this at the page that is most current. */
const DONOR = "tiktok-downloader.html";

/* One entry per page. The first four words of `title` matter: they are the
   search phrase the page is built to rank for, so they are repeated in the
   H1, the title tag and the opening line. Everything after that is the
   supporting copy that gives a crawler (and a reader) something to stay
   for. */
const TOOLS = [
  {
    slug: "reddit-video-downloader.html",
    platform: "Reddit",
    title: "Reddit Video Downloader",
    h1a: "Download Reddit videos",
    h1b: "with sound",
    sub: "Paste a Reddit post link and get the video with its audio, plus MP3 and a transcript. Works on reddit.com, old.reddit.com andredd.it links.",
    hint: "Paste a Reddit post link - reddit.com, old.reddit.com or redd.it. Reddit posts with video and hosted audio work best.",
    placeholder: "Paste a Reddit post link - reddit.com/r/videos/...",
    aria: "Reddit post link",
    label: "Ready &middot; paste a Reddit post link",
    sections: [
      ["Save any Reddit video in seconds",
       "Reddit hosts video in a few different ways, and the difference decides whether the file arrives with sound. A post where the uploader attached both an image and a video gets the audio muxed in properly. A post that links out to a third-party host has no Reddit audio to carry, so the download follows the link the same way the post does. Either way you get the actual file, named properly, instead of a page that asks you to install something."],
      ["Comments, hosts and the ones that need a login",
       "Most public posts download straight away. A small number live behind an age gate or a login wall, and those cannot be fetched anonymously by any tool, including this one. If a post needs a sign-in, the honest answer is that it needs a sign-in, and we would rather tell you that than hand you a broken file."],
    ],
    guarantees: [],
    faqs: [
      ["Does this download Reddit videos with sound?",
       "Yes. Where the post itself carries audio, it is merged into the file so the MP4 plays with sound rather than as a silent clip."],
      ["Can it download from old.reddit.com or redd.it?",
       "Yes. All three Reddit hostnames are recognised, as are share links copied out of the mobile app."],
      ["Why did one post fail while others worked?",
       "Posts behind an age gate, a login, or removed by the platform cannot be read by any anonymous tool. Nothing is wrong with the site or your link."],
    ],
  },
  {
    slug: "vimeo-downloader.html",
    platform: "Vimeo",
    title: "Vimeo Video Downloader",
    h1a: "Download Vimeo videos",
    h1b: "in any quality",
    sub: "Paste a Vimeo link and get the real MP4 with audio, or MP3 audio and a transcript. Handles private links that your own account can open.",
    hint: "Public videos, plus private and unlisted links your own Vimeo account can open. Paste a Vimeo URL and press Start.",
    placeholder: "Paste a Vimeo link - vimeo.com/123456789",
    aria: "Vimeo video link",
    label: "Ready &middot; paste a Vimeo link",
    sections: [
      ["Why Vimeo links sometimes need a sign-in",
       "Vimeo made a change that requires a logged-in session for most downloads, including from other people's tools. That is Vimeo's policy, not a fault in this site, and it is the single biggest reason some Vimeo links will not resolve here. The engine is the standard one every other downloader uses, and it is being refused the same way it is refused everywhere else."],
      ["What you get when a link does work",
       "The original MP4 at the quality the owner uploaded, with the audio intact, or the audio alone as MP3. The filename is the video's own title rather than a numbered blob, so it is recognisable in your downloads folder afterwards."],
    ],
    guarantees: [],
    faqs: [
      ["Why do most Vimeo links fail here?",
       "Vimeo requires a logged-in session for downloads. Most visitors download a video they can already watch publicly, but the platform still gates the file behind a sign-in. Tools that claim otherwise are either using someone's account or are faking the result."],
      ["Does it keep the sound?",
       "Yes. The audio track is merged into the video file rather than dropped."],
    ],
  },
  {
    slug: "soundcloud-downloader.html",
    platform: "SoundCloud",
    title: "SoundCloud to MP3 Downloader",
    h1a: "Save SoundCloud tracks",
    h1b: "as MP3",
    sub: "Paste a SoundCloud link and get the real audio as MP3 at 320 kbps, with a transcript where one exists. No account, no app.",
    hint: "Public SoundCloud tracks and sets. Paste a soundcloud.com link and press Start.",
    placeholder: "Paste a SoundCloud link - soundcloud.com/artist/track",
    aria: "SoundCloud track link",
    label: "Ready &middot; paste a SoundCloud link",
    sections: [
      ["Up to 320 kbps, the real bitrate",
       "The bitrates shown are the ones the track actually has, not a menu of sizes that get padded to fill the label. A 128 kbps upload is reported as 128, because inflating it to 320 would make the file bigger without making it better. You get the audio as it was published."],
      ["Sets, playlists and reposts",
       "A link to a set or playlist resolves to the tracks it contains, and a repost of someone else's track is treated as the track it points at. Anything that only exists inside a creator's private folder is not public and cannot be fetched by any tool."],
    ],
    guarantees: [],
    faqs: [
      ["Why does the MP3 not really sound 320 kbps?",
       "Because the original upload was not 320 kbps. The site reports the track's real bitrate rather than upscaling the label, so what you download matches what was published."],
      ["Can I download a whole set at once?",
       "Yes. Paste the set link and the individual tracks are listed for download."],
    ],
  },
  {
    slug: "twitter-video-downloader.html",
    platform: "X",
    title: "X (Twitter) Video Downloader",
    h1a: "Download X videos",
    h1b: "and audio",
    sub: "Paste a post link from X or Twitter and get the video with its audio, or the audio on its own as MP3. Works on x.com and twitter.com links.",
    hint: "Public posts on x.com and twitter.com that actually contain a video. Reposts and text-only posts have nothing to download.",
    placeholder: "Paste a post link - x.com/user/status/1234567890",
    aria: "X post link",
    label: "Ready &middot; paste an X post link",
    sections: [
      ["Posts that have video, and posts that never did",
       "Not every post contains media. A text post, a poll, a quote of someone else with no video, or a link preview card all come back empty, and no tool can invent a file that was never attached. When a post does carry a video, the audio is merged in so the MP4 plays with sound rather than as a silent clip."],
      ["Why some posts need a sign-in",
       "X increasingly gates media behind a logged-in session for anonymous tools, and older posts are the most likely to be affected. When that happens the honest answer is that it is gated, and the site says so instead of handing you a file that is not the video."],
    ],
    guarantees: [],
    faqs: [
      ["Do you download from Twitter as well as X?",
       "Yes. Both x.com and twitter.com links are recognised, including the older mobile share format."],
      ["What if the post has no video?",
       "Then there is nothing to download, and the site will say so rather than producing a file that is not the post's media."],
    ],
  },
];

/* Pull the donor page apart so the console, head and footer come through
   byte-for-byte and only the words change. */
function donorParts() {
  const src = fs.readFileSync(path.join(HERE, DONOR), "utf8");
  const mainStart = src.indexOf("<main>");
  const mainEnd = src.indexOf("</main>");
  if (mainStart < 0 || mainEnd < 0) throw new Error("Could not locate <main> in " + DONOR);
  return {
    head: src.slice(0, mainStart),
    main: src.slice(mainStart, mainEnd),
    tail: src.slice(mainEnd),
  };
}

/* Replace a whole <script type="application/ld+json"> block. */
function swapJsonLd(html, json) {
  return html.replace(
    /<script type="application\/ld\+json">[\s\S]*?<\/script>/,
    '<script type="application/ld+json">\n' + json + "\n    </script>"
  );
}

function setTitle(html, title) {
  return html.replace(/<title>[\s\S]*?<\/title>/, "<title>" + title + " - SaveTube</title>");
}

function setDesc(html, desc) {
  return html.replace(
    /<meta name="description" content="[^"]*"/,
    '<meta name="description" content="' + desc.replace(/"/g, "&quot;") + '"'
  );
}

function setCanonical(html, slug) {
  return html.replace(
    /<link rel="canonical" href="[^"]*"/,
    '<link rel="canonical" href="' + BASE + "/" + slug + '"'
  );
}

function build(t) {
  const d = donorParts();
  let html = d.head + d.main + d.tail;

  const url = BASE + "/" + t.slug;
  const desc = t.sub;

  html = setTitle(html, t.title + " - Free &amp; Fast");
  html = setDesc(html, desc);
  html = setCanonical(html, t.slug);

  /* The hero. Only the words change; the console below is untouched. */
  html = html.replace(/<h1 class="fade-up d2">[\s\S]*?<\/h1>/,
    '<h1 class="fade-up d2">' + t.h1a + '<br><span class="grad-text">' + t.h1b + "</span></h1>");
  html = html.replace(/<p class="hero-sub fade-up d3">[\s\S]*?<\/p>/,
    '<p class="hero-sub fade-up d3">' + t.sub + "</p>");
  html = html.replace(/<span class="hero-eyebrow fade-up d1">[\s\S]*?<\/span>/,
    '<span class="hero-eyebrow fade-up d1">Free ' + t.platform + ' Downloader &middot; No Signup</span>');
  html = html.replace(/<div class="console-label">[\s\S]*?<\/div>/,
    '<div class="console-label"><span class="dot"></span> ' + t.label + "</div>");
  html = html.replace(/<p class="form-hint">[\s\S]*?<\/p>/, '<p class="form-hint">' + t.hint + "</p>");
  html = html.replace(/placeholder="[^"]*"/, 'placeholder="' + t.placeholder + '"');
  html = html.replace(/aria-label="[^"]*"/g, 'aria-label="' + t.aria + '"');

  /* Every social/meta tag has to be rewritten, not just <title> and the
     description. Leaving og:title saying "TikTok" on the Reddit page is how
     a page ends up indexed under the wrong keyword while looking perfect in
     the browser - the crawler reads the Open Graph tags, not the H1. */
  const ogTitle = t.title + " - Free &amp; Fast";
  html = html.replace(/<meta property="og:title" content="[^"]*"/,
    '<meta property="og:title" content="' + ogTitle + '"');
  html = html.replace(/<meta property="og:description" content="[^"]*"/,
    '<meta property="og:description" content="' + desc.replace(/"/g, "&quot;") + '"');
  html = html.replace(/<meta property="og:url" content="[^"]*"/,
    '<meta property="og:url" content="' + url + '"');
  html = html.replace(/<meta name="twitter:title" content="[^"]*"/,
    '<meta name="twitter:title" content="' + ogTitle + '"');
  html = html.replace(/<meta name="twitter:description" content="[^"]*"/,
    '<meta name="twitter:description" content="' + desc.replace(/"/g, "&quot;") + '"');
  html = html.replace(/<meta name="keywords" content="[^"]*"/,
    '<meta name="keywords" content="' +
      (t.platform.toLowerCase() + " downloader, download " + t.platform.toLowerCase() +
       " video, " + t.platform.toLowerCase() + " to mp3, " + t.platform.toLowerCase() +
       " video saver, free " + t.platform.toLowerCase() + " download, no watermark")
      .replace(/"/g, "&quot;") + '"');

  /* Footer lines inherited from the donor page, plus the affiliation note. */
  html = html.replace(/<p>Fast, free [^<]*<\/p>/,
    "<p>Fast, free " + t.platform + " downloads with the sound intact. Paste a link and go.</p>");
  html = html.replace(/Not affiliated with [A-Za-z ]+\./,
    "Not affiliated with " + t.platform + " or its parent company.");

  /* The explainer sections and FAQ, written for this platform only. This is
     the part that actually earns a ranking: it answers the questions a
     person typing this search term is asking, which is the whole reason to
     have a page beyond the tool itself. */
  const body = t.sections.map((s) => "<h2>" + s[0] + "</h2>\n        <p>" + s[1] + "</p>").join("\n\n        ");
  const faq = t.faqs.map((f) => "        <h4><b>" + f[0] + "</b></h4>\n        <p>" + f[1] + "</p>").join("\n");

  /* Prose is the fallback, not the default. A page that is four paragraphs
     of explanation reads as filler no matter how well it is written, so the
     steps, the guarantees and the platform row are all VISUAL and the text
     is only ever the caption under them. Every block here reuses a component
     that already exists in css/styles.css, so the generated pages inherit
     the same design system as the hand-built ones instead of inventing a
     second look. */
  const steps = t.steps.map((s, n) => [
    '        <div class="feature-grid reveal-stagger">',
    "          <article class=\"feature-card\">",
    "            <h3>" + (n + 1) + ". " + s[0] + "</h3>",
    "            <p>" + s[1] + "</p>",
    "          </article>",
    ...t.steps.filter((_, m) => m !== n).map((o) => [
      "          <article class=\"feature-card\">",
      "            <h3>" + (t.steps.indexOf(o) + 1) + ". " + o[0] + "</h3>",
      "            <p>" + o[1] + "</p>",
      "          </article>",
    ].join("\n")),
    "        </div>",
  ].join("\n")).join("\n");

  const guarantees = t.guarantees.map((g) => [
    '        <div class="feature-grid reveal-stagger">',
    "          <article class=\"feature-card\">",
    '            <svg class="feature-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="' + g[2] + '"/></svg>',
    "            <h3>" + g[0] + "</h3>",
    "            <p>" + g[1] + "</p>",
    "          </article>",
    ...t.guarantees.filter((x) => x !== g).map((o) => [
      "          <article class=\"feature-card\">",
      '            <svg class="feature-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="' + o[2] + '"/></svg>',
      "            <h3>" + o[0] + "</h3>",
      "            <p>" + o[1] + "</p>",
      "          </article>",
    ].join("\n")),
    "        </div>",
  ].join("\n")).join("\n");

  const brandRow = t.alsoOn.map((b) =>
    '          <a class="chip" href="' + b[1] + '" title="' + b[0] + ' downloader">' +
    '<img src="https://cdn.jsdelivr.net/npm/simple-icons@13/icons/' + b[2] +
    '.svg" alt="" width="18" height="18" loading="lazy" aria-hidden="true">' +
    "<span>" + b[0] + "</span></a>").join("\n        ");

  const article = [
    "        " + body,
    "",
    '        <div class="sec-head reveal" style="margin-top:48px">',
    '          <span class="sec-eyebrow">How it works</span>',
    "          <h2>Three steps, no sign-up</h2>",
    "        </div>",
    steps,
    "",
    '        <div class="sec-head reveal" style="margin-top:48px">',
    '          <span class="sec-eyebrow">What you get</span>',
    "          <h2>Real files, not a promise</h2>",
    "        </div>",
    guarantees,
    "",
    '        <h2>Frequently asked</h2>',
    faq,
    "",
    '        <div class="sec-head reveal" style="margin-top:48px">',
    '          <span class="sec-eyebrow">More downloaders</span>',
    "          <h2>Also on SaveTube</h2>",
    "        </div>",
    '        <div class="chip-row">',
    brandRow,
    "        </div>",
    '        <p class="muted" style="margin-top:32px">Last updated: September 2026</p>',
  ].join("\n");

  html = html.replace(/<h2>[\s\S]*?<\/section>/, article + "\n      </div>\n    </div>\n    </section>");

  /* Structured data matching what the page actually says. */
  const json = JSON.stringify({
    "@context": "https://schema.org",
    "@type": "WebApplication",
    name: t.title,
    url: url,
    applicationCategory: "MultimediaApplication",
    operatingSystem: "Any",
    browserRequirements: "Requires JavaScript",
    description: desc,
    offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
    featureList: [
      t.platform + " video and audio download",
      "MP3 audio extraction",
      "Transcripts",
      "No signup required",
      "No watermark",
    ],
  }, null, 2);
  html = swapJsonLd(html, json);

  return html;
}

/* A generated page that is subtly broken is worse than no page at all: it
   ranks for the wrong keyword, shows a stranger's name in the social
   preview, and confuses every visitor who lands on it. Each check below
   catches a mistake that is invisible in the source but obvious to a
   crawler or a reader. Failing loudly beats shipping a broken page. */
function verify(t, html) {
  const problems = [];
  const opens = (html.match(/<div/g) || []).length;
  const closes = (html.match(/<\/div>/g) || []).length;
  if (opens !== closes) {
    problems.push("unbalanced div tags: " + opens + " open, " + closes + " close");
  }
  const so = (html.match(/<section/g) || []).length;
  const sc = (html.match(/<\/section>/g) || []).length;
  if (so !== sc) problems.push("unbalanced section tags: " + so + " vs " + sc);

  const needle = t.platform.toLowerCase();
  for (const tag of ["og:title", "og:url", "twitter:title"]) {
    const m = html.match(new RegExp(
      '<meta[^>]*(?:property|name)="' + tag + '" content="([^"]*)"'));
    if (!m) {
      problems.push("missing " + tag);
    } else if (tag === "og:url") {
      /* The URL only has to be the one this page is served at. Matching a
         word inside it is hopeless for a platform literally called "X". */
      if (m[1] !== BASE + "/" + t.slug) problems.push("og:url is " + m[1]);
    } else if (m[1].toLowerCase().indexOf(needle) < 0 &&
               m[1].toLowerCase().indexOf("x (twitter)") < 0) {
      problems.push(tag + " does not mention the platform: " + m[1]);
    }
  }

  if (!/id="download-form"/.test(html)) problems.push("the download form is missing");
  if (!/js\/app\.js/.test(html)) problems.push("app.js is not loaded, so the tool cannot run");
  if (html.indexOf('rel="canonical" href="' + BASE + "/" + t.slug + '"') < 0) {
    problems.push("canonical does not point at this page");
  }
  if (/Not affiliated with [A-Za-z]+ or ByteDance/.test(html)) {
    problems.push("footer still says the donor platform's owner");
  }
  return problems;
}


/* Visual content for every platform page. The steps and guarantees are the
   same shape on each page because the flow genuinely is the same; only the
   wording is per-platform. The icons are simple-icons slugs, inlined from a
   CDN at zero cost, so the platform row shows real marks rather than a row
   of text chips pretending to be a logo wall. */
const SHARED = {
  steps: [
    ["Copy the link", "Open the post and copy the link from the address bar or the share sheet."],
    ["Paste it above", "Press Start. The engine reads the real title, channel and available formats."],
    ["Pick and save", "Choose a quality, or the audio, and the file saves straight to your device."],
  ],
  alsoOn: [
    ["YouTube", "index.html", "youtube"],
    ["TikTok", "tiktok-downloader.html", "tiktok"],
    ["Instagram", "instagram-downloader.html", "instagram"],
    ["X", "twitter-video-downloader.html", "x"],
    ["Reddit", "reddit-video-downloader.html", "reddit"],
    ["Vimeo", "vimeo-downloader.html", "vimeo"],
    ["SoundCloud", "soundcloud-downloader.html", "soundcloud"],
  ],
};

/* Guarantee cards carry an icon path so each claim is a visual object rather
   than a sentence in a paragraph. */
const ICON = {
  sound: "M11 5L6 9H2v6h4l5 4V5zM19 5a9 9 0 010 14M15.5 8.5a5 5 0 010 7",
  shield: "M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z",
  bolt: "M13 2L3 14h9l-1 8 10-12h-9l1-8z",
  doc: "M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8zM14 2v6h6",
};
/* Every platform shares the same three-step flow and the same cross-links,
   so they are applied here rather than repeated four times in the data. Only
   what genuinely differs per platform stays in the entry. */
const DEFAULT_GUARANTEES = [
  ["The sound is kept", "Where the post carries audio it is merged into the file, so the video plays with sound instead of arriving silent.", "M11 5L6 9H2v6h4l5 4V5zM19 5a9 9 0 010 14"],
  ["No sign-up, ever", "No account, no email, no payment. Paste a link and the file is yours.", "M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"],
  ["Straight about limits", "Anything that cannot be read is named as such instead of quietly returning a broken file.", "M13 2L3 14h9l-1 8 10-12h-9l1-8z"],
];
for (const t of TOOLS) {
  if (!t.steps) t.steps = SHARED.steps;
  if (!t.alsoOn) t.alsoOn = SHARED.alsoOn;
  if (!t.guarantees) t.guarantees = DEFAULT_GUARANTEES;
}
const check = process.argv.includes("--check");
let changed = 0;
let failed = 0;

for (const t of TOOLS) {
  const out = path.join(HERE, t.slug);
  const next = build(t);

  /* Verify before writing. A page that fails a check is never written, so a
     broken tool page cannot reach the site by accident. */
  const problems = verify(t, next);
  if (problems.length) {
    console.log("  FAILED       " + t.slug);
    for (const p of problems) console.log("               - " + p);
    failed++;
    continue;
  }

  const prev = fs.existsSync(out) ? fs.readFileSync(out, "utf8") : null;
  if (prev === next) {
    console.log("  ok           " + t.slug);
    continue;
  }
  if (check) {
    console.log("  DRIFT        " + t.slug);
    changed++;
    continue;
  }
  fs.writeFileSync(out, next, "utf8");
  console.log("  written      " + t.slug);
  changed++;
}

console.log("");
console.log(check
  ? (changed ? changed + " page(s) differ from the generator." : "All pages match the generator.")
  : changed + " page(s) written.");
if (failed) {
  console.log(failed + " page(s) FAILED verification and were not written.");
  process.exit(1);
}
