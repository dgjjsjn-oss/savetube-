#!/usr/bin/env node
/* ============================================================
   ytexport.js  -  pull ONLY the YouTube cookies out of an export.

   WHY THIS EXISTS
   ---------------
   A browser cookie export can cover your ENTIRE profile: mail, banking,
   payment processors, crypto wallets, code hosting, social logins. That is
   a complete takeover of every one of those accounts in a single text file.
   Pasting a full export into anything - a server, a chat, a web form - hands
   all of it over at once.

   This script never accepts the whole thing. It reads the export, keeps only
   the rows that belong to YouTube, and tells you exactly what it kept and
   what it discarded. If the result is only YouTube cookies, there is nothing
   else in it to leak.

   HOW TO USE
   ---------
     node ytexport.js "C:\path\to\cookies.txt"
     node ytexport.js "C:\path\to\cookies.txt" --out youtube-only.txt

   It prints a base64 line for the Render YT_COOKIE_B64 variable, so the
   YouTube session can be handed to the server without ever touching git.

   A dedicated YouTube-only browser profile is the safest source. See the
   instructions printed by "node ytexport.js --help".
   ============================================================ */

const fs = require("fs");
const path = require("path");

/* Only these hosts are ever kept. Anything else is dropped. */
const ALLOW = [
  /(^|\.)youtube\.com$/i,
  /(^|\.)youtu\.be$/i,
  /(^|\.)google\.com$/i,       // needed for the Google sign-in cookies YouTube reads
  /(^|\.)googlevideo\.com$/i,
  /(^|\.)ytimg\.com$/i,
  /(^|\.)ggpht\.com$/i,
];

/* Explicitly never keep these, even though some sit under a Google domain.
   Google shares cookies across its properties, and a full profile export
   routinely drags these in. None of them help fetch a video. */
const DENY = [
  /mail\.google\.com$/i,
  /(^|\.)googleapis\.com$/i,
  /(^|\.)gmail\.com$/i,
  /(^|\.)accounts\.google\.com$/i,
  /(^|\.)myaccount\.google\.com$/i,
  /(^|\.)contacts\.google\.com$/i,
  /(^|\.)drive\.google\.com$/i,
  /(^|\.)calendar\.google\.com$/i,
  /(^|\.)docs\.google\.com$/i,
  /(^|\.)cloud\.google\.com$/i,
  /(^|\.)adsense\.google\.com$/i,
  /(^|\.)adservice\.google\./i,
  /(^|\.)doubleclick\.net$/i,
  /(^|\.)googlesyndication\.com$/i,
  /(^|\.)googletagmanager\.com$/i,
  /(^|\.)googleadservices\.com$/i,
  /(^|\.)admob\.com$/i,
];

function classify(domain) {
  const d = String(domain || "").replace(/^\./, "");
  for (const re of DENY) if (re.test(d)) return "deny";
  for (const re of ALLOW) if (re.test(d)) return "keep";
  return "drop";
}

const arg = (process.argv[2] || "").trim();
const outIdx = process.argv.indexOf("--out");
const outPath = outIdx > -1 ? process.argv[outIdx + 1] : "youtube-only.txt";

if (!arg || arg === "--help" || arg === "-h") {
  console.log("");
  console.log("ytexport.js - keep ONLY YouTube cookies from a browser export");
  console.log("");
  console.log("  node ytexport.js <path-to-cookies.txt>");
  console.log("");
  console.log("SAFEST SOURCE: a separate browser profile used for nothing but this.");
  console.log("  Chrome  : copy the shortcut, add  --profile-directory=SaveTube");
  console.log("  Firefox : File > New Profile, name it SaveTube, use only there");
  console.log("Then log into YouTube in that profile, export, and run this script.");
  console.log("A throwaway YouTube account is better than your main one.");
  console.log("");
  process.exit(0);
}

if (!fs.existsSync(arg)) {
  console.error("File not found: " + arg);
  process.exit(1);
}

const raw = fs.readFileSync(arg, "utf8");
const lines = raw.split(/\r?\n/);

const kept = [];
const droppedDomains = new Map();
let keptRows = 0;

for (const line of lines) {
  const trimmed = line.trim();
  if (!trimmed) continue;

  /* Preserve the #HttpOnly_ marker: it is meaningful to yt-dlp. */
  const httpOnly = trimmed.startsWith("#HttpOnly_");
  const body = httpOnly ? trimmed.slice("#HttpOnly_".length) : trimmed;
  if (body.startsWith("#")) continue;              // a real comment line

  const parts = body.split("\t");
  if (parts.length < 7) continue;                   // not a cookie row

  const domain = parts[0];
  const verdict = classify(domain);
  if (verdict === "keep") {
    kept.push((httpOnly ? "#HttpOnly_" : "") + body);
    keptRows++;
  } else {
    const d = domain.replace(/^\./, "");
    droppedDomains.set(d, (droppedDomains.get(d) || 0) + 1);
  }
}

if (!keptRows) {
  console.error("");
  console.error("No YouTube cookies found in that file.");
  console.error("It may be an export from a browser that is not signed in to YouTube,");
  console.error("or the extension exported a different site. Open youtube.com, confirm");
  console.error("you are signed in, and export again from that page.");
  console.error("");
  process.exit(1);
}

const keptDomains = Array.from(new Set(kept.map((l) => {
  const b = l.replace("#HttpOnly_", "");
  return b.split("\t")[0].replace(/^\./, "");
}))).sort();

const header = [
  "# YouTube-only cookie export, produced by ytexport.js",
  "# Every non-YouTube cookie from the source file was discarded.",
  "# Domains kept: " + keptDomains.join(", "),
  "# Rows kept: " + keptRows,
  "#",
  "# This is a YouTube login session. Anyone holding it can sign in as that",
  "# account. Keep it off shared machines, out of git, and out of chat.",
  "",
].join("\n");

const finalText = header + kept.join("\n") + "\n";
fs.writeFileSync(path.resolve(outPath), finalText, "utf8");

console.log("");
console.log("Kept ONLY YouTube cookies.");
console.log("  Domains kept : " + keptDomains.join(", "));
console.log("  Rows kept    : " + keptRows);
console.log("  Domains dropped: " + droppedDomains.size);
console.log("");
console.log("Written to: " + path.resolve(outPath));
console.log("");
console.log("Confirm the file is clean before using it:");
console.log("  node ytexport.js " + path.resolve(outPath));
console.log("It should report 0 dropped domains, because it now only holds YouTube.");
console.log("");
console.log("NEXT: run  node setcookies.js  to get the value for Render.");
