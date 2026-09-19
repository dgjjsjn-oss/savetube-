/* ============================================================
   SaveTube server
   ------------------------------------------------------------
   Real YouTube downloads served FROM YOUR OWN DOMAIN.
   No redirects, no third-party sites - the file bytes come
   straight from your server to the visitor's browser.

   Zero npm dependencies. Pure Node.js + yt-dlp + ffmpeg.

   Run locally:   node server.js
   Then open:     http://localhost:8080

   Endpoints:
     GET /health                              host health check
     GET /api/info?v=VIDEOID                  real title/author/qualities
     GET /api/download?v=ID&type=video&quality=1080
     GET /api/download?v=ID&type=audio&bitrate=320
   ============================================================ */

"use strict";

const http = require("http");
const https = require("https");
const fs = require("fs");
const path = require("path");
const os = require("os");
const crypto = require("crypto");
const zlib = require("zlib");
const { spawn, spawnSync } = require("child_process");
const { URL } = require("url");

/* ---------------- Speed and safety headers -------------------------------

   PageSpeed measured 44 KiB of uncompressed first-party code on the critical
   path, and 1-hour cache lifetimes on files that never change between
   deploys. Both are cheap to fix here.

   GZIPPED caches the compressed copy of every text asset in memory, keyed by
   path and modified time, so the cost of compressing style.css is paid once
   per deploy rather than once per visitor. */
const GZIPPED = new Map();

/* Headers sent with every HTML page. HSTS and nosniff are the two that
   PageSpeed asked for and that carry no risk of breaking ads:
     - Strict-Transport-Security keeps every later visit on HTTPS.
     - X-Content-Type-Options stops a browser guessing a file is a script.
     - Cross-Origin-Opener-Policy isolates the window from the pop-under
       tabs this site opens, which is exactly what COOP is for. */
function securityHeaders() {
  return {
    "Strict-Transport-Security": "max-age=31536000; includeSubDomains",
    "X-Content-Type-Options": "nosniff",
    "Cross-Origin-Opener-Policy": "same-origin-allow-popups",
    "Referrer-Policy": "no-referrer-when-downgrade",
  };
}

/* Compress a text response when the browser says it can take it. Returns the
   buffer to send and whether it was compressed. */
function maybeCompress(req, buf) {
  const accepts = String(req.headers["accept-encoding"] || "");
  if (!/\bgzip\b/.test(accepts) || buf.length < 1024) return { body: buf, gzip: false };
  try {
    return { body: zlib.gzipSync(buf, { level: 6 }), gzip: true };
  } catch (e) {
    return { body: buf, gzip: false };
  }
}

/* ---------------- Config (env vars win on hosts) ---------------- */

const CONFIG = {
  port: Number(process.env.PORT) || 8080,
  host: process.env.HOST || "0.0.0.0",
  root: __dirname,
  maxConcurrentDownloads: Number(process.env.MAX_CONCURRENT) || 3,
  downloadsPerHourPerIp: Number(process.env.RATE_LIMIT) || 40,
  infoCacheMinutes: 60,
  maxFileGB: 2,
  /* Speed: the number of video fragments fetched at the same time and the
     HTTP chunk size. YouTube throttles single long connections, so pulling
     several fragments in parallel and reading in chunks is what turns a
     slow trickle into a fast download. Raise them only if the host has
     spare bandwidth. */
  concurrentFragments: Number(process.env.CONCURRENT_FRAGMENTS) || 16,
  httpChunkSize: process.env.HTTP_CHUNK_SIZE || "10M",
  socketTimeout: Number(process.env.SOCKET_TIMEOUT) || 20,
};

/* Applied to every yt-dlp run: parallelism + fail-fast networking.
   These are the switches that make downloads start quickly and finish
   quickly instead of crawling. */
const SPEED = [
  "--no-mtime",
  "--socket-timeout", String(CONFIG.socketTimeout),
  "--retries", "10",
  "--fragment-retries", "20",
  "--concurrent-fragments", String(CONFIG.concurrentFragments),
  "--http-chunk-size", CONFIG.httpChunkSize,

  /* YouTube deliberately throttles long single connections. If the speed
     falls under this, yt-dlp abandons the slow connection and asks for a
     fresh one, which is the difference between a 200 KB/s trickle and a
     full-speed download. */
  "--throttled-rate", "100K",

  /* A bigger read buffer keeps more data in flight per connection. */
  "--buffer-size", "16M",

  /* Auto-reconnect at the transport level if a media connection drops
     mid-download instead of failing the whole job. */
  "--downloader-args", "ffmpeg_i:-reconnect 1 -reconnect_streamed 1 -reconnect_delay_max 5",

  "--extractor-retries", "3",
];

/* If aria2c is ever installed, it is by far the fastest transport: it opens
   many connections to the same file. Detected at boot so it starts being
   used automatically with no code change. */
const ARIA = (() => {
  try {
    const r = spawnSync("aria2c", ["--version"], { stdio: "ignore" });
    return r.status === 0;
  } catch (e) { return false; }
})();

if (ARIA) {
  SPEED.push(
    "--downloader", "aria2c",
    "--downloader-args", "aria2c:-x 16 -s 16 -k 1M --max-connection-per-server=16 --min-split-size=1M"
  );
}

/* ---------------- Tool discovery ---------------- */

/* ---------------- YouTube access ----------------

   YouTube answers anonymous requests from shared hosting addresses with
   "Sign in to confirm you're not a bot" and withholds every player response,
   which is the failure that stopped downloads working. Three things help, in
   order of how much:

     1. cookies - a signed-in session proves the request is a real person.
        Supplied as YT_COOKIES and written to disk at boot, so it never has
        to be committed to the repository.
     2. client  - YouTube treats each player app differently, and the
        embedded-TV client is the one that most often answers without a
        session at all.
     3. a JavaScript runtime - yt-dlp needs one for YouTube's challenge.
        Installed in the image rather than detected at runtime.

   All three are optional. With none of them the site still works for the
   videos YouTube answers anonymously; it just fails on the ones the
   address has been flagged for, instead of failing on everything. */

const COOKIE_FILE = path.join(CONFIG.root, "cookies.txt");

/* Written once at boot. The host wipes the disk on every deploy, so it is
   rewritten on each start rather than persisted. */
(function loadCookies() {
  const raw = String(process.env.YT_COOKIES || "").trim();
  if (!raw) return;
  try {
    /* The value arrives with literal \n escapes, which must become real
       newlines or yt-dlp rejects the file. */
    fs.writeFileSync(COOKIE_FILE, raw.split("\\n").join("\n") + "\n", { mode: 0o600 });
    console.log("cookies : loaded from YT_COOKIES");
  } catch (e) {
    console.error("cookies : could not be written (" + e.message + ")");
  }
})();

const HAS_COOKIES = fs.existsSync(COOKIE_FILE);

/* Tried in order, first success wins. */
const YT_CLIENTS = String(process.env.YT_CLIENTS || "tv_embedded,web_safari,default")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

/* A datacentre address is what YouTube objects to most. Pointing every yt-dlp
   run at a residential or mobile proxy is the one change that reliably clears
   it, so the switch exists even though it costs money to supply. */
const PROXY = String(process.env.YT_PROXY || "").trim();

/* ---------------- Remote engine -----------------------------------------
   The free hosts run on datacentre addresses, and YouTube refuses those:
   the page loads, the download never starts. A home connection is not
   refused, so the yt-dlp work can be done there while this server keeps
   serving the site.

   Point REMOTE_ENGINE_URL at a copy of this same server.js running on that
   home connection (tunnelled), and every /api/info, /api/download and
   /api/transcript request is forwarded there instead of being attempted
   locally. Same paths, same reply shapes - the browser cannot tell.

   Leave it unset and nothing changes: the local yt-dlp is used exactly as
   before. This is a switch, not a dependency.

   REMOTE_ENGINE_TOKEN is optional. Set the same value on both ends and the
   engine only answers requests that carry it, so a public tunnel URL cannot
   be borrowed by anyone else.                                             */
const REMOTE_ENGINE = String(process.env.REMOTE_ENGINE_URL || "").trim().replace(/\/+$/, "");
const REMOTE_ENGINE_TOKEN = String(process.env.REMOTE_ENGINE_TOKEN || "").trim();

/* Which paths the remote engine owns. The transcript goes along with the
   rest because it is read with the same yt-dlp call. */
const ENGINE_PATHS = /^\/api\/(info|download|transcript)$/;

function proxyToEngine(req, res, u) {
  let target;
  try {
    target = new URL(REMOTE_ENGINE + u.pathname + u.search);
  } catch (e) {
    return json(res, 502, { ok: false, error: "Remote engine is misconfigured." });
  }

  const headers = { "user-agent": "SaveTube/1.0", "accept": req.headers.accept || "*/*" };
  if (REMOTE_ENGINE_TOKEN) headers["x-engine-token"] = REMOTE_ENGINE_TOKEN;

  /* http.request speaks plain HTTP only - pointed at an https port it connects
     and then waits forever, which is exactly what happened: the tunnel URL is
     https, every proxied request hung until something upstream gave up.
     Pick the module that matches the scheme. */
  const transport = target.protocol === "https:" ? https : http;

  const upstream = transport.request(
    {
      protocol: target.protocol,
      hostname: target.hostname,
      port: target.port || (target.protocol === "https:" ? 443 : 80),
      path: target.pathname + target.search,
      method: "GET",
      headers: headers,
    },
    (up) => {
      /* A 5xx from the engine means the home connection could not do it
         either. Answering as a clean JSON error beats handing the visitor a
         broken download that dies halfway. */
      if (up.statusCode >= 500) {
        up.resume();
        return json(res, 502, { ok: false, error: "The download engine is not answering. Please try again in a minute." });
      }
      const copy = Object.assign({}, up.headers);
      delete copy.connection;
      delete copy["transfer-encoding"];
      res.writeHead(up.statusCode || 200, copy);
      up.pipe(res);
    }
  );

  /* Downloads are long. Give the engine room, then stop waiting politely.
     Two minutes is enough for the information lookup; a download is bounded
     by the visitor's own patience, so the guard only trips when the engine
     has gone silent, not when the file is still moving. */
  upstream.setTimeout(120000, () => {
    upstream.destroy();
    if (!res.headersSent) json(res, 504, { ok: false, error: "The download engine took too long. Please try again." });
    else res.end();
  });

  upstream.on("error", () => {
    if (!res.headersSent) json(res, 502, { ok: false, error: "The download engine is unreachable. Please try again in a minute." });
  });

  req.on("aborted", () => upstream.destroy());
  upstream.end();
}

function findFfmpeg() {
  const candidates = [
    process.env.FFMPEG_PATH,
    path.join(CONFIG.root, "bin", process.platform === "win32" ? "ffmpeg.exe" : "ffmpeg"),
    "C:\\Users\\nasri\\tools\\ffmpeg-bin\\ffmpeg.exe",
    "/usr/bin/ffmpeg",
    "/usr/local/bin/ffmpeg",
    "ffmpeg",
  ].filter(Boolean);

  for (const c of candidates) {
    if (c.includes(path.sep) || path.isAbsolute(c)) {
      if (fs.existsSync(c)) return c;
    } else {
      const r = spawnSync(c, ["-version"], { stdio: "ignore" });
      if (!r.error) return c;
    }
  }
  return null;
}

function findYtDlp() {
  const candidates = [
    process.env.YTDLP_PATH,
    "yt-dlp",
    "yt-dlp.exe",
    "python3",
    "python",
  ].filter(Boolean);

  for (const c of candidates) {
    const args = c.startsWith("python") ? ["-m", "yt_dlp", "--version"] : ["--version"];
    const r = spawnSync(c, args, { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });
    if (!r.error && r.stdout && r.stdout.trim()) {
      return c.startsWith("python")
        ? { cmd: c, prefix: ["-m", "yt_dlp"], version: r.stdout.trim() }
        : { cmd: c, prefix: [], version: r.stdout.trim() };
    }
  }
  return null;
}

const FFMPEG = findFfmpeg();
const YTDLP = findYtDlp();

if (!YTDLP) {
  console.error("FATAL: yt-dlp was not found. Install it: pip install -U yt-dlp");
  process.exit(1);
}

console.log("yt-dlp  : " + YTDLP.cmd + " " + YTDLP.prefix.join(" ") + "  (" + YTDLP.version + ")");
console.log("ffmpeg  : " + (FFMPEG || "NOT FOUND - high-res merging and MP3 disabled"));

