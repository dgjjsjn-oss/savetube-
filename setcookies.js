#!/usr/bin/env node
/* ============================================================
   setcookies.js  -  hand YouTube cookies to the server safely.

   WHY THIS SCRIPT EXISTS
   ---------------------
   YouTube blocks media downloads from datacentre IP addresses with
   "Sign in to confirm you're not a bot". A browser is not a datacentre,
   so the simplest way past it is to let yt-dlp borrow your browser's
   YouTube session. That session is a full login credential: anyone who
   holds it can act as you on that account.

   So the cookies are NOT committed to the repository. A cookie file in
   git is a published password, and this repository is the wrong place for
   one. Instead this script encodes the file into a single line of text
   that you paste into ONE Render environment variable. The server decodes
   it back into a real cookies.txt at boot, in memory's worth of disk, and
   git never sees it.

   HOW TO USE
   ---------
     1. Export cookies.txt from a browser where you are logged in to
        YouTube (instructions below, or just "npm run cookies:help").
     2. Put it next to this file as cookies.txt
     3. Run:   node setcookies.js
     4. Copy the printed single line into Render:
        Settings > Environment > YT_COOKIE_B64
     5. Save. Render redeploys and the bot wall is gone.

   TO REMOVE THE COOKIES LATER
     node setcookies.js --clear
     which prints an empty value to paste over the variable.
   ============================================================ */

const fs = require("fs");
const path = require("path");

const HERE = __dirname;
const COOKIE_SRC = path.join(HERE, "cookies.txt");

/* A real Netscape cookies.txt has tab-separated rows and a
   "#HttpOnly_youtube.com" style prefix on the auth rows. The checks below
   are deliberately loose: they catch a file that is obviously not cookies
   (an HTML page saved by mistake, a JSON dump, an empty file) without
   being strict enough to reject a valid export. */
function looksLikeCookies(text) {
  const t = String(text || "").trim();
  if (t.length < 50) return false;
  if (/^\s*</.test(t)) return false;                 // saved an HTML page
  if (/^\s*[{[]/.test(t)) return false;               // saved JSON
  const rows = t.split("\n").filter((l) => l.trim() && !l.trim().startsWith("#HttpOnly_"));
  const tabbed = rows.filter((l) => l.split("\t").length >= 6);
  return tabbed.length >= 3;
}

function cookieDomains(text) {
  const seen = new Set();
  String(text || "").split("\n").forEach((line) => {
    const p = line.trim().replace(/^#HttpOnly_/, "").split("\t");
    if (p.length >= 6 && !p[0].startsWith("#")) seen.add(p[0].replace(/^\./, ""));
  });
  return Array.from(seen).sort();
}

const arg = (process.argv[2] || "").trim();

if (arg === "--help" || arg === "-h") {
  console.log(fs.readFileSync(__filename, "utf8").split("*/")[0].replace(/^\/\*\s*=+\s*\n?/, "").replace(/^ \* ?/gm, ""));
  process.exit(0);
}

if (arg === "--clear") {
  console.log("");
  console.log("To remove the cookies from the server:");
  console.log("  Render > your service > Settings > Environment");
  console.log("  delete the YT_COOKIE_B64 row entirely (or set it blank)");
  console.log("  save, and Render redeploys without the session.");
  console.log("");
  process.exit(0);
}

if (arg === "--show") {
  if (!fs.existsSync(COOKIE_SRC)) {
    console.log("No cookies.txt found next to this script.");
    process.exit(1);
  }
  const text = fs.readFileSync(COOKIE_SRC, "utf8");
  console.log("File:   " + COOKIE_SRC);
  console.log("Size:   " + text.length + " bytes");
  console.log("Covers: " + (cookieDomains(text).join(", ") || "(none)"));
  console.log("Valid:  " + (looksLikeCookies(text) ? "yes" : "NO - this does not look like a cookies.txt"));
  process.exit(looksLikeCookies(text) ? 0 : 1);
}

if (!fs.existsSync(COOKIE_SRC)) {
  console.log("");
  console.log("No cookies.txt found next to this script.");
  console.log("");
  console.log("HOW TO GET ONE (2 minutes, free)");
  console.log("----------------------------------");
  console.log("1. In Chrome or Firefox, install the extension");
  console.log("   'Get cookies.txt LOCALLY' (Chrome Web Store / Firefox Add-ons).");
  console.log("   It is the standard tool for this and adds no account or tracking.");
  console.log("");
  console.log("2. Log in to https://www.youtube.com in that browser as normal.");
  console.log("");
  console.log("3. Open https://www.youtube.com and make sure you are signed in.");
  console.log("");
  console.log("4. Click the extension icon, then 'Export cookies for the current site'.");
  console.log("   It downloads a file called cookies.txt.");
  console.log("");
  console.log("5. Move that file next to this script (the project folder),");
  console.log("   so you end up with:  " + COOKIE_SRC);
  console.log("");
  console.log("6. Come back and run:  node setcookies.js");
  console.log("");
  console.log("IMPORTANT");
  console.log("---------");
  console.log("cookies.txt is a full login. Anyone who has it can sign in as you.");
  console.log("Keep it on your own machine. Never upload it to a public repository,");
  console.log("never paste it into a chat, and never send it to anyone.");
  console.log("This script never uploads it anywhere and never puts it in git.");
  console.log("");
  process.exit(1);
}

const text = fs.readFileSync(COOKIE_SRC, "utf8");

if (!looksLikeCookies(text)) {
  console.log("");
  console.log("That cookies.txt does not look right.");
  console.log("It should be a plain text file of tab-separated rows, several lines long.");
  console.log("If you saved a web page instead of exporting, do the export again.");
  console.log("Run 'node setcookies.js --show' to see what was read.");
  console.log("");
  process.exit(1);
}

const b64 = Buffer.from(text, "utf8").toString("base64");
const domains = cookieDomains(text);

console.log("");
console.log("cookies.txt looks good.");
console.log("  Size:   " + text.length + " bytes");
console.log("  Covers: " + (domains.join(", ") || "(unknown)"));
console.log("");
console.log("  " + (domains.includes("youtube.com")
    ? "youtube.com IS covered - this should clear the bot wall."
    : "youtube.com is NOT covered - the bot wall will probably remain."));
console.log("");
console.log("------------------------------------------------------------------");
console.log("PASTE THIS WHOLE LINE INTO RENDER");
console.log("  Render > savetube > Settings > Environment > YT_COOKIE_B64");
console.log("------------------------------------------------------------------");
console.log(b64);
console.log("------------------------------------------------------------------");
console.log("");
console.log("Then save. Render redeploys in about two minutes and the");
console.log("'Sign in to confirm you are not a bot' error stops appearing.");
console.log("");
console.log("Your cookies.txt stays on this machine and is never uploaded.");
console.log("Check what is gitignored before you commit anything:");
console.log("  git check-ignore -v cookies.txt");
