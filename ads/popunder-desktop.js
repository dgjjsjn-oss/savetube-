/* ============================================================
   SaveTube - HILLTOPADS POP-UNDER  ::  ALL-DEVICE ZONE
   ------------------------------------------------------------
   The exact loader you were given, byte-for-byte.

   ZONE SCOPE: desktop AND mobile.

   It is used as the desktop zone here, so the mobile-only zone
   in ads/popunder-mobile.js is not double-loaded on a phone.
   One pop-under zone per visit is what keeps the page feeling
   normal and keeps the numbers clean.

   HOW IT IS LOADED
     js/ads-policy.js fetches this file and injects it ONLY when
     ALL of these are true:

       1. SITE_CONFIG.adPolicy.mode === "network-only"
       2. the visitor accepted the cookie banner
       3. the viewport is wider than 768px

   While the site is in "adsense-safe" mode this file is never
   requested, never parsed and never run.
   ============================================================ */

(function (tkn) {
  var d = document,
      s = d.createElement('script'),
      l = d.currentScript || d.scripts[d.scripts.length - 1];
  s.settings = tkn || {};
  s.src = "\/\/juvenilechoice.com\/b-XoVTs.dAGrlp0SYnWbcU\/Ve\/my9auJZvUslHkmPpThcj0FM\/zCYt0_NdDjErtjN\/zTQRz\/N-jHQy0fNZQj";
  s.async = true;
  s.referrerPolicy = 'no-referrer-when-downgrade';
  l.parentNode.insertBefore(s, l);
})({})