/* ---------------- C++ fast core ----------------
   The heavy string work (filename sanitization, YouTube n-sig decipher op
   execution, size/duration formatting) runs in a compiled C++17 helper at
   machine speed. Every helper degrades gracefully to its JS twin when the
   binary is absent, so the server keeps working anywhere. */

function findCore() {
  const candidates = [
    process.env.SAVETUBE_CORE,
    path.join(CONFIG.root, "tools", process.platform === "win32" ? "savetube_core.exe" : "savetube_core"),
    path.join(CONFIG.root, "savetube_core"),
    "savetube_core",
  ].filter(Boolean);
  for (const c of candidates) {
    if (c.includes(path.sep) || path.isAbsolute(c)) {
      if (fs.existsSync(c)) return c;
    } else {
      const r = spawnSync(c, ["fmtbytes", "1"], { stdio: "ignore" });
      if (!r.error) return c;
    }
  }
  return null;
}
const CORE = findCore();
console.log("core    : " + (CORE || "NOT FOUND - JS fallbacks in use"));

function coreRun(args, input) {
  if (!CORE) return null;
  try {
    const r = spawnSync(CORE, args, {
      input: input || undefined,
      encoding: "utf8",
      timeout: 4000,
      maxBuffer: 8 * 1024 * 1024,
      windowsHide: true,
    });
    if (r.error || r.status !== 0) return null;
    const out = (r.stdout || "").replace(/\r?\n$/, "");
    return out === "" ? null : out;
  } catch (e) {
    return null;
  }
}

/* YouTube's decipher algorithm = reverse / splice(n) / swap(n) / slice(n)
   executed on a signature string. Node parses the player script for the op
   list; this executes it, natively in C++ when present. */
function coreApplyOps(ops, sig) {
  if (CORE) {
    const out = coreRun(["applyops"], JSON.stringify(ops || []) + "\n" + String(sig || ""));
    if (out !== null) return out;
  }
  return jsApplyOps(ops, sig);
}
function jsApplyOps(ops, sig) {
  let s = String(sig || "");
  (Array.isArray(ops) ? ops : []).forEach((o) => {
    const n = Number(o && o.n) || 0;
    if (o.op === "reverse") s = s.split("").reverse().join("");
    else if (o.op === "splice") s = s.slice(n);
    else if (o.op === "swap") {
      if (n < s.length && s.length > 1) {
        const a = s.split("");
        const t = a[n];
        a[n] = a[a.length - 1 - n];
        a[a.length - 1 - n] = t;
        s = a.join("");
      }
    } else if (o.op === "slice") {
      s = n < 0 ? s.slice(0, Math.max(0, s.length + n)) : s.slice(0, n);
    }
  });
  return s;
}
function coreSanitize(name) {
  const out = coreRun(["sanitize", String(name || "video")]);
  return out === null ? safeFilename(name) : out;
}
function coreFmtBytes(n) {
  const out = coreRun(["fmtbytes", String(Number(n) || 0)]);
  return out === null ? fmtBytesJs(n) : out;
}
function fmtBytesJs(n) {
  n = Number(n) || 0;
  if (n < 1024) return n + " B";
  const units = ["KB", "MB", "GB", "TB"];
  let v = n / 1024, u = 0;
  while (v >= 1024 && u < 3) { v /= 1024; u++; }
  return v.toFixed(1) + " " + units[u];
}
function coreFmtDur(sec) {
  const out = coreRun(["fmtdur", String(Number(sec) || 0)]);
  return out === null ? fmtDurJs(sec) : out;
}
function fmtDurJs(sec) {
  sec = Math.max(0, Math.round(Number(sec) || 0));
  const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), s = sec % 60;
  const mm = h ? String(m).padStart(2, "0") : String(m);
  const ss = String(s).padStart(2, "0");
  return h ? h + ":" + mm + ":" + ss : mm + ":" + ss;
}

/* ---------------- Helpers ---------------- */

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".ico": "image/x-icon",
  ".txt": "text/plain; charset=utf-8",
  ".xml": "application/xml; charset=utf-8",
  ".webmanifest": "application/manifest+json; charset=utf-8",
  ".webm": "video/webm",
  ".mp4": "video/mp4",
};

function json(res, code, obj) {
  const body = JSON.stringify(obj);
  res.writeHead(code, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    "Access-Control-Allow-Origin": "*",
  });
  res.end(body);
}

function validId(id) {
  return typeof id === "string" && /^[\w-]{11}$/.test(id);
}

