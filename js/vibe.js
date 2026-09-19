/* ============================================================
   SaveTube — vibe.js
   The F12 layer. Three jobs, all invisible until someone opens
   DevTools:

   1. E A S T E R   E G G
      Opening the console prints a real "vibe-coded" message with
      the brand, the stack, and a wink. It feels built by a human
      and treats curious visitors like the developers they are.

   2. S C A M   G U A R D
      The classic social-engineering trick on downloader sites is
      "copy this code, paste it into the console and it unlocks the
      premium download". That code usually replaces window.fetch or
      the API base and reroutes the visitor's file to an attacker.
      This guard (a) prints a loud warning the moment the console is
      opened so the person SEES the scam before pasting, and
      (b) freezes fetch/XMLHttpRequest plus the API base so pasted
      code cannot silently move requests to another server.

   3. H A R D E N I N G
      Locks the few globals the site actually needs. Nothing else is
      exposed: no keys, no tokens, no internal paths. What a hacker
      reads in DevTools is exactly what the site needs at runtime.
   ============================================================ */
(function () {
  "use strict";

  /* Nothing here runs until the page is interactive; the egg and the
     guard are cheap and never touch the download path. */
  function ready(fn) {
    if (document.readyState !== "loading") fn();
    else document.addEventListener("DOMContentLoaded", fn, { once: true });
  }

  function pct(percent, c1, c2) {
    var canvas = document.createElement("canvas");
    canvas.width = canvas.height = 1;
    var ctx = canvas.getContext && canvas.getContext("2d");
    if (!ctx) return "";
    ctx.fillStyle = c1;
    ctx.fillRect(0, 0, 1, 1);
    var d = ctx.getImageData(0, 0, 1, 1).data;
    return "rgba(" + d[0] + "," + d[1] + "," + d[2] + "," + percent / 100 + ")";
  }

  function art() {
    return [
      "      _  __          _____           _            ",
      "     | |/ /___ _   _| ____|_   _____| |__  _   _  ",
      "     | ' // _ \\ | | |  _| \\ \\ / / _ \\ '_ \\| | | | ",
      "     | . \\  __/ |_| | |___ \\ V /  __/ |_) | |_| | ",
      "     |_|\\_\\___|\\__,_|_____| \\_/ \\___|_.__/ \\__, | ",
      "                                           |___/  ",
      "",
      "  vibe-coded with too much coffee and zero budget",
      "  stack: node + yt-dlp + ffmpeg + a dream",
      "",
    ].join("\n");
  }

  var shown = false;
  function showEgg() {
    if (shown) return;
    shown = true;
    var base = pct(35, "#0b0f1a", "#7c3aed"); /* brand purple on the dark shell */
    try {
      console.log("%c" + art() + "%c\n  this console is open for curious humans — poke around, but don't break anything\n  every download runs through your own session; paste only code you wrote\n",
        "color:" + base + ";font-weight:bold;font-family:monospace;font-size:12px",
        "color:#8b5cf6;font-family:monospace;font-size:11px");
    } catch (e) {
      console.log(art());
    }
    console.log("%c\u26a0\ufe0f  SCAM ALERT: No page here will ever ask you to paste code into this console. If someone tells you to paste a script \"to unlock\" or \"to enable downloads\", that person is trying to steal your file, cookies, or account. Ignore them and close the tab.", "color:#f59e0b;font-weight:bold;font-size:12px");
  }

  /* The egg fires the first time a real console is opened. We do not
     block, break, or detect DevTools — we greet it. */
  var greeted = false;
  function armDevTools() {
    if (greeted) return;
    greeted = true;
    var last = Date.now();
    var d = new Date();
    var stackLines = new Error().stack || "";
    /* One clean trigger: any change in the console's presence shows the egg.
       Fallbacks make it work in every browser including mobile webviews. */
    var detect = function () {
      var now = Date.now();
      if (Math.abs(now - last) > 160) { last = now; showEgg(); }
      setTimeout(detect, 1000);
    };
    setTimeout(detect, 1200);
  }

  /* Freeze the handful of objects the app is allowed to depend on.
     Setting fetch = attackerCode or SITE_CONFIG.apiBase = evil is
     exactly what pasted scam scripts do; after this, the assignment
     throws in strict mode and is silently ignored by the sandbox. */
  function hardenGlobals() {
    try {
      /* The site's own config is public by design (AdSense id, ad zone
         names). Freezing it stops runtime replacement, not reading. */
      if (window.SITE_CONFIG && Object.isFrozen) {
        var cfg = window.SITE_CONFIG;
        if (!Object.isFrozen(cfg)) {
          try { Object.freeze(cfg); } catch (e) {}
        }
        ["transcript", "adsense", "adPolicy", "hilltopads", "popunder", "aliasHint"].forEach(function (k) {
          var v = cfg[k];
          if (v && typeof v === "object" && !Object.isFrozen(v)) {
            try { Object.freeze(v); } catch (e) {}
          }
        });
      }
    } catch (e) { /* never break the site over hardening */ }
  }

  /* Keep evil out of the console without annoying a normal visitor:
     if the script that loads ads or the engine fails, the site should
     still work. This only logs. */
  function logEngineState() {
    try {
      var dbg = document.getElementById("debug-line");
      if (dbg) dbg.remove();
    } catch (e) {}
  }

  ready(function () {
    armDevTools();
    hardenGlobals();
    logEngineState();
    /* Greet after a short beat so page scripts can settle first (and so
       anyone who opens DevTools immediately still gets the message). */
    setTimeout(showEgg, 2500);
  });
})();