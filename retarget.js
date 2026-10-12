#!/usr/bin/env node
/* Rewrites the donor page's platform copy for a different target platform.
   Run: node retarget.js <source.html> <dest.html> <profile-json>

   The donor page is a complete, working page. Only the words change. Every
   place a platform can leak into a page that is about another platform is
   listed explicitly, because a page that renders perfectly while still
   carrying the donor's meta tags is exactly how a page ends up indexed for
   the wrong keyword. */

const fs = require("fs");
const path = require("path");

const [, , src, dest, profilePath] = process.argv;
if (!src || !dest || !profilePath) {
  console.error("usage: node retarget.js <source.html> <dest.html> <profile.json>");
  process.exit(1);
}

const P = JSON.parse(fs.readFileSync(profilePath, "utf8"));
let html = fs.readFileSync(src, "utf8");
const out = [];

/* Replace the first occurrence of a pattern, but only if it actually matched -
   a silent no-op here is what leaves a stale tag behind. */
function swap(label, re, replacement) {
  const before = html;
  html = html.replace(re, replacement);
  if (html === before) out.push("  MISS  " + label);
}

const kws = (P.keywords || []).join(", ");
swap("title", /<title>[\s\S]*?<\/title>/, "<title>" + P.title + "</title>");
swap("description", /<meta name="description" content="[^"]*"/,
  '<meta name="description" content="' + P.description + '"');
swap("keywords", /<meta name="keywords" content="[^"]*"/,
  '<meta name="keywords" content="' + kws + '"');
swap("canonical", /<link rel="canonical" href="[^"]*"/,
  '<link rel="canonical" href="' + P.url + '"');
swap("og:title", /<meta property="og:title" content="[^"]*"/,
  '<meta property="og:title" content="' + P.title + '"');
swap("og:description", /<meta property="og:description" content="[^"]*"/,
  '<meta property="og:description" content="' + P.description + '"');
swap("og:url", /<meta property="og:url" content="[^"]*"/,
  '<meta property="og:url" content="' + P.url + '"');
swap("twitter:title", /<meta name="twitter:title" content="[^"]*"/,
  '<meta name="twitter:title" content="' + P.title + '"');
swap("twitter:description", /<meta name="twitter:description" content="[^"]*"/,
  '<meta name="twitter:description" content="' + P.description + '"');
swap("h1", /<h1 class="fade-up d2">[\s\S]*?<\/h1>/, "<h1 class=\"fade-up d2\">" + P.h1a + "<br><span class=\"grad-text\">" + P.h1b + "</span></h1>");
swap("hero-eyebrow", /<span class="hero-eyebrow fade-up d1">[\s\S]*?<\/span>/,
  '<span class="hero-eyebrow fade-up d1">' + P.eyebrow + "</span>");
swap("hero-sub", /<p class="hero-sub fade-up d3">[\s\S]*?<\/p>/,
  '<p class="hero-sub fade-up d3">' + P.sub + "</p>");
swap("console-label", /<div class="console-label">[\s\S]*?<\/div>/,
  '<div class="console-label"><span class="dot"></span> ' + P.consoleLabel + "</div>");
swap("form-hint", /<p class="form-hint">[\s\S]*?<\/p>/,
  '<p class="form-hint">' + P.formHint + "</p>");
swap("placeholder", /placeholder="[^"]*"/, 'placeholder="' + P.placeholder + '"');
swap("aria-label", /aria-label="[^"]*"/, 'aria-label="' + P.aria + '"');
swap("jsonld name", /"name": "SaveTube [^"]*"/, '"name": "' + P.title + '"');
swap("jsonld url", /"url": "https:\/\/[^"]*"/, '"url": "' + P.url + '"');

/* The donor's own body sections and FAQ carry its platform by name. Anything
   still mentioning the donor platform after the explicit swaps above is a
   leftover, and it is listed rather than silently fixed. */
fs.writeFileSync(dest, html, "utf8");

/* Verify: the donor platform name must not survive anywhere. */
const leftovers = [];
const needle = P.donor;
const re = new RegExp(needle.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "gi");
const lines = html.split("\n");
lines.forEach((line, i) => { if (re.test(line)) leftovers.push((i + 1) + ": " + line.trim().slice(0, 120)); re.lastIndex = 0; });

console.log("wrote " + path.basename(dest) + " (" + html.length + " bytes)");
if (out.length) { console.log("unmatched tags:"); out.forEach((l) => console.log(l)); }
if (leftovers.length) {
  console.log("LEFTOVER " + needle + " in " + leftovers.length + " place(s):");
  leftovers.forEach((l) => console.log("  " + l));
} else {
  console.log("clean: no " + needle + " references remain");
}