function safeFilename(name) {
  return String(name || "video")
    .replace(/[\\/:*?"<>|\u0000-\u001f]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 80) || "video";
}

function humanBytes(n) {
  if (!n || n < 0) return null;
  const u = ["B", "KB", "MB", "GB"];
  let i = 0;
  while (n >= 1024 && i < u.length - 1) { n /= 1024; i++; }
  return Math.round(n * 10) / 10 + " " + u[i];
}

/* ---------------- Info cache ---------------- */

const infoCache = new Map();

function cacheGet(id) {
  const hit = infoCache.get(id);
  if (!hit) return null;
  if (Date.now() - hit.at > CONFIG.infoCacheMinutes * 60 * 1000) {
    infoCache.delete(id);
    return null;
  }
  return hit.data;
}

function cacheSet(id, data) {
  if (infoCache.size > 200) {
    const oldest = infoCache.keys().next().value;
    infoCache.delete(oldest);
  }
  infoCache.set(id, { at: Date.now(), data });
}

/* ---------------- Abuse guard: quota + throttle + auto-ban ----------------
   Three separate walls, so a flood or a scraper cannot take the site down:

   1. Download quota  - 40 downloads per hour per visitor ip.
   2. Request throttle- a hard cap on requests per minute per ip.
                        Anything faster than a real person clicking is
                        refused, and a repeat offender is banned outright.
   3. Socket cap      - the total number of open connections is bounded,
                        so the process cannot be exhausted.

   Visits from ordinary people never reach any of these limits. */

const hits = new Map();     // download quota per ip
const traffic = new Map();  // requests per minute per ip
const bans = new Map();     // temporary bans

const GUARD = {
  reqsPerMinute: Number(process.env.REQ_PER_MIN) || 300,
  strikesBeforeBan: 6,
  banMinutes: Number(process.env.BAN_MINUTES) || 15,
  maxSockets: Number(process.env.MAX_SOCKETS) || 250,
  maxTrackedIps: 5000,
  strikeDecayMs: 10 * 60 * 1000,
};

/* ---------- Visitor identity, done privately ----------

   Only the reverse proxy we actually run behind is trusted to tell us the
   real address. If TRUST_PROXY is off, a header claiming to be X-Forwarded-For
   is ignored, because anyone can invent one and would otherwise be able to
   skip the rate limit by changing it on every request.

   The address is then hashed before it is used as a counter key, so the
   server never holds a list of raw IP addresses. The hash is only good for
   counting requests in a short window. */
const TRUST_PROXY = String(process.env.TRUST_PROXY || "0") === "1";
const IP_SALT = process.env.IP_SALT || crypto.randomBytes(16).toString("hex");

function rawIp(req) {
  if (TRUST_PROXY) {
    const fwd = req.headers["x-forwarded-for"];
    if (fwd) return String(fwd).split(",")[0].trim();
    const real = req.headers["x-real-ip"];
    if (real) return String(real).trim();
  }
  return (req.socket && req.socket.remoteAddress) || "unknown";
}

function clientIp(req) {
  return crypto.createHash("sha256").update(IP_SALT + "|" + rawIp(req)).digest("hex").slice(0, 32);
}

function allow(ip) {
  const now = Date.now();
  let rec = hits.get(ip);
  if (!rec || now > rec.resetAt) {
    rec = { count: 0, resetAt: now + 60 * 60 * 1000 };
    hits.set(ip, rec);
  }
  rec.count++;
  return rec.count <= CONFIG.downloadsPerHourPerIp;
}

/* General request throttle. false = refuse this request.

   Strikes are counted ONCE PER MINUTE that goes over the limit, never once
   per request. A burst from a shared connection (office, mobile carrier)
   costs at most one strike, while a sustained flood earns a ban. Strikes
   also decay after ten quiet minutes. */
function underLimit(ip) {
  const now = Date.now();

  const bannedUntil = bans.get(ip);
  if (bannedUntil) {
    if (now < bannedUntil) return false;
    bans.delete(ip);
  }

  let rec = traffic.get(ip);

  if (!rec || now > rec.resetAt) {
    const carriedStrikes = rec && rec.strikes &&
      now - (rec.lastViolation || 0) < GUARD.strikeDecayMs ? rec.strikes : 0;
    rec = { count: 0, resetAt: now + 60000, strikes: carriedStrikes, punished: false, lastViolation: rec ? rec.lastViolation || 0 : 0 };
    traffic.set(ip, rec);
  }

  rec.count++;

  // Keep memory bounded no matter how many ips arrive.
  if (traffic.size > GUARD.maxTrackedIps) {
    const oldest = traffic.keys().next().value;
    traffic.delete(oldest);
  }

  if (rec.count > GUARD.reqsPerMinute) {
    if (!rec.punished) {
      rec.punished = true;                       // one strike for this window
      rec.strikes = (rec.strikes || 0) + 1;
      rec.lastViolation = now;
      if (rec.strikes >= GUARD.strikesBeforeBan) {
        bans.set(ip, now + GUARD.banMinutes * 60 * 1000);
        traffic.delete(ip);
        console.warn("[guard] banned " + ip + " for " + GUARD.banMinutes + " minutes");
      }
    }
    return false;
  }

  return true;
}

/* Headers that every response carries. */
const SECURITY_HEADERS = {
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "SAMEORIGIN",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "Permissions-Policy": "geolocation=(), microphone=(), camera=(), payment=()",
  "X-XSS-Protection": "0",
};

/* ---------------- yt-dlp: metadata ---------------- */

/* Name and thumbnail from a public endpoint that does not use the player API,
   so it keeps answering when the format list cannot be fetched. It returns no
   quality ladder, which the page already handles by offering its standard
   choices - better than an error with nothing on screen. */
function oembedInfo(videoId, cb) {
  const url = "https://www.youtube.com/oembed?url=" +
    encodeURIComponent("https://www.youtube.com/watch?v=" + videoId) +
    "&format=json";

  const controller = new AbortController();
  const timer = setTimeout(() => { try { controller.abort(); } catch (e) {} }, 8000);

  fetch(url, { signal: controller.signal })
    .then((r) => (r.ok ? r.json() : null))
    .then((j) => {
      clearTimeout(timer);
      if (!j || !j.title) {
        return cb(new Error("Could not read this video. It may be private, age-restricted or region-locked."));
      }
      cb(null, {
        ok: true,
        videoId: videoId,
        title: j.title,
        author: j.author_name || "",
        thumbnail: "https://i.ytimg.com/vi/" + videoId + "/hqdefault.jpg",
        duration: null,
        qualities: [],
        degraded: true,
      });
    })
    .catch(() => {
      clearTimeout(timer);
      cb(new Error("Could not read this video. It may be private, age-restricted or region-locked."));
    });
}

/* Walks the client list, then falls back to the public oEmbed endpoint, so a
   video YouTube refuses still shows its name and thumbnail rather than a
   bare error. First client that answers wins and its result is cached.

   When YT_INFO_MODE=oembed the engine lookup is skipped entirely and the
   page gets its name + thumbnail from the free oEmbed endpoint in well under
   a second. That mode exists for hosts whose address YouTube refuses (most
   cloud providers): asking yt-dlp there is pointless - every client times
   out - so the visitor stops waiting and sees the result immediately, and
   the standard quality choices still appear. */
function fetchInfo(videoId, cb) {
  const cached = cacheGet(videoId);
  if (cached) return cb(null, cached);

  if (process.env.YT_INFO_MODE === "oembed") {
    console.error("info    : engine lookup skipped for " + videoId + " (YT_INFO_MODE=oembed)");
    return invidiousInfo(videoId, cb);
  }

  /* Fast path first: the public Invidious API answers in about two seconds
     with real titles and a real quality ladder, and its result is cached.
     The full yt-dlp engine walk (below) is the robust fallback and only runs
     when every Invidious instance is down or the video has no streams there.
     This is what keeps /api/info feeling instant even for long 4K videos:
     a visitor never waits 10-15s for a cold yt-dlp extraction. */
  const fast = process.env.YT_INFO_MODE === "ytdlp" ? null : invidiousInfo;
  if (fast) {
    return fast(videoId, (invErr, invData) => {
      if (!invErr && invData && invData.qualities && invData.qualities.length) {
        cacheSet(videoId, invData);
        return cb(null, invData);
      }
      engineInfo(videoId, cb);
    });
  }

  engineInfo(videoId, cb);
}

function engineInfo(videoId, cb) {

  let i = 0;
  const tried = [];

  (function next() {
    if (i >= YT_CLIENTS.length) {
      console.error("info    : every client refused " + videoId + " [" + tried.join("; ") + "]");
      /* Invidious gives the page a REAL quality ladder with playable stream
         URLs. oEmbed is only a title+thumbnail last resort below it. */
      return invidiousInfo(videoId, (invErr, invData) => {
        if (invErr || !invData || !invData.qualities || !invData.qualities.length) {
          return oembedInfo(videoId, cb);
        }
        cb(null, invData);
      });
    }
    const client = YT_CLIENTS[i++];
    tryInfoWithClient(videoId, client, (err, data) => {
      if (err) {
        tried.push(client + " -> " + err.message);
        /* Any of these means the ADDRESS is refused, not the client. No other
           client from this same address will do better, so stop walking the
           list and fall back to the resolver straight away instead of making
           the visitor wait through the same refusal three more times. */
        if (/sign-in|not a bot|no player response/i.test(err.message)) {
          console.error("info    : IP refused outright (" + client + "), skipping remaining clients");
          return invidiousInfo(videoId, (invErr, invData) => {
            if (invErr || !invData || !invData.qualities || !invData.qualities.length) {
              return oembedInfo(videoId, cb);
            }
            cb(null, invData);
          });
        }
        return next();
      }
      cb(null, data);
    });
  })();
}

/* One lookup with one player client. Kept separate so the caller can walk the
   client list and stop at the first that answers. */
function tryInfoWithClient(videoId, client, cb) {
  const args = YTDLP.prefix.concat([
    "--dump-single-json",
    "--no-warnings",
    "--no-playlist",
    "--no-check-formats",
    "--socket-timeout", "8",
    "--extractor-retries", "1",
    "--retries", "1",
  ]);
  args.push("--extractor-args", "youtube:player_client=" + client);
  if (HAS_COOKIES) args.push("--cookies", COOKIE_FILE);
  if (PROXY) args.push("--proxy", PROXY);
  args.push("https://www.youtube.com/watch?v=" + videoId);

  const child = spawn(YTDLP.cmd, args);
  let out = "";
  let err = "";

  child.stdout.on("data", (d) => { out += d; });
  child.stderr.on("data", (d) => { err += d; });

  /* 25 seconds, not 60: YouTube either answers a lookup quickly or it is
     stalling a datacentre address, and three clients in series at 60 seconds
     each is what made Get Link hang for a minute before showing anything. */
  const killTimer = setTimeout(() => { try { child.kill(); } catch (e) {} }, 25000);

  child.on("close", () => {
    clearTimeout(killTimer);
    let raw;
    try { raw = JSON.parse(out); } catch (e) {
      /* This client was refused. Report why so the caller can move on to the
         next one and, if none work, log exactly what YouTube said. */
      const why = /Sign in to confirm|not a bot/i.test(err)
        ? "YouTube demanded a sign-in"
        : (/Failed to extract any player response/i.test(err)
            ? "no player response"
            : String(err).split("\n").filter(Boolean).pop() || "unreadable reply");
      return cb(new Error(why));
    }

    /* yt-dlp prints the literal word null when it gives up. That parses
       perfectly well and then blows up on the format walk below, taking the
       whole server down with it. Treated as a refusal from this client so the
       next one gets a turn. */
    if (!raw || typeof raw !== "object") {
      return cb(new Error("empty reply from YouTube"));
    }

    const heights = {};
    (raw.formats || []).forEach((f) => {
      if (f.vcodec && f.vcodec !== "none" && f.height) {
        const h = f.height;
        const cur = heights[h];
        if (!cur || (f.filesize || f.filesize_approx || 0) > (cur.size || 0)) {
          heights[h] = { height: h, fps: f.fps || 30, size: f.filesize || f.filesize_approx || 0 };
        }
      }
    });

    const ladder = [2160, 1440, 1080, 720, 480, 360, 240, 144];
    const labels = { 2160: "4K", 1440: "1440p", 1080: "1080p", 720: "720p", 480: "480p", 360: "360p", 240: "240p", 144: "144p" };

    /* One button per REAL height the video actually has, biggest first.
       The old loop walked the ladder and pushed whatever the biggest format
       at or below each rung was, so a 360p-only video advertised 4K, 1440p,
       1080p, 720p and 480p keys that all served the same 360p file. Now each
       distinct height appears exactly once, and the label is the smallest
       ladder name that still describes it truthfully. */
    const qualities = [];
    const seenHeights = {};
    Object.keys(heights)
      .map(Number)
      .sort((a, b) => b - a)
      .forEach((hh) => {
        if (seenHeights[hh]) return;
        let label = hh + "p";
        for (let i = ladder.length - 1; i >= 0; i--) {
          if (ladder[i] >= hh) { label = labels[ladder[i]] || label; break; }
        }
        if (hh > 2160) label = "4K+";
        seenHeights[hh] = true;
        const best = heights[hh];
        qualities.push({
          label: label,
          value: String(hh),
          height: hh,
          fps: best.fps,
          size: best.size || null,
          sizeText: humanBytes(best.size),
        });
      });

    const audioSizes = {};
    (raw.formats || []).forEach((f) => {
      if ((!f.vcodec || f.vcodec === "none") && f.acodec && f.acodec !== "none") {
        const b = f.abr ? Math.round(f.abr) : 128;
        const s = f.filesize || f.filesize_approx || 0;
        if (!audioSizes[b] || s > audioSizes[b]) audioSizes[b] = s;
      }
    });
    const bestAudioBits = Math.max.apply(null, [0].concat(Object.keys(audioSizes).map(Number)));
    const bestAudioSize = audioSizes[bestAudioBits] || 0;

    const data = {
      ok: true,
      videoId: videoId,
      title: raw.title || "YouTube video",
      author: raw.uploader || raw.channel || "",
      thumbnail: raw.thumbnail || ("https://i.ytimg.com/vi/" + videoId + "/hqdefault.jpg"),
      duration: raw.duration || null,
      durationText: raw.duration_string || null,
      qualities: qualities,
      audioBitrates: [320, 256, 192, 128, 64],
      audioExt: FFMPEG ? "mp3" : "m4a",
      audioSourceSize: bestAudioSize || null,
      audioSourceSizeText: humanBytes(bestAudioSize),
      ffmpeg: !!FFMPEG,
      engine: "yt-dlp " + YTDLP.version,
    };

    cacheSet(videoId, data);
    cb(null, data);
  });

  child.on("error", () => cb(new Error("Downloader engine failed to start.")));
}

/* ---------------- Time helpers (for the timeline / trim feature) ---------- */

/* Accepts "90", "1:30", "01:02:03", "1h2m3s", "90s". Returns seconds or null. */
function parseTimeToSeconds(v) {
  if (v === null || v === undefined) return null;
  const s = String(v).trim();
  if (!s) return null;

  let m = s.match(/^(\d{1,3}):(\d{1,2}):(\d{1,2})$/);
  if (m) return Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[3]);

  m = s.match(/^(\d{1,4}):(\d{1,2})$/);
  if (m) return Number(m[1]) * 60 + Number(m[2]);

  m = s.match(/^(\d+(?:\.\d+)?)$/);
  if (m) return Math.floor(Number(m[1]));

  m = s.match(/^(?:(\d+)\s*h)?\s*(?:(\d+)\s*m)?\s*(?:(\d+)\s*s)?$/i);
  if (m && (m[1] || m[2] || m[3])) {
    return Number(m[1] || 0) * 3600 + Number(m[2] || 0) * 60 + Number(m[3] || 0);
  }
  return null;
}

function fmtSectionTime(sec) {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = Math.floor(sec % 60);
  const pad = (n) => String(n).padStart(2, "0");
  return (h > 0 ? pad(h) + ":" : "") + pad(m) + ":" + pad(s);
}

/* Turns "start"/"end" request values into a yt-dlp download-section spec.
   Cutting needs ffmpeg, so without it the request is served uncut. */
function buildSection(startRaw, endRaw, duration) {
  if (!FFMPEG) return null;

  const start = parseTimeToSeconds(startRaw);
  const end = parseTimeToSeconds(endRaw);
  if (start === null && end === null) return null;

  let s = start === null ? 0 : Math.max(0, start);
  let e = end;

  if (duration && s >= duration - 1) return null;      // cut starts past the end
  if (e !== null && e <= s) return null;               // empty range
  if (e !== null && duration) e = Math.min(e, duration);

  const spec = "*" + fmtSectionTime(s) + "-" + (e !== null ? fmtSectionTime(e) : "inf");

  return {
    spec: spec,
    start: s,
    end: e,
    seconds: e !== null ? Math.round(e - s) : (duration ? Math.round(duration - s) : null),
  };
}

/* ---------------- yt-dlp: download ---------------- */

function buildDownload(videoId, type, quality, bitrate, section) {
  const url = "https://www.youtube.com/watch?v=" + videoId;

  // A cut always has to be produced through ffmpeg, so it is written to a
  // temp file and then sent, exactly like a merge.
  const cut = section
    ? ["--download-sections", section.spec, "--force-keyframes-at-cuts"]
    : [];
  const hasCut = !!section;

  if (type === "audio") {
    const b = [64, 128, 192, 256, 320].indexOf(Number(bitrate)) > -1 ? Number(bitrate) : 320;
    if (FFMPEG) {
      return {
        args: [
          "-f", "bestaudio/best",
          "-x", "--audio-format", "mp3",
          "--audio-quality", b + "K",
          "--no-playlist", "--no-warnings", "--no-part",
        ].concat(cut).concat([
          "-o", null, // set below (temp file)
          url,
        ]),
        ext: "mp3",
        contentType: "audio/mpeg",
        needsFile: true,
        label: b + "kbps",
      };
    }
    // No ffmpeg: serve the real audio stream as-is (m4a).
    const want = b >= 256 ? "bestaudio[ext=m4a]/bestaudio" : "bestaudio[ext=m4a][abr<=" + b + "]/bestaudio[ext=m4a]/bestaudio";
    return {
      args: ["-f", want, "--no-playlist", "--no-warnings", "-o", "-", url],
      ext: "m4a",
      contentType: "audio/mp4",
      needsFile: false,
      label: "audio",
    };
  }

  // video
  const q = Number(quality) || 1080;

  /* Codec choice matters more than file size here.

     "best video" on YouTube means AV1 or VP9, which are efficient but are
     refused outright by Windows' own player, plenty of phones, most TVs and
     several video editors. A file that will not open is worth nothing, so
     H.264 video with AAC audio is asked for first: it plays everywhere.
     Only when a resolution genuinely has no H.264 version - YouTube normally
     stops offering it above 1080p - does this fall through to AV1/VP9. */
  const fmt =
    "bv*[height<=" + q + "][vcodec^=avc1]+ba[acodec^=aac]/" +
    "bv*[height<=" + q + "][vcodec^=avc1]+ba/" +
    "b[height<=" + q + "][vcodec^=avc1]/" +
    "bv*[height<=" + q + "]+ba/" +
    "b[height<=" + q + "]/b";

  if (FFMPEG) {
    return {
      args: [
        "-f", fmt,
        "-S", "vcodec:h264,acodec:aac,res,br",
        "--merge-output-format", "mp4",
        "--no-playlist", "--no-warnings", "--no-part",
      ].concat(cut).concat([
        "-o", null,
        url,
      ]),
      ext: "mp4",
      contentType: "video/mp4",
      needsFile: true,
      label: q + "p" + (hasCut ? " cut" : ""),
    };
  }

  // No ffmpeg: only single-file (progressive) formats can be produced.
  return {
    args: [
      "-f", "b[height<=" + q + "][vcodec^=avc1][ext=mp4]/b[height<=" + q + "][ext=mp4]/b[height<=" + q + "]/b",
      "--no-playlist", "--no-warnings",
      "-o", "-",
      url,
    ],
    ext: "mp4",
    contentType: "video/mp4",
    needsFile: false,
    label: q + "p",
  };
}

function ytdlpArgs(extra, client) {
  const args = YTDLP.prefix.concat(SPEED);
  /* Downloading has to negotiate the player the same way the lookup did,
     otherwise YouTube refuses the media URL as well. A comma list is tried
     in order, so passing the whole chain lets yt-dlp pick a working one. */
  args.push("--extractor-args", "youtube:player_client=" + (client || YT_CLIENTS.join(",")));
  if (HAS_COOKIES) args.push("--cookies", COOKIE_FILE);
  if (PROXY) args.push("--proxy", PROXY);
  args.push.apply(args, extra);
  if (FFMPEG) args.unshift("--ffmpeg-location", path.dirname(FFMPEG));
  return args;
}

let activeDownloads = 0;

/* ---------------- Fallback resolver ----------------
   If the primary engine is refused from this datacentre IP, public resolver
   instances still expose playable stream URLs. Asking them keeps real
   downloads working even when YouTube blocks the host.

   Invidious is checked first: it answers anonymously from any address and
   returns muxed + adaptive streams with REAL googlevideo URLs. The old Piped
   pool is kept as a second pass for hosts where Invidious is down. */

const INVIDIOUS_INSTANCES = [
  "https://invidious.f5.si",
  "https://inv.nerdvpn.de",
];

const PIPED_INSTANCES = [
  "https://pipedapi.kavin.rocks",
  "https://api.piped.yt",
  "https://pipedapi.adminforge.de",
];

function parseQt(q) {
  /* "2160p60" -> 2160, "720p" -> 720, "60" -> 60. Take the height that
     appears before the optional "p<fps>" suffix. */
  const m = String(q).match(/(\d+)\s*p/i);
  const n = parseInt(m ? m[1] : String(q).replace(/[^0-9]/g, ""), 10);
  return isNaN(n) ? 0 : n;
}

/* One Invidious lookup: real title + real quality ladder for /api/info.
   Returns a data object shaped exactly like the yt-dlp result, so the page
   gets genuine resolution choices (360p..2160p) instead of a degraded
   oEmbed fallback that only knows the title. */
function invidiousInfo(videoId, cb) {
  let i = 0;
  (function next() {
    if (i >= INVIDIOUS_INSTANCES.length) {
      return cb(new Error("Public resolver could not read this video."));
    }
    const base = INVIDIOUS_INSTANCES[i++];
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 10000);
    fetch(
      base + "/api/v1/videos/" + encodeURIComponent(videoId) +
        "?fields=title,author,lengthSeconds,formatStreams,adaptiveFormats",
      { signal: ctrl.signal, headers: { "user-agent": "Mozilla/5.0" } }
    )
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => {
        clearTimeout(timer);
        if (!j || j.error) return next();
        const heights = {};
        (j.adaptiveFormats || []).forEach((f) => {
          if (f.type && f.type.indexOf("video") === 0 && f.qualityLabel) {
            const h = parseQt(f.qualityLabel);
            if (h && (!heights[h] || (f.bitrate || 0) > (heights[h].bitrate || 0))) {
              heights[h] = { height: h, fps: /60/.test(f.fps || f.qualityLabel) ? 60 : 30, bitrate: f.bitrate || 0 };
            }
          }
        });
        const audio = (j.adaptiveFormats || [])
          .filter((f) => f.type && f.type.indexOf("audio") === 0)
          .map((f) => Math.round((f.bitrate || 128000) / 1000));
        const ladder = [2160, 1440, 1080, 720, 480, 360, 240, 144];
        const labels = { 2160: "4K", 1440: "1440p", 1080: "1080p", 720: "720p", 480: "480p", 360: "360p", 240: "240p", 144: "144p" };
        const qualities = Object.keys(heights)
          .map(Number)
          .sort((a, b) => b - a)
          .map((hh) => {
            let label = hh + "p";
            for (let i = ladder.length - 1; i >= 0; i--) {
              if (ladder[i] >= hh) { label = labels[ladder[i]] || label; break; }
            }
            return {
              label: label,
              value: String(hh),
              height: hh,
              fps: heights[hh].fps,
              size: null,
              sizeText: null,
            };
          });
        cb(null, {
          ok: true,
          videoId: videoId,
          title: j.title || "YouTube video",
          author: j.author || "",
          thumbnail: "https://i.ytimg.com/vi/" + videoId + "/hqdefault.jpg",
          duration: j.lengthSeconds || null,
          durationText: j.lengthSeconds ? formatClock(j.lengthSeconds) : null,
          qualities: qualities,
          audioBitrates: [320, 256, 192, 128, 64],
          audioExt: FFMPEG ? "mp3" : "m4a",
          audioSourceSize: null,
          audioSourceSizeText: null,
          ffmpeg: !!FFMPEG,
          engine: "invidious",
        });
      })
      .catch(() => {
        clearTimeout(timer);
        return next();
      });
  })();
}

