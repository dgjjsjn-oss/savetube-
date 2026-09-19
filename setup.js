/* ============================================================
   SaveTube - one-command setup
   ------------------------------------------------------------
   Fills your real email and your live address into every file.

   Usage (run inside this folder):

     node setup.js you@example.com https://savetube.onrender.com

   - Your email is used for all contact links (support, privacy,
     ads, copyright) and for the contact form.
   - Your address is used for canonical links, the sitemap and the
     site config.

   Running it again with new values just updates them.
   ============================================================ */

"use strict";

const fs = require("fs");
const path = require("path");

const args = process.argv.slice(2);

if (args.length < 1 || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(args[0])) {
  console.log("");
  console.log("  Usage:  node setup.js YOUR_EMAIL [YOUR_URL]");
  console.log("");
  console.log("  Example:");
  console.log("    node setup.js savetube.help@gmail.com https://savetube.onrender.com");
  console.log("");
  console.log("  The URL is optional. If you skip it, only the email is applied.");
  console.log("");
  process.exit(1);
}

const email = args[0].trim();
let url = (args[1] || "").trim().replace(/\/+$/, "");

if (url && !/^https?:\/\//i.test(url)) url = "https://" + url;

const ROOT = __dirname;

const files = fs.readdirSync(ROOT).filter(function (f) {
  return /\.(html|xml|txt)$/i.test(f);
}).concat(["js/config.js", "js/app.js", "robots.txt", "sitemap.xml"]);

const seen = new Set();
const targets = [];

files.forEach(function (f) {
  const p = path.join(ROOT, f);
  if (fs.existsSync(p) && fs.statSync(p).isFile() && !seen.has(p)) {
    seen.add(p);
    targets.push(p);
  }
});

const ROLES = [
  "support@yoursite.com",
  "privacy@yoursite.com",
  "ads@yoursite.com",
  "copyright@yoursite.com",
];

/* Read what is currently in js/config.js so that running this a second
   time (with a new email or domain) still updates everything cleanly. */
const cfgPath = path.join(ROOT, "js", "config.js");
let oldEmail = null;
let oldDomain = null;

if (fs.existsSync(cfgPath)) {
  const cfg = fs.readFileSync(cfgPath, "utf8");
  const em = cfg.match(/contactEmail:\s*"([^"]+)"/);
  const dm = cfg.match(/domain:\s*"([^"]+)"/);
  if (em && /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(em[1]) && !/yoursite\.com$/.test(em[1])) {
    oldEmail = em[1];
  }
  if (dm && !/yoursite\.com/.test(dm[1])) oldDomain = dm[1];
}

let touched = 0;

targets.forEach(function (p) {
  let text = fs.readFileSync(p, "utf8");
  const before = text;

  // 1. Site address first, so "https://savetube-0mrq.onrender.com/..." is captured cleanly.
  if (url) {
    text = text.split("https://savetube-0mrq.onrender.com").join(url);
    text = text.split("https://savetube-0mrq.onrender.com").join(url);
    if (oldDomain) {
      text = text.split(oldDomain).join(url);
    }
  }

  // 2. Contact email addresses (this also covers the contact form action).
  ROLES.forEach(function (role) {
    text = text.split(role).join(email);
  });
  if (oldEmail) {
    text = text.split(oldEmail).join(email);
  }

  // NOTE: there is deliberately no blanket "yoursite.com" replacement here.
  // Every placeholder is either an email (handled above) or a full
  // https:// address (handled below), so a careless catch-all would
  // corrupt canonical links on a run that has no URL yet.

  if (text !== before) {
    fs.writeFileSync(p, text, "utf8");
    touched++;
    console.log("  updated  " + path.relative(ROOT, p));
  }
});

console.log("");
console.log("  Email set to : " + email);
console.log("  Address set to: " + (url || "(NOT set - canonical links still say yoursite.com)"));
console.log("  Files updated : " + touched);
console.log("");
if (!url) {
  console.log("  Your address is not set yet. That is fine for now.");
  console.log("  After you deploy, run this again with your live address:");
  console.log("    node setup.js " + email + " https://YOUR-ADDRESS");
  console.log("");
}
console.log("  Next:");
console.log("    1. Deploy the folder to your host (see DEPLOY.md)");
console.log("    2. Open the site and confirm the Contact page shows your email");
console.log("    3. Set adUnlockUrl and popunder.url in js/config.js when your ad account is ready");
console.log("");
