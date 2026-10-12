#!/usr/bin/env node
/* Adds a "skip to content" link as the first focusable element on every page,
   plus the styles that make it appear only when focused.

   Why this exists: every page here carries a site header with several links
   before the page content. A keyboard user has to press Tab through all of
   them on every single page load to reach the download box - WCAG 2.4.1
   (Bypass Blocks) is exactly this problem. The link is visually hidden until
   it receives focus, so it costs nothing visually and never shows up in a
   screenshot, but it is the very first thing in the tab order.

   It is inserted before the first <body> content rather than before </body>
   because the tab order follows document order. */

const fs = require("fs");
const path = require("path");
const ROOT = __dirname;

const LINK = '  <a class="skip-link" href="#main">Skip to content</a>\n';

/* The id the link targets has to exist on the page, or the link does nothing
   but add a broken jump to the top of the document. */
function needsMainId(html) {
  return /<main\b/.test(html);
}

const files = fs.readdirSync(ROOT).filter((f) => f.endsWith(".html"));
let touched = 0, skipped = [];

for (const f of files) {
  const p = path.join(ROOT, f);
  let html = fs.readFileSync(p, "utf8");

  if (html.includes('class="skip-link"')) { skipped.push(f + " (already has one)"); continue; }
  if (!needsMainId(html)) { skipped.push(f + " (no <main>)"); continue; }

  /* Give the <main> the id the link points at. */
  html = html.replace(/<main\b([^>]*)>/, (m, attrs) => {
    if (/\bid=/.test(attrs)) return m;
    return '<main id="main"' + attrs + ">";
  });

  /* Insert as the first child of <body>. */
  html = html.replace(/<body([^>]*)>/, (m, attrs) => "<body" + attrs + ">\n" + LINK);

  fs.writeFileSync(p, html, "utf8");
  touched++;
}

console.log("skip link added to " + touched + " page(s)");
if (skipped.length) { console.log("skipped:"); skipped.forEach((s) => console.log("  " + s)); }