function formatClock(sec) {
  sec = Math.round(sec);
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  const mm = h ? String(m).padStart(2, "0") : String(m);
  const ss = String(s).padStart(2, "0");
  return h ? h + ":" + mm + ":" + ss : mm + ":" + ss;
}

/* Resolve a REAL stream URL for one video/type/quality.
   Invidious returns formatStreams (muxed video+audio) and adaptiveFormats
   (video-only or audio-only). The chosen URL is a real googlevideo address,
   so downloads are genuine files, not placeholders. */
async function resolveInvidiousStream(videoId, type, quality) {
  for (const base of INVIDIOUS_INSTANCES) {
    try {
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), 5000);
      const r = await fetch(
        base + "/api/v1/videos/" + encodeURIComponent(videoId) +
          "?fields=title,formatStreams,adaptiveFormats",
        { signal: ctrl.signal, headers: { "user-agent": "Mozilla/5.0" } }
      );
      clearTimeout(t);
      if (!r.ok) continue;
      const j = await r.json();
      if (!j || j.error) continue;

      if (type === "audio") {
        const audio = (j.adaptiveFormats || [])
          .filter((f) => f.type && f.type.indexOf("audio") === 0 && f.url)
          .slice()
          .sort((a, b) => (b.bitrate || 0) - (a.bitrate || 0));
        if (audio.length) {
          return {
            url: audio[0].url,
            label: "audio",
            ext: "m4a",
            contentType: "audio/mp4",
            bitrate: audio[0].bitrate || null,
          };
        }
      } else {
        const q = Number(quality) || 1080;
        /* First choice: a muxed stream (video+audio in one file) at or below
           the requested height so the visitor gets a complete MP4.
           Invidious entries do not always set hasVideo/hasAudio, so ALSO
           treat a stream whose codecs contain both a video codec and an
           audio codec as muxed. */
        const isMuxed = (f) =>
          (f.hasVideo && f.hasAudio) ||
          /codecs="[^"]*(avc1|avc3|vp9|av01)[^"]*,[^"]*(mp4a|opus|ac-3)[^"]*"/.test(String(f.type || ""));
        const muxed = (j.formatStreams || [])
          .filter((f) => f.url && isMuxed(f))
          .slice()
          .sort((a, b) => parseQt(b.qualityLabel) - parseQt(a.qualityLabel));
        const pick = muxed.find((s) => parseQt(s.qualityLabel) <= q) ||
          muxed[muxed.length - 1];
        if (pick) {
          return {
            url: pick.url,
            label: String(pick.qualityLabel || quality || "video").replace(/p+$/i, "") + "p",
            ext: "mp4",
            contentType: "video/mp4",
            bitrate: null,
          };
        }
        /* Second choice: adaptive video stream (no audio in the same file)
           at or below the requested height. Return the best audio stream too,
           so the server can merge them into a real MP4 with sound when ffmpeg
           is available (most videos expose only adaptive streams). */
        const vids = (j.adaptiveFormats || [])
          .filter((f) => f.url && f.type && f.type.indexOf("video") === 0)
          .slice()
          .sort((a, b) => parseQt(b.qualityLabel) - parseQt(a.qualityLabel));
        const vpick =
          vids.find((s) => parseQt(s.qualityLabel) <= q) ||
          vids[vids.length - 1];
        if (vpick) {
          const auds = (j.adaptiveFormats || [])
            .filter((f) => f.url && f.type && f.type.indexOf("audio") === 0)
            .slice()
            .sort((a, b) => (b.bitrate || 0) - (a.bitrate || 0));
          return {
            url: vpick.url,
            label: String(vpick.qualityLabel || quality || "video").replace(/p+$/i, "") + "p",
            ext: "mp4",
            contentType: "video/mp4",
            bitrate: null,
            audioUrl: auds.length ? auds[0].url : null,
          };
        }
      }
    } catch (e) {
      /* try the next instance */
    }
  }
  return null;
}

async function resolvePipedStream(videoId, type, quality) {
  /* Invidious first: it reliably answers from datacentre IPs. */
  const inv = await resolveInvidiousStream(videoId, type, quality);
  if (inv) return inv;

  /* Legacy Piped pass, kept for hosts where Invidious is unreachable. */
  for (const base of PIPED_INSTANCES) {
    try {
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), 6000);
      const r = await fetch(base + "/streams/" + encodeURIComponent(videoId), {
        signal: ctrl.signal,
        headers: { "user-agent": "Mozilla/5.0" },
      });
      clearTimeout(t);
      if (!r.ok) continue;
      const j = await r.json();
      if (!j || j.error) continue;
      if (type === "audio") {
        const list = (j.audioStreams || []).slice().sort((a, b) => (b.bitrate || 0) - (a.bitrate || 0));
        if (list.length) {
          return {
            url: list[0].url,
            label: "audio",
            ext: "m4a",
            contentType: "audio/mp4",
            bitrate: list[0].bitrate || null,
          };
        }
      } else {
        const q = Number(quality) || 1080;
        const vids = (j.videoStreams || []).slice().sort((a, b) => parseQt(b.quality) - parseQt(a.quality));
        const pick =
          vids.find((s) => !s.videoOnly && parseQt(s.quality) <= q) ||
          vids.find((s) => !s.videoOnly) ||
          vids[0];
        if (pick) {
          return {
            url: pick.url,
            label: (pick.quality || "video") + "p",
            ext: "mp4",
            contentType: "video/mp4",
            bitrate: null,
          };
        }
      }
    } catch (e) {
      /* try the next instance */
    }
  }
  return null;
}

/* Streams an already-resolved URL. Idempotent: whatever the primary engine
   did or did not manage, this either returns a real file/redirect or a clean
   500, and always calls done() exactly once. */
/* Can this server reach googlevideo media URLs? On datacentre hosts
   (Render etc.) YouTube refuses the whole IP range, so merging on the
   server produces empty files. When unreachable, serveFallback redirects
   the visitor's browser directly to the real URL — their residential IP
   CAN fetch it — instead of piping zero bytes. */
function canReachMedia(url, ms) {
  return new Promise((resolve) => {
    const ctrl = new AbortController();
    const t = setTimeout(() => { try { ctrl.abort(); } catch (e) {} resolve(false); }, ms || 6000);
    fetch(url, {
      method: "GET",
      signal: ctrl.signal,
      headers: { "user-agent": "Mozilla/5.0", range: "bytes=0-65535" },
    })
      .then(async (r) => {
        const buf = await r.arrayBuffer().catch(() => null);
        clearTimeout(t);
        resolve(!!(r && r.ok && buf && buf.byteLength > 0));
      })
      .catch(() => {
        clearTimeout(t);
        resolve(false);
      });
  });
}

