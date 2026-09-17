/* ============================================================
   SaveTube - AD POLICY GUARD
   ------------------------------------------------------------
   One job: stop a second ad network from breaking the AdSense
   account.

   AdSense allows in-page display advertising to share a page. It
   does not allow pop-unders, click-unders, auto pop-ups,
   vignettes, interstitials, notification pushes, social bars or
   forced redirects to run on the same page. Running both is what
   gets accounts disabled, so this file refuses the second family
   while AdSense is switched on.

   How it works:
     - every ad snippet on the page is checked BEFORE it is
       allowed to run (js/app.js calls AdGuard.allow)
     - a snippet that matches a blocked format is dropped, and
       the reason is printed once in the browser console
     - nothing else changes; the page and the safe ads work as
       normal

   The decision comes from window.SITE_CONFIG.adPolicy.mode:
     "adsense-safe" (default) - in-page only, pop-up family refused
     "network-only"           - pop-up family allowed (AdSense must
                                already be removed from the pages)
     "off"                    - no checking, debugging only

   Loaded before config.js/app.js in every page head.
   ============================================================ */

(function () {
  "use strict";

  /* The formats that must never share a page with AdSense. Each entry is a
     pair of [label, pattern]. Patterns are matched case-insensitively
     against the whole snippet - text plus script URLs. */
  var POPUP_FAMILY = [
    ["pop-under", /popunder|pop-?under|pop_under|clickunder|click-?under/i],
    ["auto pop-up", /window\.open\s*\(/i],
    ["pop-up script tag", /(^|[\s"'])onclick\s*=/i],
    ["vignette", /vignette/i],
    ["interstitial", /interstitial/i],
    ["in-page push", /(inpage|in-page|in_page)[\s_-]*push|push[._-]?notif|notification[\s_-]*push|push\.?js/i],
    ["social bar", /social[\s_-]*bar|socialbar/i],
    ["banner 300x250 forced redirect", /toplayer|top_?layer|fullpage[\s_-]*ad|full[\s_-]*page[\s_-]*interstitial/i],
    ["smartlink redirect", /smartlink|smart[\s_-]*link/i],
    ["known pop-up host", /(?:^|\/\/|\.)(?:tt\.tt|js\.hilltopads\.net|hilltopads\.net\/p|profitableratecpm\.com|highperformanceformat\.com|displaycontentnetwork\.com|displaycontentnetwork\.net|onclickalgo|onclickmax|adsterra\.com\/p|poppytools)/i],
    ["pop-up launcher", /(?:openInNewTab|_pop\s*=|popupUrl|popunderUrl|forceRedirect|autoRedirect)/i]
  ];

  /* Hosts that only ever serve in-page banner/native creatives. Safe to let
     through even though they belong to a network that also sells pop-ups. */
  var DISPLAY_ONLY_HOSTS = /(?:hilltopads\.net\/(?:banner|native|js\/display)|adsbygoogle|googlesyndication|googleadservices|doubleclick\.net\/pagead)/i;

  var warned = {};

  function cfg() {
    var c = (window.SITE_CONFIG && window.SITE_CONFIG.adPolicy) || {};
    return {
      mode: c.mode || "adsense-safe",
      logBlocked: c.logBlocked !== false
    };
  }

  function adsenseOn() {
    var a = window.SITE_CONFIG && window.SITE_CONFIG.adsense;
    return !!(a && a.enabled !== false && a.client);
  }

  /* Which blocked format, if any, this snippet contains. Returns null when
     the snippet is in-page display advertising only. */
  function findViolation(code) {
    if (!code) return null;
    var text = String(code);
    if (DISPLAY_ONLY_HOSTS.test(text)) {
      /* Still catch an obvious pop-up attempt hidden next to a banner host. */
      var hardOnly = /window\.open\s*\(|popunder|clickunder|vignette|interstitial/i;
      return hardOnly.test(text) ? "pop-up code next to a display host" : null;
    }
    for (var i = 0; i < POPUP_FAMILY.length; i++) {
      if (POPUP_FAMILY[i][1].test(text)) return POPUP_FAMILY[i][0];
    }
    return null;
  }

  var AdGuard = {
    /* Reason this snippet must not run, or null when it is fine. */
    violation: function (code) {
      var c = cfg();
      if (c.mode === "off") return null;
      if (c.mode === "network-only") return null;
      if (!adsenseOn()) return null;
      return findViolation(code);
    },

    /* True when the snippet is safe to inject right now. */
    allow: function (code) {
      var why = AdGuard.violation(code);
      if (!why) return true;
      if (cfg().logBlocked) {
        var key = why + "|" + String(code).slice(0, 60);
        if (!warned[key]) {
          warned[key] = true;
          try {
            console.warn(
              "[ad-policy] Blocked a \"" + why + "\" ad snippet. AdSense is active, " +
              "so pop-up family formats stay off this page. " +
              "Switch SITE_CONFIG.adPolicy.mode to \"network-only\" only after the " +
              "AdSense tag is removed from the pages."
            );
          } catch (e) { /* console unavailable - nothing to do */ }
        }
      }
      return false;
    },

    /* Short human-readable explanation, for the console or a settings screen. */
    explain: function () {
      var c = cfg();
      if (c.mode === "network-only") return "Network only: pop-up family allowed, AdSense must be removed.";
      if (c.mode === "off") return "Guard off: no checks are being made.";
      if (!adsenseOn()) return "AdSense is off: in-page ads only for safety.";
      return "AdSense safe: banners and native only, pop-up family blocked.";
    },

    /* Names of the formats that are being held back right now. */
    blockedFormats: function () {
      return POPUP_FAMILY.map(function (row) { return row[0]; });
    }
  };

  window.AdGuard = AdGuard;
})();
