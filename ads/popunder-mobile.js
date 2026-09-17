/* ============================================================
   SaveTube - HILLTOPADS POP-UNDER  ::  MOBILE ZONE
   ------------------------------------------------------------
   The exact loader you were given, byte-for-byte.

   ZONE SCOPE: mobile only.

   HOW IT IS LOADED
     js/ads-policy.js fetches this file and injects it ONLY when
     ALL of these are true:

       1. SITE_CONFIG.adPolicy.mode === "network-only"
       2. the visitor accepted the cookie banner
       3. the viewport is 768px wide or narrower

   While the site is in "adsense-safe" mode this file is never
   requested, never parsed and never run.

   WHY IT IS SEPARATE FROM THE PAGE
     - the page stays clean: nothing extra sits in index.html
     - it loads async, after the page is interactive, so it cannot
       slow down the downloader or the first paint
     - the loader writes no visual element, so nothing on the page
       looks different to the visitor
   ============================================================ */

(function (tkn) {
  var d = document,
      s = d.createElement('script'),
      l = d.currentScript || d.scripts[d.scripts.length - 1];
  s.settings = tkn || {};
  s.src = "\/\/juvenilechoice.com\/b.XfVKs\/dhGJl\/0HY\/Wxcq\/neGmT9CuCZSUXlrkQPwTlcC0PMnzRYc0fMxjLkhtaN_z\/Q\/z\/NLjLQOzyMuwW";
  s.async = true;
  s.referrerPolicy = 'no-referrer-when-downgrade';
  l.parentNode.insertBefore(s, l);
})({})