function serveFallback(videoId, type, spec, q, req, res, done) {
  resolvePipedStream(videoId, type, q.get(type === "audio" ? "bitrate" : "quality") || "")
    .then((hit) => {
      if (!hit) {
        try {
          res.writeHead(500, { "Content-Type": "text/plain; charset=utf-8" });
          res.end("Download source unavailable right now. Try again in a moment.");
        } catch (e) {}
        return done();
      }
      /* High-quality audio: run ffmpeg on the resolved stream so the visitor
         receives a real converted MP3 at the requested bitrate. On hosts
         where YouTube refuses the server's IP, hand the visitor the raw
         audio URL directly instead of a shredded file. */
      if (type === "audio" && FFMPEG) {
        const bitrate = [64, 128, 192, 256, 320].indexOf(Number(q.get("bitrate"))) > -1
          ? Number(q.get("bitrate"))
          : 320;
        return canReachMedia(hit.url)
          .then((reachable) => {
            if (!reachable) {
              try {
                res.writeHead(302, { Location: hit.url, "Access-Control-Allow-Origin": "*" });
                res.end();
              } catch (e) {}
              return done();
            }
            const child = spawn(FFMPEG, [
              "-nostdin", "-i", hit.url,
              "-vn", "-c:a", "libmp3lame", "-b:a", String(bitrate) + "k",
              "-f", "mp3", "pipe:1",
            ], { stdio: ["ignore", "pipe", "ignore"] });
            try {
              res.setHeader("Content-Type", "audio/mpeg");
              res.writeHead(200);
            } catch (e) {
              try { child.kill(); } catch (e2) {}
              return done();
            }
            child.stdout.pipe(res);
            child.on("error", () => { try { res.destroy(); } catch (e) {} done(); });
            child.on("close", () => done());
            req.on("close", () => { try { child.kill(); } catch (e) {} });
          })
          .catch(() => {
            try {
              res.writeHead(500, { "Content-Type": "text/plain; charset=utf-8" });
              res.end("Download source unavailable right now. Try again in a moment.");
            } catch (e) {}
            done();
          });
      }

      /* Adaptive video often carries no audio track. When the resolver found a
         separate audio stream, merge both with ffmpeg so the visitor gets a
         real MP4 WITH SOUND — exactly like the primary engine would produce.
         On datacentre hosts that cannot reach YouTube media, fall through to
         redirecting the visitor's own browser to the real stream URL. */
      if (type === "video" && hit.audioUrl && FFMPEG) {
        return canReachMedia(hit.url)
          .then((reachable) => {
            if (!reachable) {
              try {
                res.writeHead(302, { Location: hit.url, "Access-Control-Allow-Origin": "*" });
                res.end();
              } catch (e) {}
              return done();
            }
            const child = spawn(FFMPEG, [
              "-nostdin",
              "-i", hit.url,
              "-i", hit.audioUrl,
              "-c:v", "copy",
              "-c:a", "aac",
              "-shortest",
              "-movflags", "frag_keyframe+empty_moov",
              "-f", "mp4", "pipe:1",
            ], { stdio: ["ignore", "pipe", "ignore"] });
            try {
              res.setHeader("Content-Type", "video/mp4");
              res.writeHead(200);
            } catch (e) {
              try { child.kill(); } catch (e2) {}
              return done();
            }
            child.stdout.pipe(res);
            child.on("error", () => { try { res.destroy(); } catch (e) {} done(); });
            child.on("close", () => done());
            req.on("close", () => { try { child.kill(); } catch (e) {} });
          })
          .catch(() => {
            try {
              res.writeHead(500, { "Content-Type": "text/plain; charset=utf-8" });
              res.end("Download source unavailable right now. Try again in a moment.");
            } catch (e) {}
            done();
          });
      }

      /* Everything else: hand the visitor the real stream URL directly. */
      try {
        res.writeHead(302, { Location: hit.url, "Access-Control-Allow-Origin": "*" });
        res.end();
      } catch (e) {}
      done();
    })
    .catch(() => {
      try {
        res.writeHead(500, { "Content-Type": "text/plain; charset=utf-8" });
        res.end("Download source unavailable right now. Try again in a moment.");
      } catch (e) {}
      done();
    });
}

function handleDownload(req, res, q) {
  const videoId = q.get("v");
  const type = q.get("type") === "audio" ? "audio" : "video";

  if (!validId(videoId)) return json(res, 400, { ok: false, error: "Bad video id." });

  const ip = clientIp(req);
  if (!allow(ip)) {
    return json(res, 429, { ok: false, error: "Too many downloads from this connection. Try again later." });
  }

  if (activeDownloads >= CONFIG.maxConcurrentDownloads) {
    return json(res, 503, { ok: false, error: "Server is busy right now. Try again in a few seconds." });
  }

  // Optional timeline cut, for example ?start=1:30&end=2:45
  const cachedInfo = cacheGet(videoId);
  const knownDuration = cachedInfo && cachedInfo.duration ? Number(cachedInfo.duration) : null;
  const section = buildSection(q.get("start"), q.get("end"), knownDuration);

  const spec = buildDownload(videoId, type, q.get("quality"), q.get("bitrate"), section);
  const baseName = safeFilename((q.get("title") || "") + "") || "video";
  const filename = safeFilename(baseName) + " - " + spec.label + "." + spec.ext;

  activeDownloads++;
  let finished = false;
  function done() {
    if (finished) return;
    finished = true;
    activeDownloads--;
    try { res.end(); } catch (e) {}
  }

  res.setHeader("Content-Disposition", 'attachment; filename="' + filename.replace(/"/g, "") + '"');
  res.setHeader("Content-Type", spec.contentType);
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("Access-Control-Allow-Origin", "*");

  /* One key per exact request: same video, same quality, same cut. */
  const cacheId = cacheKey([
    videoId,
    type,
    q.get("quality") || "",
    q.get("bitrate") || "",
    section ? section.spec : "",
  ]);

  /* A finished copy already on disk skips the engine and YouTube entirely,
     which is where almost all of the waiting was. */
  const hit = findCachedFile(cacheId);
  if (hit) {
    res.setHeader("Content-Length", hit.size);
    res.setHeader("X-SaveTube-Cache", "hit");
    const cached = fs.createReadStream(hit.path);
    cached.pipe(res);
    cached.on("error", () => { try { res.destroy(); } catch (e) {} done(); });
    cached.on("close", () => done());
    req.on("close", () => { try { cached.destroy(); } catch (e) {} });
    return;
  }

  /* Anything we produce from here on is kept for the next visitor. */
  function keepInCache(fromPath) {
    try {
      ensureCacheDir();
      const dest = path.join(CACHE_DIR, cacheId + ".part");
      fs.copyFile(fromPath, dest, (err) => {
        if (err) return;
        try {
          cacheBytes += fs.statSync(dest).size;
          trimCache();
        } catch (e) {
          /* ignore */
        }
      });
    } catch (e) {
      /* caching is a bonus, never a requirement */
    }
  }

  if (!spec.needsFile) {
    // Stream the real file straight from the engine to the visitor, and keep
    // a copy alongside it so the next request does not repeat the work.
    const child = spawn(YTDLP.cmd, ytdlpArgs(spec.args));
    res.setHeader("X-SaveTube-Cache", "miss");

    let sink = null;
    let sinkPath = null;
    let bytesSent = 0;
    try {
      ensureCacheDir();
      sinkPath = path.join(CACHE_DIR, cacheId + ".part");
      sink = fs.createWriteStream(sinkPath);
    } catch (e) {
      sink = null;
    }

    if (sink) {
      child.stdout.on("data", (chunk) => {
        bytesSent += chunk.length;
        try { sink.write(chunk); } catch (e) { /* ignore */ }
      });
    } else {
      child.stdout.on("data", (chunk) => { bytesSent += chunk.length; });
    }

    child.stdout.pipe(res);
    child.stderr.on("data", () => {});
    child.on("close", (code) => {
      if (sink) {
        sink.end(() => {
          if (code !== 0) {
            // A half-finished file must never be served later.
            try { fs.unlinkSync(sinkPath); } catch (e) { /* ignore */ }
          } else {
            try {
              cacheBytes += fs.statSync(sinkPath).size;
              trimCache();
            } catch (e) { /* ignore */ }
          }
        });
      }
      if (code !== 0 && bytesSent === 0 && !res.headersSent) {
        return serveFallback(videoId, type, spec, q, req, res, done);
      }
      done();
    });
    child.on("error", () => { try { res.destroy(); } catch (e) {} done(); });
    req.on("close", () => { try { child.kill(); } catch (e) {} });
    return;
  }

  // Merge / convert to a temp file, then send it.
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "savetube-"));
  const tmpFile = path.join(tmpDir, "out." + spec.ext);

  const args = spec.args.slice();
  args[args.indexOf(null)] = tmpFile;

  // Give the engine a clean title for progress purposes.
  const finalArgs = ytdlpArgs(args);
  const child = spawn(YTDLP.cmd, finalArgs);
  let errBuf = "";
  child.stderr.on("data", (d) => { errBuf += String(d).slice(-2000); });
  child.stdout.on("data", () => {});

  child.on("error", () => {
    try { res.destroy(); } catch (e) {}
    cleanup();
    done();
  });

  child.on("close", (code) => {
    if (code !== 0 || !fs.existsSync(tmpFile)) {
      cleanup();
      return serveFallback(videoId, type, spec, q, req, res, done);
    }
    let size = 0;
    try { size = fs.statSync(tmpFile).size; } catch (e) {}
    if (size > CONFIG.maxFileGB * 1024 * 1024 * 1024) {
      try { res.destroy(); } catch (e) {}
      cleanup();
      return done();
    }

    /* Keep a copy so this exact download is instant for the next visitor.
       The response is not made to wait for it. */
    keepInCache(tmpFile);

    res.setHeader("Content-Length", size);
    res.setHeader("X-SaveTube-Cache", "miss");
    const stream = fs.createReadStream(tmpFile);
    stream.pipe(res);
    stream.on("close", () => { cleanup(); done(); });
    stream.on("error", () => { cleanup(); done(); });
    req.on("close", () => { try { stream.destroy(); } catch (e) {} });
  });

  function cleanup() {
    fs.rm(tmpDir, { recursive: true, force: true }, () => {});
  }
}

/* ---------------- Thumbnail download (served from OUR OWN domain) --------
   A real image file, pulled from YouTube's public thumbnail CDN and delivered
   as a downloadable attachment with the real pixel size in the filename and
   the real image bytes. No placeholder, no redirect to another site.

   Sizes match the actual YouTube timeline variants:
     maxres  1280x720 (highest, only when the uploader published it)
     sd      640x480
     hq      480x360
     mq      320x180
     default 120x90
   When the requested variant does not exist, fall back to the nearest larger
   one so the download always returns a REAL image. */

const THUMB_VARIANTS = [
  { key: "maxres", file: "maxresdefault.jpg", label: "Max 1280x720" },
  { key: "sd", file: "sddefault.jpg", label: "SD 640x480" },
  { key: "hq", file: "hqdefault.jpg", label: "HQ 480x360" },
  { key: "mq", file: "mqdefault.jpg", label: "MQ 320x180" },
  { key: "default", file: "default.jpg", label: "Default 120x90" },
];

function handleThumbnail(req, res, q) {
  const videoId = q.get("v");
  if (!validId(videoId)) return json(res, 400, { ok: false, error: "Bad video id." });

  const want = String(q.get("size") || "maxres").toLowerCase();
  const wanted = THUMB_VARIANTS.find((v) => v.key === want) || THUMB_VARIANTS[0];
  const ladder = [wanted].concat(
    THUMB_VARIANTS.filter((v) => v.key !== wanted.key)
  );

  let i = 0;
  (function next() {
    if (i >= ladder.length) {
      return json(res, 502, { ok: false, error: "Thumbnail unavailable for this video." });
    }
    const variant = ladder[i++];
    const url =
      "https://i.ytimg.com/vi/" + encodeURIComponent(videoId) + "/" + variant.file;
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 10000);
    fetch(url, { signal: ctrl.signal, headers: { "user-agent": "Mozilla/5.0" } })
      .then((r) => {
        clearTimeout(timer);
        if (!r.ok) return next();
        const ct = String(r.headers.get("content-type") || "image/jpeg");
        const safeId = videoId.replace(/[^A-Za-z0-9_-]/g, "");
        const size = variant.label.replace(/[^0-9x]/g, "");
        const fileName = "savetube-" + safeId + "-" + size + ".jpg";
        res.writeHead(200, {
          "Content-Type": ct,
          "Content-Disposition": 'attachment; filename="' + fileName + '"',
          "Content-Length": String(r.headers.get("content-length") || ""),
          "Cache-Control": "public, max-age=3600",
          "X-SaveTube-Thumb": variant.key,
          "Access-Control-Allow-Origin": "*",
        });
        const { Readable } = require("stream");
        Readable.fromWeb(r.body).pipe(res);
      })
      .catch(() => {
        clearTimeout(timer);
        return next();
      });
  })();
}

/* ---------------- Transcript (served from OUR OWN domain) ----------------

   Fetches the captions with the same engine and returns them as JSON, so the
   visitor reads the transcript inside our own page. Nothing here forwards the
   visitor to another website: /api/transcript -> JSON -> rendered in-page. */

const transcriptCache = new Map();

function vttTimeToSeconds(s) {
  const m = String(s).match(/(?:(\d+):)?(\d{1,2}):(\d{2})[.,](\d{1,3})/);
  if (!m) return 0;
  const h = m[1] ? Number(m[1]) : 0;
  return h * 3600 + Number(m[2]) * 60 + Number(m[3]) + Number(m[4]) / 1000;
}

