/* ============================================================
   addlink.js — manage your redirect / referral links

   Usage:
     node addlink.js <slug> <url> ["label"]
     node addlink.js list
     node addlink.js remove <slug>
     node addlink.js off <slug>
     node addlink.js on <slug>

   Your links then live at  https://yourdomain.com/go/<slug>
   and forward the visitor to the long referral address.
   ============================================================ */

const fs = require("fs");
const path = require("path");

const FILE = path.join(__dirname, "links.json");

function load() {
  try {
    const data = JSON.parse(fs.readFileSync(FILE, "utf8"));
    if (!Array.isArray(data.links)) data.links = [];
    return data;
  } catch (e) {
    return { links: [] };
  }
}

function save(data) {
  fs.writeFileSync(FILE, JSON.stringify(data, null, 2) + "\n", "utf8");
}

function fail(msg) {
  console.log("Error: " + msg);
  process.exit(1);
}

function isUrl(u) {
  return /^https?:\/\/[^\s]+$/i.test(String(u || ""));
}

function find(data, slug) {
  return data.links.find((l) => l.slug === slug);
}

const args = process.argv.slice(2);
const cmd = (args[0] || "list").toLowerCase();

/* ---------- list ---------- */
if (cmd === "list") {
  const data = load();
  if (!data.links.length) {
    console.log("No links yet. Add one with:");
    console.log('  node addlink.js youtube https://example.com/?ref=me "Subscribe"');
    process.exit(0);
  }
  console.log("Your redirect links (" + data.links.length + "):\n");
  data.links.forEach((l) => {
    console.log("  /go/" + l.slug);
    console.log("      to:      " + l.url);
    console.log("      label:   " + (l.label || "(none)"));
    console.log("      status:  " + (l.enabled === false ? "OFF" : "on"));
    console.log("");
  });
  process.exit(0);
}

/* ---------- remove / on / off ----------
   These are checked BEFORE add, otherwise "addlink.js off test" would be
   read as adding a link called "off" pointing at "test". */
if (["remove", "on", "off"].includes(cmd)) {
  const slug = args[1];
  if (!slug) fail('which link? For example:  node addlink.js ' + cmd + ' youtube');

  const data = load();
  const link = find(data, slug);
  if (!link) fail('no link called "' + slug + '". Run "node addlink.js list" to see them.');

  if (cmd === "remove") {
    data.links = data.links.filter((l) => l.slug !== slug);
    save(data);
    console.log("Removed /go/" + slug);
  } else {
    link.enabled = cmd === "on";
    save(data);
    console.log("/go/" + slug + " is now " + (link.enabled ? "ON" : "OFF"));
  }
  process.exit(0);
}

/* ---------- add ---------- */
if (cmd === "add" || cmd === "new") {
  args.shift();
}

if (args.length >= 2) {
  const slug = args[0];
  const url = args[1];
  const label = args[2] || "";

  if (!/^[A-Za-z0-9_-]{1,40}$/.test(slug)) {
    fail("the slug may only use letters, numbers, dash and underscore (max 40).");
  }
  if (!isUrl(url)) {
    fail("the destination must start with http:// or https://");
  }

  const data = load();
  const existing = find(data, slug);

  if (existing) {
    existing.url = url;
    if (label) existing.label = label;
    existing.enabled = true;
    save(data);
    console.log("Updated: /go/" + slug + "  ->  " + url);
  } else {
    data.links.push({
      slug: slug,
      url: url,
      label: label,
      enabled: true,
      newTab: true,
    });
    save(data);
    console.log("Added:   /go/" + slug + "  ->  " + url);
  }

  console.log("\nYour short link is:   /go/" + slug);
  console.log("Full address once live:  https://yourdomain.com/go/" + slug);
  console.log("\nUpload the changed links.json to your hosting, then it is live.");
  process.exit(0);
}

console.log(
  [
    "addlink.js — your redirect / referral links",
    "",
    "  node addlink.js list",
    '  node addlink.js add <slug> <url> ["label"]',
    "  node addlink.js remove <slug>",
    "  node addlink.js on <slug>",
    "  node addlink.js off <slug>",
    "",
    "Links are served at  /go/<slug>",
  ].join("\n")
);
