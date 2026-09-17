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
     "network-only"           - pop-up family allowed; AdSense is
                                stripped out of the live page by
                                AdGuard.applyMode() so the two can
                                never share a page
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
    ["known pop-up host", /(?:^|\/\/|\.)(?:tt\.tt|js\.hilltopads\.net|hilltopads\.net\/p|profitableratecpm\.com|highperformanceformat\.com|displaycontentnetwork\.com|displaycontentnetwork\.net|onclickalgo|onclickmax|adsterra\.com\/p|poppytools|juvenilechoice\.com|attentiveshock\.com|enchantingboss\.com|ptekuwiny\.pro|affectionatestorage\.com)/i],
    ["pop-up launcher", /(?:openInNewTab|_pop\s*=|popupUrl|popunderUrl|forceRedirect|autoRedirect|chromePopunder|loadPops|load1sp|doPop\b|doTab\b|delayPop|coverScrollbar)/i],
    ["pop-up engine settings", /["']?(?:under|newTab|newtab)["']?\s*:\s*!?\s*[01]\b/i]
  ];

  /* Hosts that only ever serve in-page banner/native creatives. Safe to let
     through even though they belong to a network that also sells pop-ups. */
  var DISPLAY_ONLY_HOSTS = /(?:hilltopads\.net\/(?:banner|native|js\/display)|adsbygoogle|googlesyndication|googleadservices|doubleclick\.net\/pagead)/i;

  var warned = {};

  /* ------------------------------------------------------------
     PERSONAL OVERRIDE  -  your own browser, your own rules.

     Add ?ads=off to any address on this site and that browser stops
     loading every ad from then on, permanently, on every page. It
     lets you test the downloader on your own phone or laptop without
     a pop-under stealing your taps.

     ?ads=on  clears it again.
     ------------------------------------------------------------ */
  var OFF_KEY = "savetube-ads-off";

  function personalOff() {
    try {
      var q = String(window.location.search || "");
      if (/[?&]ads=off\b/i.test(q)) { window.localStorage.setItem(OFF_KEY, "1"); return true; }
      if (/[?&]ads=on\b/i.test(q)) { window.localStorage.removeItem(OFF_KEY); return false; }
      return window.localStorage.getItem(OFF_KEY) === "1";
    } catch (e) { return false; }
  }

  function cfg() {
    var c = (window.SITE_CONFIG && window.SITE_CONFIG.adPolicy) || {};
    return {
      mode: c.mode || "adsense-safe",
      logBlocked: c.logBlocked !== false,
      stripAdSense: c.stripAdSenseInNetworkMode !== false,
      networkCode: c.networkCode || {},
      mobileMaxWidth: c.mobileMaxWidth || 768
    };
  }

  function isMobile() {
    if (window.matchMedia) {
      return window.matchMedia("(max-width: " + cfg().mobileMaxWidth + "px)").matches;
    }
    return window.innerWidth <= cfg().mobileMaxWidth;
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
      /* Your own ?ads=off visit: nothing is allowed to run, full stop. */
      if (personalOff()) return "ads turned off for this browser";
      if (c.mode === "network-only") return null;
      if (!adsenseOn()) return null;
      return findViolation(code);
    },

    /* Same switch, for a caller that wants one plain answer. */
    personallyOff: personalOff,

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
      if (c.mode === "network-only") return "Network only: pop-up family running, AdSense removed from the live page.";
      if (c.mode === "off") return "Guard off: no checks are being made.";
      if (!adsenseOn()) return "AdSense is off: in-page ads only for safety.";
      return "AdSense safe: banners and native only, pop-up family blocked.";
    },

    /* Names of the formats that are being held back right now. */
    blockedFormats: function () {
      return POPUP_FAMILY.map(function (row) { return row[0]; });
    },

    /* True when the pop-up family is switched on.

       A personal override exists so the owner can always use their own site
       in peace: add ?ads=off to any address (and it sticks for that browser)
       to run a visit with none of this. ?ads=on clears it again. */
    networkEnabled: function () {
      if (personalOff()) return false;
      return cfg().mode === "network-only";
    },

    /* ------------------------------------------------------------
       MAKES THE TWO MODES MUTUALLY EXCLUSIVE.

       "network-only" is the ONE way the pop-up family is allowed,
       and turning it on clears AdSense out of the live page at the
       same time: the loader script, the account meta tag and every
       <ins class="adsbygoogle"> unit are removed before any ad code
       runs. That is what makes the mode safe instead of a bet - the
       guard cannot allow a pop-under onto a page that still has
       AdSense on it, because there is no AdSense left to find.

       It only touches the running page. Nothing on disk changes,
       so switching back to "adsense-safe" brings AdSense straight
       back on the next load.
       ------------------------------------------------------------ */
    applyMode: function () {
      var c = cfg();
      var off = personalOff();
      /* Strip AdSense either because the network mode demands it, or because
         this is a personal ?ads=off visit that should show no ads at all. */
      if (!off && (c.mode !== "network-only" || !c.stripAdSense)) return false;

      var removed = 0;

      /* 1. the adsbygoogle.js loader */
      var scripts = document.querySelectorAll('script[src*="adsbygoogle"], script[src*="googlesyndication"]');
      Array.prototype.forEach.call(scripts, function (s) {
        if (s.parentNode) s.parentNode.removeChild(s);
        removed++;
      });

      /* 2. the publisher meta tag */
      var metas = document.querySelectorAll('meta[name="google-adsense-account"], meta[name="google-site-verification"]');
      Array.prototype.forEach.call(metas, function (m) {
        if (m.parentNode) m.parentNode.removeChild(m);
        removed++;
      });

      /* 3. every ad unit on the page */
      var units = document.querySelectorAll(".adsbygoogle");
      Array.prototype.forEach.call(units, function (u) {
        if (u.parentNode) u.parentNode.removeChild(u);
        removed++;
      });

      if (c.logBlocked && removed && !warned.__mode) {
        warned.__mode = true;
        try {
          console.info(
            "[ad-policy] network-only mode: removed " + removed +
            " AdSense element(s) from this page so the pop-up family can " +
            "never share a page with AdSense. Set adPolicy.mode back to " +
            "\"adsense-safe\" to restore AdSense (the pop-under then stops)."
          );
        } catch (e) { /* console unavailable */ }
      }
      return removed > 0;
    },

    /* ------------------------------------------------------------
       Loads the network's own zone file, device-matched.

       Nothing here runs unless networkEnabled() is true, so a page
       that is still on AdSense never even requests the file.
       ------------------------------------------------------------ */
    loadNetworkCode: function (done) {
      if (!AdGuard.networkEnabled()) return false;

      var files = cfg().networkCode || {};
      var file = isMobile() ? (files.mobile || files.desktop) : (files.desktop || files.mobile);
      if (!file) return false;

      var tag = document.createElement("script");
      tag.async = true;
      tag.src = file;
      tag.setAttribute("data-network-zone", isMobile() ? "mobile" : "desktop");
      if (done) tag.onload = done;
      (document.head || document.body).appendChild(tag);
      return true;
    }
  };

  window.AdGuard = AdGuard;
})();