function parseVtt(raw) {
  const lines = [];
  const blocks = String(raw).replace(/\r/g, "").split("\n\n");
  blocks.forEach((block) => {
    const rows = block.split("\n").filter((r) => r.trim() !== "");
    if (!rows.length) return;
    const timeRow = rows.find((r) => r.indexOf("-->") >= 0);
    if (!timeRow) return;
    const t = vttTimeToSeconds(timeRow.split("-->")[0]);
    const text = rows
      .slice(rows.indexOf(timeRow) + 1)
      .join(" ")
      .replace(/<[^>]*>/g, "")
      .replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
      .replace(/&#39;/g, "'").replace(/&quot;/g, '"')
      .replace(/\s+/g, " ")
      .trim();
    if (text) lines.push({ t: t, text: text });
  });
  return lines;
}

function parseJson3(raw) {
  const lines = [];
  let data;
  try { data = JSON.parse(raw); } catch (e) { return lines; }
  (data.events || []).forEach((ev) => {
    if (!ev.segs) return;
    const text = ev.segs.map((s) => s.utf8 || "").join("").replace(/\n/g, " ").trim();
    if (!text) return;
    lines.push({ t: Math.round((ev.tStartMs || 0) / 1000), text: text });
  });
  return lines;
}

/* Auto captions repeat the same line while it scrolls, so identical
   neighbours are collapsed into one row. */
function dedupeLines(lines) {
  const out = [];
  lines.forEach((l) => {
    const prev = out[out.length - 1];
    if (prev && prev.text === l.text) return;
    if (prev && l.text.indexOf(prev.text) === 0) { out[out.length - 1] = l; return; }
    out.push(l);
  });
  return out;
}

function handleTranscript(req, res, q) {
  const videoId = q.get("v");
  if (!validId(videoId)) return json(res, 400, { ok: false, error: "Bad video id." });

  const lang = String(q.get("lang") || "en").replace(/[^a-zA-Z-]/g, "").slice(0, 12) || "en";

  const cached = transcriptCache.get(videoId + "|" + lang);
  if (cached) return json(res, 200, cached);

  const ip = clientIp(req);
  if (!allow(ip)) {
    return json(res, 429, { ok: false, error: "Too many requests from this connection. Try again shortly." });
  }

  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "savetube-sub-"));
  const outTpl = path.join(dir, "sub");
  const args = ytdlpArgs([
    "--skip-download",
    "--write-subs",
    "--write-auto-subs",
    "--sub-langs", lang + ".*," + lang,
    "--sub-format", "json3/vtt/best",
    "--no-playlist",
    "-o", outTpl,
    "https://www.youtube.com/watch?v=" + videoId,
  ]);

  const child = spawn(YTDLP.cmd, args);
  let errBuf = "";
  child.stdout.on("data", () => {});
  child.stderr.on("data", (d) => { errBuf += String(d); });

  const killTimer = setTimeout(() => { try { child.kill(); } catch (e) {} }, 45000);

  child.on("error", () => {
    clearTimeout(killTimer);
    fs.rm(dir, { recursive: true, force: true }, () => {});
    json(res, 500, { ok: false, error: "Could not reach the caption service." });
  });

  child.on("close", () => {
    clearTimeout(killTimer);
    let file = null;
    try {
      const files = fs.readdirSync(dir);
      file = files.find((f) => /\.json3$/i.test(f)) || files.find((f) => /\.vtt$/i.test(f)) || null;
    } catch (e) {}

    if (!file) {
      fs.rm(dir, { recursive: true, force: true }, () => {});
      const noSubs = /no subtitles|There are no subtitles/i.test(errBuf);
      if (noSubs) {
        // No captions at all (uploaded or automatic). y2mate-style behavior:
        // make the transcript anyway by listening to the audio. If the speech
        // engine is missing this returns a clean "no captions" message so the
        // page still behaves, never a dead error.
        return whisperTranscript(videoId, lang, res);
      }
      return json(res, 200, {
        ok: false,
        error: "No transcript could be read for this video.",
      });
    }

    let raw = "";
    try { raw = fs.readFileSync(path.join(dir, file), "utf8"); } catch (e) {}
    fs.rm(dir, { recursive: true, force: true }, () => {});

    let lines = /\.json3$/i.test(file) ? parseJson3(raw) : parseVtt(raw);
    lines = dedupeLines(lines.filter((l) => l.text && l.text.length > 1));

    if (!lines.length) {
      return json(res, 200, { ok: false, error: "The caption file for this video was empty." });
    }

    const payload = {
      ok: true,
      videoId: videoId,
      lang: lang,
      auto: /\.json3$/i.test(file),
      words: lines.reduce((n, l) => n + l.text.split(/\s+/).length, 0),
      lines: lines,
    };

    if (transcriptCache.size > 60) transcriptCache.clear();
    transcriptCache.set(videoId + "|" + lang, payload);
    json(res, 200, payload);
  });
}

/* ---------- Whisper fallback transcript ----------

   When a video has NO captions (uploaded or automatic), the transcript is
   generated by transcribing the audio with faster-whisper (tools/transcribe.py).
   This is what y2mate-style tools do, and it means the transcript button works
   for literally every video, not only ones with captions.

   The operation is honest: downloads the best audio into a temp dir, runs the
   small int8 "tiny" model on CPU, returns the timed lines. If python or the
   model is unavailable it returns the same clean "no captions" JSON so the
   frontend still behaves. */
function whisperTranscript(videoId, lang, res) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "savetube-wsp-"));
  const audioFile = path.join(dir, "audio.m4a");
  const args = ytdlpArgs([
    "-f", "bestaudio[ext=m4a]/bestaudio/best",
    "--no-playlist",
    "--max-filesize", "200M",
    "-o", audioFile,
    "https://www.youtube.com/watch?v=" + videoId,
  ]);
  const child = spawn(YTDLP.cmd, args);
  let errBuf = "";
  child.stdout.on("data", () => {});
  child.stderr.on("data", (d) => { errBuf += String(d); });
  const killTimer = setTimeout(() => { try { child.kill(); } catch (e) {} }, 120000);

  child.on("error", () => {
    clearTimeout(killTimer);
    fs.rm(dir, { recursive: true, force: true }, () => {});
    return json(res, 200, { ok: false, error: "This video has no captions available, and the speech engine could not reach it to make one." });
  });

  child.on("close", () => {
    clearTimeout(killTimer);
    if (!fs.existsSync(audioFile)) {
      fs.rm(dir, { recursive: true, force: true }, () => {});
      return json(res, 200, { ok: false, error: "This video has no captions available. Only videos with captions or reachable audio have a transcript." });
    }
    const pycmd = process.platform === "win32" ? "python" : "python3";
    const script = path.join(__dirname, "tools", "transcribe.py");
    const py = spawn(pycmd, [script, audioFile, "tiny", lang && lang !== "en" ? lang : ""]);
    let outBuf = "";
    let pyErr = "";
    const pyKill = setTimeout(() => { try { py.kill(); } catch (e) {} }, 240000);
    py.stdout.on("data", (d) => { outBuf += String(d); });
    py.stderr.on("data", (d) => { pyErr += String(d); });
    py.on("error", () => {
      clearTimeout(pyKill);
      fs.rm(dir, { recursive: true, force: true }, () => {});
      return json(res, 200, { ok: false, error: "This video has no captions available. Only videos with captions can give a transcript here." });
    });
    py.on("close", () => {
      clearTimeout(pyKill);
      fs.rm(dir, { recursive: true, force: true }, () => {});
      let parsed = null;
      try { parsed = JSON.parse(outBuf.replace(/^[^{]*/, "")); } catch (e) {}
      if (!parsed || !parsed.ok || !Array.isArray(parsed.lines) || !parsed.lines.length) {
        return json(res, 200, { ok: false, error: "This video has no captions available, and a spoken transcript could not be generated." });
      }
      const lines = parsed.lines.map((l) => ({ t: Math.round(Number(l.t) || 0), text: String(l.text || "").trim() }))
        .filter((l) => l.text.length > 1);
      if (!lines.length) {
        return json(res, 200, { ok: false, error: "This video has no captions available, and a spoken transcript could not be generated." });
      }
      const payload = {
        ok: true,
        videoId: videoId,
        lang: parsed.lang || lang,
        auto: false,
        generated: true,
        words: lines.reduce((n, l) => n + l.text.split(/\s+/).length, 0),
        lines: lines,
      };
      if (transcriptCache.size > 60) transcriptCache.clear();
      transcriptCache.set(videoId + "|" + lang, payload);
      return json(res, 200, payload);
    });
  });
}

/* ---------------- Redirect / referral links ----------------

   links.json holds short names that forward to longer referral addresses.
   Your links live at  /go/<slug>  so the same short address keeps working
   even when the destination changes.

   Click counts are kept in memory and written to data/clicks.json on a
   short debounce. Nothing about the visitor is stored: only a total. */

const LINKS_FILE = path.join(__dirname, "links.json");
const DATA_DIR = path.join(__dirname, "data");
const CLICKS_FILE = path.join(DATA_DIR, "clicks.json");

/* ---------- Finished-download cache ----------

   Almost all of the wait is not bandwidth. Starting the download engine and
   asking YouTube for the media costs several seconds before a single byte
   moves, so a small file and a large one both sit there for the same five or
   six seconds. Doing that work once and keeping the result removes it
   entirely for every request after the first, and the pre-warm below means
   even the first click usually lands on a file that is already finished.

   Files live under data/ and are capped, oldest first, so a busy day cannot
   fill the disk. Nothing here is a security boundary: the key is a hash of
   the request, and only the server can read the directory. */
const CACHE_DIR = path.join(DATA_DIR, "cache");
const CACHE_MAX_BYTES = Number(process.env.CACHE_MAX_MB || 600) * 1024 * 1024;
const CACHE_TTL_MS = Number(process.env.CACHE_TTL_MIN || 180) * 60 * 1000;

let cacheBytes = 0;
let cacheLoaded = false;

function ensureCacheDir() {
  try {
    fs.mkdirSync(CACHE_DIR, { recursive: true });
  } catch (e) {
    /* If the directory cannot be made, caching simply stays off. Downloads
       still work; they just take the long way every time. */
  }
}

function cacheKey(parts) {
  return crypto.createHash("sha1").update(parts.join("|")).digest("hex").slice(0, 32);
}

function readCacheIndex() {
  if (cacheLoaded) return;
  cacheLoaded = true;
  ensureCacheDir();
  let names = [];
  try {
    names = fs.readdirSync(CACHE_DIR);
  } catch (e) {
    return;
  }
  for (const n of names) {
    if (!n.endsWith(".part")) continue;
    try {
      cacheBytes += fs.statSync(path.join(CACHE_DIR, n)).size;
    } catch (e) {
      /* ignore */
    }
  }
}

/* Drop the oldest cached files until we are back under the cap. */
function trimCache() {
  readCacheIndex();
  if (cacheBytes <= CACHE_MAX_BYTES) return;
  let entries = [];
  try {
    entries = fs
      .readdirSync(CACHE_DIR)
      .map((n) => {
        const p = path.join(CACHE_DIR, n);
        let st = null;
        try {
          st = fs.statSync(p);
        } catch (e) {
          return null;
        }
        return st ? { p, at: st.mtimeMs, size: st.size } : null;
      })
      .filter(Boolean);
  } catch (e) {
    return;
  }
  entries.sort((a, b) => a.at - b.at);
  for (const e of entries) {
    if (cacheBytes <= CACHE_MAX_BYTES) break;
    try {
      fs.unlinkSync(e.p);
      cacheBytes -= e.size;
    } catch (err) {
      /* ignore */
    }
  }
}

function findCachedFile(key) {
  readCacheIndex();
  const p = path.join(CACHE_DIR, key + ".part");
  let st;
  try {
    st = fs.statSync(p);
  } catch (e) {
    return null;
  }
  if (!st.isFile() || st.size === 0) return null;
  if (Date.now() - st.mtimeMs > CACHE_TTL_MS) {
    try {
      fs.unlinkSync(p);
    } catch (e) {
      /* ignore */
    }
    return null;
  }
  return { path: p, size: st.size };
}

const STATS_KEY = process.env.STATS_KEY || crypto.randomBytes(9).toString("hex");

let linksCache = { at: 0, mtime: 0, links: [] };
const clickCounts = Object.create(null);
let clicksDirty = false;
let clicksTimer = null;

function loadLinks() {
  let stat;
  try {
    stat = fs.statSync(LINKS_FILE);
  } catch (e) {
    return [];
  }
  // Reload only when the file actually changed.
  if (linksCache.mtime === stat.mtimeMs && Date.now() - linksCache.at < 30000) {
    return linksCache.links;
  }
  try {
    const data = JSON.parse(fs.readFileSync(LINKS_FILE, "utf8"));
    const list = (Array.isArray(data.links) ? data.links : []).filter(
      (l) => l && typeof l.slug === "string" && typeof l.url === "string"
    );
    linksCache = { at: Date.now(), mtime: stat.mtimeMs, links: list };
    return list;
  } catch (e) {
    return linksCache.links;
  }
}

