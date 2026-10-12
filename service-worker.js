/* SaveTube service worker.
   Its one job is to make this site open when there is no connection, which is
   what the offline arcade depends on. A visitor who has loaded SaveTube once
   and then loses signal can still open the app shell and play.

   Two rules shape everything here:

     1. Never cache a request the user made deliberately for a fresh answer.
        A video lookup must always hit the network when the network is there,
        because a stale "could not read that link" is worse than a slow one.

     2. Navigation requests are network-first with a cached fallback. The
        visitor always gets the live page when there is signal, and something
        real rather than the browser's dinosaur when there is not. */

const VERSION = "savetube-v3";
const SHELL = [
  "/",
  "/offline.html",
  "/snake.html",
  "/index.html",
  "/css/styles.css",
  "/css/glass.css",
  "/css/motion.css",
  "/css/premium.css",
  "/css/style.css",
  "/js/app.js",
  "/js/config.js",
  "/js/ads-policy.js",
  "/js/theme.js",
  "/js/vibe.js",
  "/js/motion.js",
  "/js/liquidglass/container.js",
  "/img/platforms/youtube.svg",
  "/img/platforms/tiktok.svg",
  "/img/platforms/instagram.svg",
  "/img/platforms/x.svg",
  "/img/platforms/facebook.svg",
  "/img/platforms/reddit.svg",
  "/img/platforms/vimeo.svg",
  "/img/platforms/soundcloud.svg",
  "/img/platforms/pinterest.svg",
  "/img/platforms/twitch.svg",
  "/img/platforms/bilibili.svg",
  "/img/platforms/dailymotion.svg",
  "/icon-192.png",
  "/icon-512.png",
  "/apple-touch-icon.png",
  "/favicon.svg",
  "/manifest.webmanifest",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(VERSION).then((cache) =>
      /* addAll fails the whole install if any single entry 404s, so each file
         is added on its own. One missing asset must not leave the visitor
         with no cache at all. */
      Promise.all(SHELL.map((url) => cache.add(url).catch(() => null)))
    ).then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;

  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  /* Anything that asks the server to do work on a link is never served from
     cache. Getting a real answer matters more than being fast, and a cached
     error here would look like the tool is broken. */
  if (url.pathname.startsWith("/api/") || url.pathname.startsWith("/go/")) return;
  if (req.headers.get("accept") && req.headers.get("accept").includes("video")) return;
  if (url.pathname === "/sitemap.xml" || url.pathname === "/health") return;

  /* Page loads: try the network first so the visitor sees the live site, and
     fall back to the cached copy when there is nothing to reach. */
  if (req.mode === "navigate" || req.destination === "document") {
    event.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone();
          caches.open(VERSION).then((c) => c.put(req, copy)).catch(() => {});
          return res;
        })
        .catch(() => caches.match(req).then((hit) => hit || caches.match("/index.html")))
    );
    return;
  }

  /* Everything else - css, js, images - is served from cache and refreshed in
     the background, because those files only change when the site is
     redeployed. */
  event.respondWith(
    caches.match(req).then((hit) => {
      const net = fetch(req)
        .then((res) => {
          if (res && res.status === 200) {
            const copy = res.clone();
            caches.open(VERSION).then((c) => c.put(req, copy)).catch(() => {});
          }
          return res;
        })
        .catch(() => hit);
      return hit || net;
    })
  );
});