#!/usr/bin/env node
/* ============================================================
   setdomain.js  -  change the site address everywhere, one command.

   The site currently lives on a Render subdomain, which is a real
   search-ranking handicap. Buying a normal .com and pointing it here
   is the single biggest SEO win available, and this script makes that
   switch a one-liner instead of a 17-file manual edit.

   WHAT IT CHANGES
     - the canonical link in every HTML page
     - og:url / twitter:url
     - the JSON-LD "url" values
     - the <loc> entries in sitemap.xml
     - the Sitemap: line in robots.txt
     - SITE_CONFIG.domain in js/config.js

   HOW TO USE
     node setdomain.js savetube.com
     node setdomain.js https://www.savetube.com
     node setdomain.js --show          (print the current value, change nothing)

   The Render env var SITE_URL is read by the server for the generated
   /sitemap.xml and /robots.txt, so set that too (see the note printed at
   the end). Between this script and that variable there is one source of
   truth per place, and nothing is left pointing at the old address.
   ============================================================ */

const fs = require("fs");
const path = require("path");

const ROOT = __dirname;

/* Every host that has ever been the live address, so a re-run with a
   different old domain still cleans up after itself. */
const KNOWN_OLD = [
  "https://savetube-0mrq.onrender.com",
  "http://savetube-0mrq.onrender.com",
  "https://savetube.onrender.com",
];

const arg = (process.argv[2] || "").trim();

function htmlFiles() {
  return fs
    .readdirSync(ROOT)
    .filter((f) => f.endsWith(".html"))
    .map((f) => path.join(ROOT, f));
}

function currentDomain() {
  const idx = path.join(ROOT, "index.html");
  if (!fs.existsSync(idx)) return "(unknown)";
  const html = fs.readFileSync(idx, "utf8");
  const m = html.match(/rel=["']canonical["'][^>]*href=["']([^"']+)["']/i);
  return m ? m[1] : "(none found)";
}

if (arg === "--show" || arg === "") {
  console.log("Current canonical domain: " + currentDomain());
  console.log("");
  console.log("Change it with:  node setdomain.js yourdomain.com");
  process.exit(0);
}

/* Normalise whatever was typed into a full origin with no trailing slash. */
let next = arg.replace(/^https?:\/\//i, "").replace(/\/+$/, "");
if (!/^[a-z0-9.-]+$/i.test(next)) {
  console.error("That does not look like a domain: " + arg);
  process.exit(1);
}
next = "https://" + next;

const prev = currentDomain();
if (prev === next) {
  console.log("Already set to " + next + " - nothing to do.");
  process.exit(0);
}

console.log("Changing site address");
console.log("  from  " + prev);
console.log("  to    " + next);
console.log("");

let filesChanged = 0;
let linksRewritten = 0;

for (const file of htmlFiles()) {
  let html = fs.readFileSync(file, "utf8");
  const before = html;

  /* Replace every known old origin wherever it appears. That covers
     canonical, og:url, twitter:url and the JSON-LD "url" values in one
     pass, instead of hunting for each tag by name. */
  for (const old of KNOWN_OLD) {
    const hits = html.split(old).length - 1;
    if (hits > 0) {
      html = html.split(old).join(next);
      linksRewritten += hits;
    }
  }

  /* A page with a canonical that names a DIFFERENT old host (for example
     a leftover savetube.onrender.com) is fixed by rebuilding the canonical
     from this file's own path. */
  if (html === before && /rel=["']canonical["']/i.test(html)) {
    const m = html.match(/rel=["']canonical["'][^>]*href=["'][^"']*["']/i);
    if (m && !m[0].includes(next)) {
      const rel = path.basename(file).replace(/^index\.html$/, "");
      const target = next + (rel && rel !== "index.html" ? "/" + rel : "/");
      html = html.replace(m[0], 'rel="canonical" href="' + target + '"');
      linksRewritten++;
    }
  }

  if (html !== before) {
    fs.writeFileSync(file, html, "utf8");
    filesChanged++;
    console.log("  updated  " + path.basename(file));
  }
}

/* sitemap.xml - only when it is still the checked-in static copy. The
   server now generates its own from SITE_URL, so this is belt and braces
   for anyone serving the folder statically. */
const sitemapPath = path.join(ROOT, "sitemap.xml");
if (fs.existsSync(sitemapPath)) {
  let sm = fs.readFileSync(sitemapPath, "utf8");
  const before = sm;
  for (const old of KNOWN_OLD) sm = sm.split(old).join(next);
  if (sm !== before) {
    fs.writeFileSync(sitemapPath, sm, "utf8");
    console.log("  updated  sitemap.xml");
  }
}

/* robots.txt - same reason. */
const robotsPath = path.join(ROOT, "robots.txt");
if (fs.existsSync(robotsPath)) {
  let rb = fs.readFileSync(robotsPath, "utf8");
  const before = rb;
  for (const old of KNOWN_OLD) rb = rb.split(old).join(next);
  if (rb !== before) {
    fs.writeFileSync(robotsPath, rb, "utf8");
    console.log("  updated  robots.txt");
  }
}

/* SITE_CONFIG.domain in js/config.js */
const cfgPath = path.join(ROOT, "js", "config.js");
if (fs.existsSync(cfgPath)) {
  let cfg = fs.readFileSync(cfgPath, "utf8");
  const before = cfg;
  cfg = cfg.replace(/domain:\s*"[^"]*"/, 'domain: "' + next + '"');
  if (cfg !== before) {
    fs.writeFileSync(cfgPath, cfg, "utf8");
    console.log("  updated  js/config.js");
  }
}

console.log("");
console.log("Done: " + filesChanged + " page(s) updated, " + linksRewritten + " link(s) rewritten.");
console.log("");
console.log("NOW DO THIS on Render (Settings > Environment):");
console.log("  SITE_URL = " + next);
console.log("That one variable drives the generated /sitemap.xml and /robots.txt.");
console.log("");
console.log("Then in Google Search Console submit " + next + "/sitemap.xml");
console.log("and run 'URL Inspection' on the homepage to request indexing.");