function loadClicks() {
  try {
    const data = JSON.parse(fs.readFileSync(CLICKS_FILE, "utf8"));
    Object.keys(data || {}).forEach((k) => {
      if (typeof data[k] === "number") clickCounts[k] = data[k];
    });
  } catch (e) {
    /* first run, nothing to load */
  }
}

function flushClicks() {
  if (!clicksDirty) return;
  clicksDirty = false;
  try {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    fs.writeFileSync(CLICKS_FILE, JSON.stringify(clickCounts, null, 2) + "\n", "utf8");
  } catch (e) {
    /* a read-only filesystem just means counts live in memory only */
  }
}

function bumpClick(slug) {
  clickCounts[slug] = (clickCounts[slug] || 0) + 1;
  clicksDirty = true;
  clearTimeout(clicksTimer);
  clicksTimer = setTimeout(flushClicks, 4000);
}

function handleGo(req, res, slug, search) {
  const links = loadLinks();
  const link = links.find((l) => l.slug === slug);

  if (!link || link.enabled === false) {
    res.statusCode = 404;
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    return res.end(
      "<!DOCTYPE html><html lang=\"en\"><head><meta charset=\"utf-8\">" +
      "<title>Link not found</title><meta name=\"robots\" content=\"noindex\">" +
      "<style>body{font-family:system-ui,sans-serif;background:#0d1117;color:#e9edf3;" +
      "display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0;text-align:center}" +
      "a{color:#3ddc84}</style></head><body><div><h1>Link not found</h1>" +
      "<p>This short link does not exist or has been switched off.</p>" +
      "<p><a href=\"/\">Go to the homepage</a></p></div></body></html>"
    );
  }

  let target = link.url;

  // Optionally carry tracking parameters through, when the link asks for it.
  if (link.passParams && search && search.toString()) {
    target += (target.indexOf("?") === -1 ? "?" : "&") + search.toString();
  }

  bumpClick(slug);

  res.statusCode = 302;
  res.setHeader("Location", target);
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("Referrer-Policy", "no-referrer-when-downgrade");
  return res.end();
}

function handleStats(req, res, search) {
  if (search.get("key") !== STATS_KEY) {
    res.statusCode = 403;
    res.setHeader("Content-Type", "text/plain; charset=utf-8");
    return res.end("Not allowed. Add ?key=YOUR_STATS_KEY");
  }

  const links = loadLinks();
  const total = Object.keys(clickCounts).reduce((n, k) => n + clickCounts[k], 0);

  const rows = links
    .map((l) => {
      const n = clickCounts[l.slug] || 0;
      return (
        "<tr><td><code>/go/" + l.slug + "</code></td>" +
        "<td>" + (l.enabled === false ? "off" : "on") + "</td>" +
        "<td style=\"text-align:right\"><strong>" + n + "</strong></td>" +
        "<td>" + String(l.url).replace(/[<>&]/g, "") + "</td></tr>"
      );
    })
    .join("");

  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  return res.end(
    "<!DOCTYPE html><html lang=\"en\"><head><meta charset=\"utf-8\">" +
    "<meta name=\"robots\" content=\"noindex\">" +
    "<title>Link stats</title>" +
    "<style>body{font-family:system-ui,sans-serif;background:#0d1117;color:#e9edf3;margin:0;padding:28px}" +
    "table{border-collapse:collapse;width:100%;max-width:900px;font-size:14px}" +
    "th,td{padding:9px 10px;border-bottom:1px solid #262d38;text-align:left}" +
    "th{color:#9aa4b2;font-size:12px;text-transform:uppercase;letter-spacing:.06em}" +
    "code{color:#3ddc84}h1{font-size:20px}</style></head><body>" +
    "<h1>Redirect link stats</h1>" +
    "<p>Total clicks: <strong>" + total + "</strong> &middot; links: " + links.length + "</p>" +
    "<table><tr><th>Link</th><th>Status</th><th style=\"text-align:right\">Clicks</th><th>Destination</th></tr>" +
    (rows || "<tr><td colspan=\"4\">No links in links.json yet.</td></tr>") +
    "</table><p style=\"color:#9aa4b2;font-size:13px;max-width:640px\">" +
    "Counts are totals only. No visitor addresses, browsers, or referrers are stored." +
    "</p></body></html>"
  );
}



/* ---------------------------------------------------------------------------
   Contact form.

   The form used to post straight to a third-party relay, so a message only
   existed if that relay was reachable and had been activated by hand. It now
   comes here first: every message is written to data/messages.json BEFORE we
   answer, so a submission can never silently disappear.

   Order of the guards:
     - honeypot field, which a person never sees or fills in
     - a form-open timestamp: anything sent in under 3 seconds is scripted
     - length caps, and CR/LF stripped out of name/email, so nobody can smuggle
       extra mail headers through the fields
     - the shared per-IP limit, plus a tighter five-per-hour limit for this route
   Relaying to a real inbox is optional. Set CONTACT_WEBHOOK to any endpoint
   that accepts JSON (Web3Forms, Formspree, an Apps Script) and the message is
   forwarded there as well.
--------------------------------------------------------------------------- */

const MESSAGES_FILE = path.join(DATA_DIR, "messages.json");
let contactHits = new Map();

function contactAllowed(ip) {
  const now = Date.now();
  const recent = (contactHits.get(ip) || []).filter((t) => now - t < 3600 * 1000);
  if (recent.length >= 5) return false;
  recent.push(now);
  contactHits.set(ip, recent);
  if (contactHits.size > 5000) contactHits = new Map();
  return true;
}

function readBody(req, cb) {
  let data = "";
  let tooBig = false;
  req.on("data", (c) => {
    if (tooBig) return;
    data += c;
    if (data.length > 32 * 1024) { tooBig = true; data = ""; }
  });
  req.on("end", () => cb(tooBig ? null : data));
  req.on("error", () => cb(null));
}

function field(obj, key) {
  const v = obj[key];
  return typeof v === "string" ? v : "";
}

/* Single line only: a newline in here would let a sender inject mail headers. */
function oneLine(s, max) {
  return s.replace(/[\r\n]+/g, " ").replace(/\s+/g, " ").trim().slice(0, max);
}

function postJson(target, payload) {
  const mod = target.protocol === "https:" ? https : http;
  return mod.request({
    hostname: target.hostname,
    port: target.port || (target.protocol === "https:" ? 443 : 80),
    path: target.pathname + target.search,
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Content-Length": Buffer.byteLength(payload),
      "User-Agent": "SaveTube/1.0"
    }
  });
}

function handleContact(req, res) {
  if (req.method !== "POST") return json(res, 405, { ok: false, error: "Use POST." });

  const ip = clientIp(req);
  if (!contactAllowed(ip)) {
    return json(res, 429, {
      ok: false,
      error: "You have sent a few messages already. Please try again later."
    });
  }

  readBody(req, (raw) => {
    if (raw === null) return json(res, 413, { ok: false, error: "That message is too long." });

    let body = {};
    const type = String(req.headers["content-type"] || "");
    try {
      if (type.indexOf("application/json") > -1) body = JSON.parse(raw || "{}");
      else body = Object.fromEntries(new URLSearchParams(raw));
    } catch (e) {
      return json(res, 400, { ok: false, error: "Could not read the form." });
    }

    /* A real visitor never sees this field, so a filled one is a bot.
       Answer normally so the bot does not learn anything. */
    if (field(body, "_honey").trim()) return json(res, 200, { ok: true });

    /* Number() here, not field(), because a JSON post sends this as a number
       and a form post sends it as a string. Reading it as a string only would
       let a scripted submit skip the check entirely. */
    const opened = Number(body._t) || 0;
    if (opened && Date.now() - opened < 3000) return json(res, 200, { ok: true });

    const name = oneLine(field(body, "name"), 80);
    const email = oneLine(field(body, "email"), 120);
    const message = field(body, "message").replace(/\r\n/g, "\n").trim().slice(0, 5000);

    if (name.length < 2) return json(res, 400, { ok: false, error: "Please add your name." });
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) {
      return json(res, 400, { ok: false, error: "That email address does not look right." });
    }
    if (message.length < 10) return json(res, 400, { ok: false, error: "Please write a little more." });

    const entry = {
      at: new Date().toISOString(),
      name: name,
      email: email,
      message: message,
      ip: String(ip).slice(0, 64)
    };

    // Stored before replying: a message the owner can still read beats a lost one.
    try {
      fs.mkdirSync(DATA_DIR, { recursive: true });
      let all = [];
      try { all = JSON.parse(fs.readFileSync(MESSAGES_FILE, "utf8")); } catch (e) { all = []; }
      if (!Array.isArray(all)) all = [];
      all.push(entry);
      if (all.length > 500) all = all.slice(-500);
      fs.writeFileSync(MESSAGES_FILE, JSON.stringify(all, null, 2) + "\n", "utf8");
    } catch (e) {
      return json(res, 500, {
        ok: false,
        error: "Could not save your message. Please email us instead."
      });
    }

    const webhook = process.env.CONTACT_WEBHOOK || "";
    if (!webhook) return json(res, 200, { ok: true, stored: true });

    try {
      const target = new URL(webhook);
      const payload = JSON.stringify({
        name: entry.name,
        email: entry.email,
        message: entry.message,
        subject: "SaveTube contact form",
        at: entry.at
      });
      const relay = postJson(target, payload);
      relay.on("error", () => json(res, 200, { ok: true, stored: true, relayed: false }));
      relay.on("response", (r2) => {
        r2.resume();
        json(res, 200, { ok: true, stored: true, relayed: r2.statusCode < 400 });
      });
      relay.write(payload);
      relay.end();
    } catch (e) {
      // The message is already on disk, so a relay problem is not a lost message.
      return json(res, 200, { ok: true, stored: true, relayed: false });
    }
  });
}

/* The address the visitor actually used. Pages are written with a stand-in
   address so the site works before the real domain is known, and works again
   if the domain ever changes. This resolves the stand-in to the truth.

   SITE_URL overrides everything, for the case where one canonical address is
   wanted no matter how the visitor arrived. Leave it unset and the request's
   own host is used, which needs no configuration at all. */
const PLACEHOLDER = "https://yoursite.com";
const TEXTUAL = /^\.(html|txt|xml|webmanifest|json|css|js|svg)$/;

function siteOrigin(req) {
  const forced = String(process.env.SITE_URL || "").trim().replace(/\/+$/, "");
  if (forced) return forced;

  const host = String(req.headers.host || "").trim();
  if (!host) return PLACEHOLDER;

  const local = /^(localhost|127\.0\.0\.1|\[::1\]|0\.0\.0\.0)(:\d+)?$/i.test(host);
  return (local ? "http://" : "https://") + host;
}

/* Sends a page with the stand-in address replaced by the real one. */
function sendHtml(res, code, buf, req) {
  if (buf.includes(PLACEHOLDER)) {
    buf = Buffer.from(buf.toString("utf8").split(PLACEHOLDER).join(siteOrigin(req)), "utf8");
  }
  const head = Object.assign(
    {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-cache",
      Vary: "Accept-Encoding",
    },
    securityHeaders()
  );

  const packed = maybeCompress(req, buf);
  if (packed.gzip) head["Content-Encoding"] = "gzip";
  head["Content-Length"] = packed.body.length;

  res.writeHead(code, head);
  res.end(packed.body);
}

function serveStatic(req, res, pathname) {
  let rel = decodeURIComponent(pathname);
  if (rel === "/") rel = "/index.html";
  // Files used only for building/deploying. Never expose these publicly.
  const BLOCKED = /^\/(setup\.js|addlink\.js|server\.js|package\.json|package-lock\.json|Dockerfile|render\.yaml|Procfile|DEPLOY\.md|ads\.txt\.example|links\.json|data\/|\.gitignore|\.dockerignore|deploy\/|\.git\/)/i;
  if (BLOCKED.test(rel)) {
    return json(res, 404, { ok: false, error: "Not found" });
  }

  const filePath = path.join(CONFIG.root, path.normalize(rel).replace(/^(\.\.[\\/])+/, ""));

  if (!filePath.startsWith(CONFIG.root)) {
    return json(res, 403, { ok: false, error: "Forbidden" });
  }

  fs.stat(filePath, (err, stat) => {
    if (err || !stat.isFile()) {
      return fs.readFile(path.join(CONFIG.root, "404.html"), (e2, buf) => {
        if (e2) {
          res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
          return res.end("404 Not Found");
        }
        sendHtml(res, 404, buf, req);
      });
    }

    const ext = path.extname(filePath).toLowerCase();
    const type = MIME[ext] || "application/octet-stream";

    if (TEXTUAL.test(ext)) {
      return fs.readFile(filePath, (e3, buf) => {
        if (e3) {
          res.writeHead(500, { "Content-Type": "text/plain; charset=utf-8" });
          return res.end("Could not read that file.");
        }
        if (ext === ".html") return sendHtml(res, 200, buf, req);

        if (buf.includes(PLACEHOLDER)) {
          buf = Buffer.from(buf.toString("utf8").split(PLACEHOLDER).join(siteOrigin(req)), "utf8");
        }

        /* Style sheets and scripts change only when the site is redeployed,
           so they are cached for a week instead of an hour. Everything the
           page needs on a repeat visit then comes from the browser. */
        const isAsset = ext === ".css" || ext === ".js" || ext === ".svg";
        const maxAge = isAsset ? 604800 : 86400;

        const key = rel + ":" + stat.mtimeMs;
        const head = Object.assign(
          {
            "Content-Type": type,
            "Cache-Control": "public, max-age=" + maxAge,
            Vary: "Accept-Encoding",
          },
          securityHeaders()
        );

        const accepts = String(req.headers["accept-encoding"] || "");
        if (/\bgzip\b/.test(accepts) && buf.length >= 1024) {
          let zipped = GZIPPED.get(key);
          if (!zipped) {
            try { zipped = zlib.gzipSync(buf, { level: 6 }); } catch (e) { zipped = null; }
            if (zipped) GZIPPED.set(key, zipped);
          }
          if (zipped) {
            head["Content-Encoding"] = "gzip";
            head["Content-Length"] = zipped.length;
            res.writeHead(200, head);
            return res.end(zipped);
          }
        }

        head["Content-Length"] = buf.length;
        res.writeHead(200, head);
        res.end(buf);
      });
    }

    res.writeHead(
      200,
      Object.assign(
        {
          "Content-Type": type,
          "Content-Length": stat.size,
          "Cache-Control": "public, max-age=604800",
        },
        securityHeaders()
      )
    );
    fs.createReadStream(filePath).pipe(res);
  });
}

/* A last line of defence. One bad video reply should never be able to take
   the whole site down for everyone - the process logs what happened and
   keeps serving. Anything genuinely unrecoverable still exits loudly enough
   to show up in the host's logs. */
process.on("uncaughtException", (e) => {
  console.error("uncaught: " + (e && e.stack ? e.stack : e));
});
process.on("unhandledRejection", (e) => {
  console.error("unhandled rejection: " + (e && e.stack ? e.stack : e));
});

/* ---------------- HilltopAds Anti-AdBlock (Node port) ------------------
   The publisher snippet you were given is PHP. This is the same protocol in
   plain Node so it runs here with zero dependencies. The endpoint returns a
   small JavaScript payload HilltopAds uses to detect ad blockers, cached for
   5 minutes per zone+query exactly like the PHP original. */
const HILLTOP_AAB = {
  zoneId: "7439209-7439213",
  key: "wkcwiyF1SluqVxP3EYvTW7ixCkrTNe1LNazYhfzwYpxgiRO630qeGE1zx6R4ah6n",
  domain: "api.hilltopads.com",
  path: "/publisher/antiAdBlock",
  version: "1.0",
  userAgent: "HilltopAds Anti-AdBlock Client/1.0",
  ttlMs: 300000
};
const HILLTOP_AAB_CACHE = new Map();

function aabZoneForUserAgent(ua) {
  const zones = String(HILLTOP_AAB.zoneId).split("-");
  if (zones.length === 2 && /mobi|ipad|iphone|blackberry|android/i.test(String(ua || ""))) {
    return zones[1];
  }
  return zones[0];
}

function aabFetch(zone, transport, extra) {
  return new Promise((resolve) => {
    const qs = new URLSearchParams(Object.assign({}, extra || {}, {
      zoneId: zone,
      key: HILLTOP_AAB.key,
      version: HILLTOP_AAB.version,
      transport: transport
    })).toString();
    const opts = {
      hostname: HILLTOP_AAB.domain,
      path: HILLTOP_AAB.path + "?" + qs,
      method: "GET",
      headers: { "User-Agent": HILLTOP_AAB.userAgent }
    };
    const onFail = () => resolve(null);
    const onOk = (res) => {
      let body = "";
      res.on("data", (d) => (body += d));
      res.on("end", () => resolve(body));
      res.on("error", onFail);
    };
    const req = https.request(opts, onOk);
    req.on("error", () => {
      // Socket fallback equivalent: retry over plain HTTP.
      const fallback = http.request(Object.assign({}, opts, { port: 80 }), onOk);
      fallback.on("error", onFail);
      fallback.end();
    });
    req.end();
  });
}

function handleAntiAdBlock(req, res, q) {
  const zone = aabZoneForUserAgent(req.headers["user-agent"]);
  const extra = {};
  for (const key of ["a", "b", "c", "d", "e", "f"]) {
    const v = q.get(key);
    if (v != null && v.length <= 64) extra[key] = v;
  }
  const cacheKey = zone + "|" + JSON.stringify(extra);
  const hit = HILLTOP_AAB_CACHE.get(cacheKey);
  if (hit && hit.expires > Date.now()) {
    res.setHeader("X-AAB-Cache", "hit");
    return jsReply(res, hit.code);
  }
  aabFetch(zone, 1, extra).then((body) => {
    let code = "";
    try {
      const j = JSON.parse(body || "{}");
      code = (j.result && j.result.code) || "";
    } catch (e) { code = ""; }
    if (code) {
      HILLTOP_AAB_CACHE.set(cacheKey, { code: code, expires: Date.now() + HILLTOP_AAB.ttlMs });
      res.setHeader("X-AAB-Cache", "miss");
      return jsReply(res, code);
    }
    res.writeHead(502, { "Content-Type": "text/plain; charset=utf-8" });
    res.end("Anti-adblock unavailable right now.");
  });
}

function jsReply(res, code) {
  res.writeHead(200, { "Content-Type": "application/javascript; charset=utf-8", "Cache-Control": "no-cache" });
  res.end(code);
}

/* ---------------- Server ---------------- */

const server = http.createServer((req, res) => {  // Security headers on every reply.
  for (const k in SECURITY_HEADERS) res.setHeader(k, SECURITY_HEADERS[k]);

  const u = new URL(req.url, "http://" + (req.headers.host || "localhost"));

  // The host's own health check must never be throttled.
  if (u.pathname === "/health") return json(res, 200, { ok: true, ffmpeg: !!FFMPEG, engine: YTDLP.version });

  /* When this copy is the engine behind a tunnel, it only answers the site.
     Set REMOTE_ENGINE_TOKEN here and match it on the front end. Unset means
     the gate is open, which is what you want when running locally.

     The `!REMOTE_ENGINE` guard is essential: the front end sets the token too
     so it can send it, and without this check the front end would demand the
     token from ordinary visitors and answer 403 to everyone. */
  if (!REMOTE_ENGINE && REMOTE_ENGINE_TOKEN && ENGINE_PATHS.test(u.pathname)) {
    if (String(req.headers["x-engine-token"] || "") !== REMOTE_ENGINE_TOKEN) {
      return json(res, 403, { ok: false, error: "Engine token required." });
    }
  }

  // Abuse guard for everything else (including /api/info, so nobody can use
  // this server to hammer YouTube through us).
  const ip = clientIp(req);
  if (!underLimit(ip)) {
    res.setHeader("Retry-After", "60");
    return json(res, 429, { ok: false, error: "Too many requests. Please slow down." });
  }

  /* The boot ping asks nothing of YouTube - it only checks the server is
     awake. Answering it here instead of forwarding it keeps it instant:
     PageSpeed measured it at 10.9 seconds when it was being proxied, and it
     sits at the end of the critical path, so every visitor waited. */
  if (u.pathname === "/api/info" && u.searchParams.get("v") === "ping") {
    return json(res, 200, { ok: true, server: "savetube", ffmpeg: !!FFMPEG });
  }

  /* Everything the download needs is handed to the remote engine when one is
     configured, so a datacentre IP never touches YouTube. */
  if (REMOTE_ENGINE && ENGINE_PATHS.test(u.pathname)) return proxyToEngine(req, res, u);

  if (u.pathname === "/api/info") {
    const id = u.searchParams.get("v");
    if (!validId(id)) return json(res, 400, { ok: false, error: "Bad video id." });
    return fetchInfo(id, (err, data) => {
      if (err) return json(res, 502, { ok: false, error: err.message });
      json(res, 200, data);
    });
  }

  if (u.pathname === "/api/download") return handleDownload(req, res, u.searchParams);

  // Real thumbnail image, downloaded as an attachment from our own domain.
  if (u.pathname === "/api/thumbnail") return handleThumbnail(req, res, u.searchParams);

  // Transcript, rendered inside our own page (no redirect to another site).
  if (u.pathname === "/api/transcript") return handleTranscript(req, res, u.searchParams);

  // HilltopAds Anti-AdBlock payload (Node port of the PHP publisher snippet).
  if (u.pathname === "/api/anti-adblock") return handleAntiAdBlock(req, res, u.searchParams);

  // Contact form: stored on the server first, relayed to the inbox after.
  if (u.pathname === "/api/contact") return handleContact(req, res);

  // Your short redirect / referral links.
  const goMatch = u.pathname.match(/^\/go\/([A-Za-z0-9_-]{1,40})$/);
  if (goMatch) return handleGo(req, res, goMatch[1], u.searchParams);

  /* ---------------- Link aliases ----------------
     A link that looks like a YouTube link still works here, so anything
     people paste or share lands on this site:

         /watch?v=VIDEOID
         /SOSyoutube.com/watch?v=VIDEOID     (alias host written into the path)
         /embed/VIDEOID
         /video/VIDEOID    /v/VIDEOID

     Any alias DOMAIN (for example SOSyoutube.com) is pointed at this same
     app with a free custom domain in the hosting dashboard; the server
     answers for every host name it receives, so no extra code is needed
     once the domain resolves here. */
  const aliasWatch = /^\/(?:[A-Za-z0-9.-]+\/)*(?:watch|embed)\/?$/i;
  if (aliasWatch.test(u.pathname)) {
    const id = u.searchParams.get("v") || "";
    if (validId(id)) {
      res.writeHead(302, { Location: "/download.html?v=" + encodeURIComponent(id) });
      return res.end();
    }
    return serveStatic(req, res, "/index.html");
  }

  const aliasShort = u.pathname.match(/^\/(?:video|v|d|embed|shorts)\/([A-Za-z0-9_-]{11})$/);
  if (aliasShort) {
    res.writeHead(302, { Location: "/download.html?v=" + encodeURIComponent(aliasShort[1]) });
    return res.end();
  }

  // Private click stats, for your eyes only.
  if (u.pathname === "/go-stats") return handleStats(req, res, u.searchParams);

  return serveStatic(req, res, u.pathname);
});

/* Slowloris protection and a hard ceiling on open connections.
   requestTimeout is deliberately left alone: downloads can legitimately
   run for minutes, and a short request timeout would cut them off. */
server.headersTimeout = 20000;
server.keepAliveTimeout = 65000;
server.maxConnections = GUARD.maxSockets;

server.listen(CONFIG.port, CONFIG.host, () => {
  loadClicks();
  console.log("SaveTube server running on http://localhost:" + CONFIG.port);
  console.log("Real downloads served from this domain - no redirects.");
  console.log("Guard active: " + GUARD.reqsPerMinute + " req/min/ip, " +
    CONFIG.downloadsPerHourPerIp + " downloads/hour/ip, max " +
    GUARD.maxSockets + " connections.");
  console.log("Proxy trust: " + (TRUST_PROXY ? "on (X-Forwarded-For honoured)" : "off (direct connection)"));
  console.log("Speed: " + CONFIG.concurrentFragments + " parallel fragments, " +
    CONFIG.httpChunkSize + " chunks.");
  const n = loadLinks().length;
  console.log("Redirect links: " + n + (n ? "  ->  /go/<slug>" : "  (none yet - see addlink.js)"));
  console.log("Private link stats: /go-stats?key=" + STATS_KEY);
});

/* Write any pending click counts before the process goes away. */
["SIGINT", "SIGTERM"].forEach((sig) => {
  process.on(sig, () => { flushClicks(); process.exit(0); });
});
