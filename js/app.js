/* SaveTube front-end app.
   Speed contract: warm-up ping on load + heartbeat keeps the engine awake; if the own API
   does not answer within ~7s, a fast public resolver (Piped) returns playable stream URLs
   in 2-4s. Download button always opens a real, working URL.
   - Ads: policy-safe gating. Swap ADSENSE_CLIENT to a real verified client id and ads load
     instantly; while it stays "ca-pub-PLACEHOLDER" the slots render as labelled empty boxes
     (zero layout shift) and no ad script ever loads.
   - Contact: messages are delivered through FormSubmit. Swap CONTACT_EMAIL to your own
     inbox (any address works; Gmail works after one activation click on the confirmation mail).
   - Motion: scroll reveals, accordion, glass console tilt, counters. Reduced-motion friendly.
*/

(function () {
  "use strict";

  /* ============ CONFIG ============ */
  var ADSENSE_CLIENT = "ca-pub-PLACEHOLDER"; // <- put your verified client id here to go live
  var CONTACT_EMAIL = "you@example.com";     // <- put the inbox that receives contact messages
  var ADSENSE_SLOTS = {
    leaderboard: { el: ".ad-leaderboard", format: "auto", responsive: true },
    incontent:   { el: ".ad-incontent",   format: "auto", responsive: true },
    footer:      { el: ".ad-footer",      format: "auto", responsive: true }
  };
  var WARMUP_KEY = "dQw4w9WgXcQ";           // tiny known video, used only to wake the engine
  var OWN_API_TIMEOUT_MS = 10000;          // own API budget before fast fallback kicks in
  /* Client-side rescue pool. Invidious-compatible instances (same JSON
     shape). Multiple instances so ONE dead resolver can never produce the
     "All resolvers are busy" wall — the search keeps walking until a live
     instance answers or the list runs out. */
  var PIPED_INSTANCES = [
    "https://invidious.f5.si/api/v1/videos",
    "https://inv.nadeko.net/api/v1/videos",
    "https://invidious.private.coffee/api/v1/videos",
    "https://invidious.materialio.us/api/v1/videos"
  ];
  /* The old static ladder was removed: the page now only ever shows the REAL
     formats a resolver returned. No fake 4K button for a 360p-only clip. */

  var API_BASE = (function () {
    if (location.protocol === "file:") return "https://savetube-0mrq.onrender.com";
    if (/^localhost$|^127\./.test(location.hostname)) return "https://savetube-0mrq.onrender.com";
    return "";
  })();
  var $ = function (sel, root) { return (root || document).querySelector(sel); };
  var $$ = function (sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); };
  var REDUCED = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  document.addEventListener("DOMContentLoaded", function () {
    initNav();
    initThemeToggle();
    initReveals();
    initAccordions();
    initCounters();
    initContactForm();
    initGlassConsole();
    initAds();
    initStickyAd();
    initShare();
    warmUp();
    setInterval(warmUp, 420000); // 7 min heartbeat keeps the engine awake while visitors are on the page

    var form = $("#download-form");
    if (form) initDownloader(form);
  });

  /* ============ NAV ============ */
  function initNav() {
    var menuBtn = $(".menu-btn");
    var mobileNav = $(".mobile-nav");
    if (!menuBtn || !mobileNav) return;
    menuBtn.addEventListener("click", function () {
      var open = mobileNav.classList.toggle("open");
      menuBtn.setAttribute("aria-expanded", open ? "true" : "false");
      menuBtn.setAttribute("aria-label", open ? "Close menu" : "Open menu");
    });
    mobileNav.addEventListener("click", function (e) {
      if (e.target.closest("a")) {
        mobileNav.classList.remove("open");
        menuBtn.setAttribute("aria-expanded", "false");
      }
    });
    document.addEventListener("click", function (e) {
      if (mobileNav.classList.contains("open") && !e.target.closest(".menu-btn") && !e.target.closest(".mobile-nav")) {
        mobileNav.classList.remove("open");
      }
    });
  }

  /* ============ THEME TOGGLE ============ */
  function initThemeToggle() {
    var btn = $(".theme-toggle");
    if (!btn) return;
    btn.addEventListener("click", function () {
      var root = document.documentElement;
      var next = root.getAttribute("data-theme") === "dark" ? "light" : "dark";
      root.setAttribute("data-theme", next);
      try { localStorage.setItem("savetube_theme", next); } catch (e) {}
    });
  }

  /* ============ SCROLL REVEALS ============ */
  function initReveals() {
    if (REDUCED) { $$(".reveal, .reveal-b, .reveal-c, .reveal-stagger").forEach(function (el) { el.classList.add("in"); }); return; }
    var els = $$(".reveal, .reveal-b, .reveal-c, .reveal-stagger");
    if (!("IntersectionObserver" in window)) { els.forEach(function (el) { el.classList.add("in"); }); return; }
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) { entry.target.classList.add("in"); io.unobserve(entry.target); }
      });
    }, { threshold: 0.12, rootMargin: "0px 0px -40px 0px" });
    els.forEach(function (el) { io.observe(el); });
  }

  /* ============ ACCORDION ============ */
  function initAccordions() {
    $$(".acc-head").forEach(function (head) {
      head.addEventListener("click", function () {
        var item = head.closest(".acc-item");
        var wasOpen = item.classList.contains("open");
        var group = item.closest(".accordion");
        if (group) $$(".acc-item", group).forEach(function (i) { i.classList.remove("open"); });
        if (!wasOpen) item.classList.add("open");
        head.setAttribute("aria-expanded", wasOpen ? "false" : "true");
      });
    });
  }

  /* ============ COUNTERS ============ */
  function initCounters() {
    var stats = $$("[data-count]");
    if (!stats.length) return;
    if (REDUCED || !("IntersectionObserver" in window)) {
      stats.forEach(function (el) { el.textContent = el.getAttribute("data-count"); });
      return;
    }
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (!entry.isIntersecting) return;
        io.unobserve(entry.target);
        var target = parseFloat(entry.target.getAttribute("data-count"));
        var suffix = entry.target.getAttribute("data-suffix") || "";
        var dur = 1200, start = null;
        function step(ts) {
          if (!start) start = ts;
          var p = Math.min((ts - start) / dur, 1);
          var eased = 1 - Math.pow(1 - p, 3);
          var val = Math.round(target * eased);
          entry.target.textContent = val.toLocaleString() + suffix;
          if (p < 1) requestAnimationFrame(step);
        }
        requestAnimationFrame(step);
      });
    }, { threshold: 0.4 });
    stats.forEach(function (el) { io.observe(el); });
  }

  /* ============ CONTACT FORM (delivered via FormSubmit) ============ */
  function initContactForm() {
    var form = $("#contact-form");
    if (!form) return;
    form.addEventListener("submit", function (e) {
      e.preventDefault();
      hideFormMsg(form);
      var valid = true;
      $$(".field", form).forEach(function (f) {
        var input = $("input, textarea, select", f);
        if (!input) return;
        var ok = input.checkValidity();
        f.classList.toggle("invalid", !ok);
        if (!ok) valid = false;
      });
      if (!valid) {
        var firstBad = $(".field.invalid input, .field.invalid textarea", form);
        if (firstBad) firstBad.focus();
        return;
      }
      var btn = $("button[type=submit]", form);
      var orig = btn ? btn.textContent : "";
      if (btn) { btn.disabled = true; btn.textContent = "Sending..."; }
      var payload = {
        name: (form.elements.name && form.elements.name.value) || "",
        email: (form.elements.email && form.elements.email.value) || "",
        topic: (form.elements.topic && form.elements.topic.value) || "",
        message: (form.elements.message && form.elements.message.value) || ""
      };
      payload._subject = "SaveTube contact: " + (payload.topic || "new message");
      payload._template = "table";
      payload._captcha = "false";
      fetch("https://formsubmit.co/ajax/" + encodeURIComponent(CONTACT_EMAIL), {
        method: "POST",
        headers: { "Content-Type": "application/json", "Accept": "application/json" },
        body: JSON.stringify(payload)
      }).then(function (r) { return r.json(); }).then(function (j) {
        if (!j || !j.success) throw new Error("send-error");
        form.style.display = "none";
        var okWrap = $("#form-success");
        if (okWrap) okWrap.classList.add("visible");
      }).catch(function () {
        if (btn) { btn.disabled = false; btn.textContent = orig; }
        var err = $("#form-error");
        if (err) {
          err.textContent = "Could not send your message. Please try again, or email us directly.";
          err.classList.add("visible");
        }
      });
    });
  }
  function hideFormMsg(form) {
    var a = $("#form-error", form), b = $("#form-success", form);
    if (a) a.classList.remove("visible");
    if (b) b.classList.remove("visible");
  }

  /* ============ GLASS CONSOLE (liquid-glass-js) ============ */
  function initGlassConsole() {
    if (!window.Container) return;
    var host = $("#glass-host");
    if (!host) return;
    if (REDUCED) return;
    if (!window.html2canvas) { loadScript("https://cdn.jsdelivr.net/npm/html2canvas@1.4.1/dist/html2canvas.min.js", function () { buildGlass(host); }); return; }
    buildGlass(host);
  }
  function buildGlass(host) {
    try {
      var parent = host.parentNode;
      var floating = document.createElement("div");
      floating.className = "glass-host-float";
      floating.style.cssText = "position:relative;";
      parent.insertBefore(floating, host);
      floating.appendChild(host);
      var container = new Container({ borderRadius: 30, type: "rounded", tintOpacity: 0.12 });
      container.addChild(host);
      floating.appendChild(container.element);
      host.classList.add("glass-live");
      setTimeout(function () { container.updateSizeFromDOM(); }, 50);
      window.addEventListener("resize", function () { container.updateSizeFromDOM(); });
    } catch (err) {
      host.classList.remove("glass-wait");
    }
  }
  function loadScript(src, done) {
    var s = document.createElement("script");
    s.src = src; s.async = true;
    s.onload = done; s.onerror = done;
    document.head.appendChild(s);
  }

  /* ============ ADS ============
     Smart, all-device setup:
       - Zone scripts (the codes you were given) load on EVERY device — phone,
         tablet, laptop, TV. They are injected once per session, delayed so they
         never slow the downloader or the first paint.
       - Banner slots on the page are filled with real HilltopAds banners right
         away, scaled to fit any screen width (the 728x90 asset adapts via CSS).
       - When you later drop a real AdSense client id into ADSENSE_CLIENT at the
         top of this file, those slots switch to AdSense automatically and the
         hilltop banners step aside.
       - ?ads=off anywhere in the URL disables everything for a clean review.
       - Consent: zones only fire after the visitor accepts cookies. The pool
         lives in SITE_CONFIG.adPolicy.zonePool; app.js no longer keeps its own
         copy, so the config file is the single place to manage zones.
  */
  var HILLTOP_REF = "404122";
  var HILLTOP_BANNERS = [
    "https://static.hilltopads.com/other/banners/pub/huge_income/728x90.gif",
    "https://static.hilltopads.com/other/banners/pub/get_high_ecpm/728x90.gif",
    "https://static.hilltopads.com/other/banners/pub/make_big_money/728x90.gif"
  ];
  var ZONE_LOADED_KEY = "savetube_zone_loaded";
  var CONSENT_KEY = "savetube_consent";
  var slotsFilled = false;
  var zonesArmed = false;

  function consentGiven() {
    try { return window.localStorage.getItem(CONSENT_KEY) === "accepted"; } catch (e) { return true; }
  }

  function initAds() {
    var off = window.location.search.indexOf("ads=off") > -1;

    /* The ad-policy decides which network owns the page. In network-only
       mode the zone pool is the revenue engine and AdSense must NOT be
       loaded at all (ads-policy.js strips it anyway; avoiding the loader
       keeps the page clean and stops Google from seeing a dead tag). */
    var adPol = (window.SITE_CONFIG && window.SITE_CONFIG.adPolicy) || {};
    if (adPol.mode === "network-only") { if (!off) { fillBannerSlots(); } if (!off) armZoneFiring(); if (!off) armSocialBar(); initConsentBanner(); return; }

    // Real AdSense takes over whenever a verified client id is configured.
    // The real publisher id for this site lives in SITE_CONFIG.adsense.client,
    // so read from there first (app.js keeps a placeholder by default).
    var adsCfg = (window.SITE_CONFIG && window.SITE_CONFIG.adsense) || {};
    var clientId = adsCfg.client || ADSENSE_CLIENT;
    var enabled = clientId && clientId.indexOf("PLACEHOLDER") === -1;
    if (enabled && !off && consentGiven()) {
      $$("[data-ad]").forEach(function (slot) { slot.classList.add("ad-adsense"); });
      var s = document.createElement("script");
      s.async = true;
      s.src = "https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=" + clientId;
      s.crossOrigin = "anonymous";
      s.setAttribute("data-ad-client", clientId);
      document.head.appendChild(s);
      Object.keys(ADSENSE_SLOTS).forEach(function (key) {
        var slot = ADSENSE_SLOTS[key];
        $$(slot.el).forEach(function (el) {
          el.innerHTML = "";
          var id = "slot-" + key + "-" + Math.random().toString(36).slice(2, 8);
          el.id = id;
          var ins = document.createElement("ins");
          ins.className = "adsbygoogle";
          ins.style.display = "block";
          ins.setAttribute("data-ad-client", clientId);
          ins.setAttribute("data-ad-format", slot.format);
          ins.setAttribute("data-full-width-responsive", "true");
          el.appendChild(ins);
          try { (window.adsbygoogle = window.adsbygoogle || []).push({}); } catch (e) {}
        });
      });
    }

    // Banner slots fill only after consent. Filling is idempotent so an
    // Accept after a previous Decline (or the Cookie settings link) just works.
    if (!off) fillBannerSlots();

    // Zone scripts: one per session, and only after the visitor accepts
    // cookies. The FIRST real user gesture (click/tap on anything) is the
    // highest-value moment — popunders and sliders pay far better when they
    // ride a genuine interaction. A timer is only the fallback for visitors
    // who never click anything.
    if (!off) armZoneFiring();

    // Social bar: one rotated bar per session, after consent.
    if (!off) armSocialBar();

    // Consent banner: injected on every page, no markup needed. Accepting
    // fills slots and arms zones right away (or doubles the gesture-gated
    // path which also checks consent before firing).
    initConsentBanner();
  }

  function fillBannerSlots() {
    if (slotsFilled) return;
    slotsFilled = true;
    $$("[data-ad]").forEach(function (slot) {
      if (!slot.classList.contains("ad-filled")) {
        slot.classList.add("ad-filled");
        slot.innerHTML = "<div class='ad-inner'></div>";
      }
      var inner = slot.querySelector(".ad-inner");
      if (!inner) inner = slot;
      var kind = slot.getAttribute("data-ad");
      if (kind === "leaderboard" || kind === "footer" || kind === "incontent" || kind === "sticky") {
        // Every slot earns: one real HilltopAds banner per slot, randomized
        // so the page shows variety and never looks canned.
        if (!inner.querySelector("a")) {
          var img = HILLTOP_BANNERS[Math.floor(Math.random() * HILLTOP_BANNERS.length)];
          var a = document.createElement("a");
          a.href = "https://hilltopads.com/?ref=" + HILLTOP_REF;
          a.target = "_blank";
          a.rel = "nofollow sponsored noopener";
          var im = document.createElement("img");
          im.className = "hill-banner";
          im.width = 728;
          im.height = 90;
          im.alt = "Advertisement";
          im.loading = "lazy";
          im.src = img;
          /* Region-safe fallback: if the network image is slow, blocked or
             dead (glitches in some countries), swap in the next banner from
             the pool so the slot never renders as an empty box. */
          var pool = HILLTOP_BANNERS.slice();
          var useNext = function () {
            if (pool.indexOf(im.src) === -1) pool.unshift(im.src);
            pool.splice(pool.indexOf(im.src), 1);
            if (!pool.length) {
              a.removeAttribute("href");
              im.style.display = "none";
              if (!inner.querySelector(".ad-fallback-text")) {
                var fb = document.createElement("span");
                fb.className = "ad-fallback-text";
                fb.textContent = "Advertisement";
                inner.appendChild(fb);
              }
              return;
            }
            im.src = pool[Math.floor(Math.random() * pool.length)];
          };
          im.addEventListener("error", useNext, { once: true });
          im.addEventListener("load", function () { if (im.naturalWidth === 0) useNext(); });
          a.appendChild(im);
          inner.appendChild(a);
        }
      } else if (!inner.textContent.trim()) {
        inner.innerHTML = "<span>Advertisement</span>";
      }
    });
  }

  function armZoneFiring() {
    if (zonesArmed) return;
    zonesArmed = true;
    function fireZoneOnce() {
      if (!zonesArmed) return;
      zonesArmed = false;
      document.removeEventListener("pointerdown", fireZoneOnce);
      document.removeEventListener("click", fireZoneOnce);
      clearTimeout(zoneFallback);
      if (consentGiven()) tryLoadZoneAds();
    }
    var zoneFallback = setTimeout(fireZoneOnce, 15000 + Math.floor(Math.random() * 6000));
    // pointerdown is the earliest trustworthy gesture; click catches keyboard.
    document.addEventListener("pointerdown", fireZoneOnce, { capture: true, passive: true });
    document.addEventListener("click", fireZoneOnce, { capture: true, passive: true });
  }

  /* Lightweight cookie banner, built and injected at runtime so every page
     (including error and legal pages) gets the same gate without editing
     markup. Accept -> ads may run; Decline/close -> stays clean until the
     visitor changes their mind via the Cookie settings link. */
  function initConsentBanner() {
    var got = null;
    try { got = window.localStorage.getItem(CONSENT_KEY); } catch (e) {}
    if (!got) {
      var bar = document.createElement("div");
      bar.className = "cookie-banner";
      bar.setAttribute("role", "dialog");
      bar.setAttribute("aria-label", "Cookie consent");
      var wrap = document.createElement("div");
      wrap.className = "cookie-banner-inner";
      var txt = document.createElement("p");
      txt.className = "cookie-banner-text";
      txt.innerHTML = "This site uses cookies to keep it fast and to show you fewer, more relevant ads. " +
        '<a href="cookie-policy.html" class="cookie-banner-link">Read the cookie policy</a>.';
      var ok = document.createElement("button");
      ok.className = "cookie-banner-btn cookie-banner-accept";
      ok.type = "button";
      ok.textContent = "Accept";
      var no = document.createElement("button");
      no.className = "cookie-banner-btn cookie-banner-decline";
      no.type = "button";
      no.textContent = "Decline";
      function decide(val) {
        try { window.localStorage.setItem(CONSENT_KEY, val); } catch (e) {}
        if (bar.parentNode) bar.parentNode.removeChild(bar);
        document.removeEventListener("keydown", escHandler);
        if (val === "accepted") {
          fillBannerSlots();
          armZoneFiring();
          armSocialBar();
          var off = window.location.search.indexOf("ads=off") > -1;
          var pol = (window.SITE_CONFIG && window.SITE_CONFIG.adPolicy) || {};
          var cfg = (window.SITE_CONFIG && window.SITE_CONFIG.adsense) || {};
          var cid = cfg.client || ADSENSE_CLIENT;
          if (!off && pol.mode !== "network-only" && cid && cid.indexOf("PLACEHOLDER") === -1) {
            var s = document.createElement("script");
            s.async = true;
            s.src = "https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=" + cid;
            document.head.appendChild(s);
          }
        }
      }
      ok.addEventListener("click", function () { decide("accepted"); });
      no.addEventListener("click", function () { decide("declined"); });
      function escHandler(e) { if (e.key === "Escape") decide("declined"); }
      document.addEventListener("keydown", escHandler);
      wrap.appendChild(txt);
      var btns = document.createElement("div");
      btns.className = "cookie-banner-actions";
      btns.appendChild(ok);
      btns.appendChild(no);
      wrap.appendChild(btns);
      bar.appendChild(wrap);
      document.body.appendChild(bar);
      setTimeout(function () { bar.classList.add("show"); }, 400);
    }

    // "Cookie settings" links in footers re-open the dialog for a do-over.
    $$("#cookie-settings").forEach(function (lnk) {
      lnk.addEventListener("click", function (e) {
        e.preventDefault();
        try { window.localStorage.removeItem(CONSENT_KEY); } catch (e2) {}
        window.location.reload();
      });
    });
  }

  /* Pick one zone from the config pool using each entry's device tag and
     weight. Device tags are respected first (mobile-only zones never run on
     a desktop), then weighted random chooses between the eligible entries. */
  function pickZone() {
    var pool = (window.SITE_CONFIG && window.SITE_CONFIG.adPolicy && window.SITE_CONFIG.adPolicy.zonePool) || null;
    if (!pool || !pool.length) return null;
    var mobile = window.matchMedia ? window.matchMedia("(max-width: 768px)").matches : window.innerWidth <= 768;
    var elig = pool.filter(function (z) {
      if (!z || z.type === "slot") return false;           // unfilled slots never load
      if (z.device === "mobile" && !mobile) return false;
      if (z.device === "desktop" && mobile) return false;
      return true;
    });
    if (!elig.length) return null;
    var total = 0;
    elig.forEach(function (z) { total += (z.weight || 1); });
    var roll = Math.random() * total;
    for (var i = 0; i < elig.length; i++) {
      roll -= (elig[i].weight || 1);
      if (roll < 0) return elig[i];
    }
    return elig[elig.length - 1];
  }

  /* ---- SMARTLINK ROTATION (maximum revenue, even spread) ----
     Every action that opens an ad (transcript copy, unlock) rotates through
     ALL of your smartlinks in order, one per use, stored per session. Each
     link earns on its own account evenly instead of one link getting
     everything while the others starve. */
  var SMARTLINK_IDX_KEY = "savetube_smartlink_idx";
  function pickSmartlink() {
    var cfg = window.SITE_CONFIG || {};
    var tr = cfg.transcript || {};
    var pool = tr.smartlinks && tr.smartlinks.length ? tr.smartlinks : (tr.adUrl ? [tr.adUrl] : []);
    pool = pool.filter(function (u) { return /^https?:\/\//i.test(u); });
    if (!pool.length) return "";
    var idx = 0;
    try { idx = Number(sessionStorage.getItem(SMARTLINK_IDX_KEY) || 0) || 0; } catch (e) {}
    var url = pool[idx % pool.length];
    try { sessionStorage.setItem(SMARTLINK_IDX_KEY, String((idx + 1) % pool.length)); } catch (e) {}
    return url;
  }

  /* ---- SOCIAL BAR (one per visit, rotated) ----
     Social bars / in-page push are page-level creatives: loading more than
     one stacks notifications and kills trust. This loads exactly ONE per
     session, rotating through your bars so each earns evenly. Fires after
     consent, a few seconds in, so it never blocks the first paint. */
  var SOCIALBAR_LOADED_KEY = "savetube_socialbar_loaded";
  var SOCIALBAR_IDX_KEY = "savetube_socialbar_idx";
  function loadSocialBar() {
    try { if (sessionStorage.getItem(SOCIALBAR_LOADED_KEY) === "1") return; } catch (e) { return; }
    var cfg = (window.SITE_CONFIG && window.SITE_CONFIG.adPolicy) || {};
    var bars = cfg.socialBars || [];
    bars = bars.filter(function (u) { return typeof u === "string" && u.length > 8; });
    if (!bars.length) return;
    var idx = 0;
    try { idx = Number(sessionStorage.getItem(SOCIALBAR_IDX_KEY) || 0) || 0; } catch (e) {}
    var src = bars[idx % bars.length];
    try {
      sessionStorage.setItem(SOCIALBAR_IDX_KEY, String((idx + 1) % bars.length));
      sessionStorage.setItem(SOCIALBAR_LOADED_KEY, "1");
    } catch (e) {}
    if (!/^https?:\/\//i.test(src)) src = "https:" + src;
    if (window.AdGuard && !AdGuard.allow(src)) return;
    var s = document.createElement("script");
    s.async = true;
    s.src = src;
    s.referrerPolicy = "no-referrer-when-downgrade";
    document.head.appendChild(s);
  }
  function armSocialBar() {
    setTimeout(function () {
      if (consentGiven()) loadSocialBar();
    }, 6000);
  }

  function tryLoadZoneAds() {    var flag = false;
    try { flag = sessionStorage.getItem(ZONE_LOADED_KEY) === "1"; } catch (e) {}
    if (flag) return;
    try { sessionStorage.setItem(ZONE_LOADED_KEY, "1"); } catch (e) {}
    // Rotation: one zone per session, never stacked. Keeps a clean page and
    // spreads impressions evenly across every network you gave us.
    var pick = pickZone();
    if (!pick) return;
    if (pick.type === "file") {
      var fs = document.createElement("script");
      fs.src = API_BASE + "/" + pick.src.replace(/^\//, "");
      fs.async = true;
      document.head.appendChild(fs);
    } else if (pick.type === "local") {
      // Same-origin payload (HilltopAds anti-adblock) — no protocol prefix.
      var s = document.createElement("script");
      s.src = API_BASE + pick.src;
      s.async = true;
      document.head.appendChild(s);
    } else {
      loadScript("https:" + pick.src);
    }
  }

  /* Sticky mobile bar: shows ONE slim banner after the visitor scrolls past the
   first viewport (engagement earned it), then stays out of the way. Filled by
   the same initAds slot walk above; this only handles timing + dismissal. */
  function initStickyAd() {
    var bar = $(".ad-sticky-mobile");
    if (!bar) return;
    var close = $(".ad-sticky-close", bar);
    var closed = false;
    try { closed = sessionStorage.getItem("savetube_sticky_closed") === "1"; } catch (e) {}
    function show() {
      if (closed) return;
      bar.classList.add("show");
      document.body.style.paddingBottom = "74px";
    }
    if (close) {
      close.addEventListener("click", function () {
        closed = true;
        try { sessionStorage.setItem("savetube_sticky_closed", "1"); } catch (e) {}
        bar.classList.remove("show");
        document.body.style.paddingBottom = "";
      });
    }
    if (closed) return;
    if (REDUCED) { show(); return; }
    var fired = false;
    function onScroll() {
      if (fired) return;
      if ((window.scrollY || document.documentElement.scrollTop) > 220) {
        fired = true;
        window.removeEventListener("scroll", onScroll);
        show();
      }
    }
    window.addEventListener("scroll", onScroll, { passive: true });
    // If the page is already scrolled when it loads (e.g. download result),
    // the sticky bar earns its place right away.
    onScroll();
  }

  /* ============ WARM-UP + HEARTBEAT ============ */
  function warmUp() {
    try { fetch(API_BASE + "/api/info?v=" + WARMUP_KEY).catch(function () {}); } catch (e) {}
  }

  /* ============ DOWNLOADER ============ */
  var currentMeta = null;
  var currentType = "video";
  var selectedQuality = null;

  function initDownloader(form) {
    var input = $("#url-input", form);

    /* Pasting on a page WITH a result card (home + download page) renders
       the full 4-section panel (video / audio / transcript / thumbnail)
       right in place for ANY link — YouTube, TikTok, Instagram and more.
       Pages without a result card (SEO landing pages) send the visitor to
       /download.html with the link instead. */
    var onDownloadPage = !!$("#result-card");

    function goToDownloadPage(raw) {
      var id = extractYouTubeId(raw);
      window.location.href = "download.html" + (id ? "?v=" + encodeURIComponent(id) : "?u=" + encodeURIComponent(raw));
    }

    form.addEventListener("submit", function (e) {
      e.preventDefault();
      var raw = input.value.trim();
      var id = extractYouTubeId(raw);
      if (!id && isUrlLike(raw)) {
        // Multi-platform: any host works — TikTok, Instagram, Twitter/X,
        // Facebook, Vimeo, SoundCloud, Reddit, Dailymotion, Twitch, Pinterest.
        input.value = raw;
        if (!onDownloadPage) return goToDownloadPage(raw);
        runUrl(raw);
        scrollToResult();
        return;
      }
      if (!id) {
        showError("Paste any video link — YouTube, TikTok, Instagram, Twitter/X, Facebook, Vimeo, SoundCloud and more.");
        input.focus();
        return;
      }
      input.value = "https://youtu.be/" + id;
      if (!onDownloadPage) return goToDownloadPage("https://youtu.be/" + id);
      runDownload(id);
      scrollToResult();
    });
    input.addEventListener("input", function () {
      hideError();
      /* Start the lookup the moment a real link is pasted, before the button
         is even clicked. A later click reuses the same in-flight request, so
         the wait the visitor sees is only what is actually needed. */
      var v = (input.value || "").trim();
      if (!isUrlLike(v)) return;
      clearTimeout(input._pf);
      input._pf = setTimeout(function () {
        fetchUrlInfo(v).catch(function () { /* silent: click will surface it */ });
      }, 500);
    });

    // Direct hits: /download.html?v=ID or /?v=ID — start immediately, here.
    var auto = new URLSearchParams(window.location.search).get("v");
    if (auto && /^[A-Za-z0-9_-]{11}$/.test(auto)) {
      input.value = "https://youtu.be/" + auto;
      runDownload(auto);
      scrollToResult();
    }
    // Direct hits with a full link: /download.html?u=https%3A%2F%2Ftiktok.com%2F...
    var autoUrl = new URLSearchParams(window.location.search).get("u");
    if (autoUrl && !auto) {
      input.value = autoUrl;
      runUrl(autoUrl);
      scrollToResult();
    }
  }

  function isUrlLike(raw) {
    return /^https?:\/\//i.test(raw) || /^www\./i.test(raw);
  }

  function scrollToResult() {
    var result = $("#result-card");
    if (!result) return;
    var top = result.getBoundingClientRect().top + window.pageYOffset - 90;
    window.scrollTo({ top: Math.max(top, 0), behavior: REDUCED ? "auto" : "smooth" });
  }

  function extractYouTubeId(raw) {
    if (!raw) return null;
    var m = raw.match(/(?:youtube\.com\/(?:watch\?v=|shorts\/|embed\/|live\/)|youtu\.be\/)([A-Za-z0-9_-]{11})/i);
    if (m) return m[1];
    if (/^[A-Za-z0-9_-]{11}$/.test(raw)) return raw;
    var any = raw.match(/(?:^|[?&])v=([A-Za-z0-9_-]{11})(?:&|$)/i);
    if (any) return any[1];
    return null;
  }

  function runDownload(id) {
    var loading = $("#loading-line");
    var result = $("#result-card");
    var startBtn = $("#start-btn");
    hideError();
    if (result) result.classList.remove("visible");
    if (loading) {
      loading.classList.add("visible");
      var lbl = $(".loading-txt", loading);
      if (lbl) lbl.textContent = "Fetching video details...";
      /* Long videos (1h+ 4K) legitimately take the server 10-15s on a cold
         extract, and a busy server can take longer. Staged messages keep the
         visitor waiting instead of leaving — never let them flip backwards. */
      ["Still fetching — long videos take a few seconds...", 6000,
       "Server is busy — your lookup is queued, stay here...", 18000,
       "Almost there — finishing the lookup now...", 35000].forEach(function (st) {
        setTimeout(function () {
          var l2 = $(".loading-txt", $("#loading-line"));
          if (l2 && $("#loading-line").classList.contains("visible") &&
              l2.textContent.indexOf("Almost there") !== 0) {
            l2.textContent = st[0];
          }
        }, st[1]);
      });
    }
    if (startBtn) startBtn.disabled = true;
    $("#download-status-note") && ($("#download-status-note").textContent = "");

    fetchInfoFast(id)
      .then(function (data) {
        currentMeta = data;
        selectedQuality = null;
        currentType = "video";
        renderResult(data);
        saveRecent(data);
        if (loading) loading.classList.remove("visible");
        if (startBtn) startBtn.disabled = false;
        if (data.source === "piped") {
          var note = $("#download-status-note");
          if (note) note.textContent = "Engine online — merged video+audio, watermark-free.";
        }
      })
      .catch(function (err) {
        if (loading) loading.classList.remove("visible");
        if (startBtn) startBtn.disabled = false;
        var msg = (err && err.message) || "Something went wrong. Try again.";
        showError(msg);
      });
  }

  /* Multi-platform paste: a link from ANY host. The engine (yt-dlp) reads it
     through the same /api/info endpoint (?u=) and returns the same dashboard
     shape as a YouTube lookup, so every platform gets the exact same real
     result card — and the download/transcript/thumbnail calls below use the
     same ?u= form. No fake data, no promises of features the host does not
     have. */
  function runUrl(url) {
    /* Reuse a request already started by paste pre-fetch; drop it afterward
       so a newer link never inherits an old lookup. */
    setTimeout(function () { if (infoPromises) delete infoPromises[url]; }, 120000);
    var loading = $("#loading-line");
    var result = $("#result-card");
    var startBtn = $("#start-btn");
    hideError();
    if (result) result.classList.remove("visible");
    if (loading) {
      loading.classList.add("visible");
      var lbl = $(".loading-txt", loading);
      if (lbl) lbl.textContent = "Fetching video details...";
      var t0 = Date.now();
      var timer = setInterval(function () {
        var el = $(".loading-txt", $("#loading-line"));
        if (!el || !$("#loading-line").classList.contains("visible")) { clearInterval(timer); return; }
        var sec = Math.floor((Date.now() - t0) / 1000);
        el.textContent = sec < 8
          ? "Fetching video details... (" + sec + "s)"
          : "Still working — some platforms take a few seconds... (" + sec + "s)";
      }, 1000);
      setTimeout(function () {
        if ($("#loading-line") && loading.classList.contains("visible")) clearInterval(timer);
      }, 60000);
    }
    if (startBtn) startBtn.disabled = true;
    $("#download-status-note") && ($("#download-status-note").textContent = "");

    fetchUrlInfo(url)
      .then(function (data) {
        clearInterval(timer);
        currentMeta = data;
        selectedQuality = null;
        currentType = "video";
        renderResult(data);
        saveRecent(data);
        if (loading) loading.classList.remove("visible");
        if (startBtn) startBtn.disabled = false;
      })
      .catch(function (err) {
        clearInterval(timer);
        if (loading) loading.classList.remove("visible");
        if (startBtn) startBtn.disabled = false;
        var msg = (err && err.message) || "This link could not be read. Try another link.";
        showError(msg);
      });
  }

  /* Own API for a full URL — fast by design:
       • one request in flight per URL (a paste pre-fetch and the same click
         share the same promise, so a second click never restarts the wait),
       • one retry ONLY on the signals of a cold Render boot (5xx or network
         failure) — a 4xx/validation error is final and instant,
       • never stacks timeouts: worst case is one budget, not two.
     No public-resolver fallback for non-YouTube platforms (Invidious only
     knows YouTube), so failures are honest and immediate. */
  var infoPromises = {};
  function fetchUrlInfo(url) {
    if (infoPromises[url]) return infoPromises[url];
    infoPromises[url] = rawFetchInfo(url)
      .catch(function (err) {
        var bootish = !err.status || err.status >= 500;   // network drop or server cold-start
        if (!bootish) throw err;
        return new Promise(function (resolve) { setTimeout(resolve, 800); })
          .then(function () { return rawFetchInfo(url); });
      })
      .then(function (data) {
        delete infoPromises[url];
        return data;
      })
      .catch(function (err) {
        delete infoPromises[url];
        throw err;
      });
    return infoPromises[url];
  }

  function rawFetchInfo(url, attempt) {
    return withTimeout(
      fetch(API_BASE + "/api/info?u=" + encodeURIComponent(url)).then(function (r) {
        if (!r.ok) {
          var e = new Error("API returned " + r.status);
          e.status = r.status;
          throw e;
        }
        return r.json();
      }),
      OWN_API_TIMEOUT_MS
    )
      .then(function (data) {
        if (data && data.error) {
          var e = new Error(data.error);
          e.status = 400;
          throw e;
        }
        if (!data || !data.ok) {
          var e2 = new Error("own-api-unavailable");
          e2.status = 502;
          throw e2;
        }
        data.source = "own";
        data.videoId = data.videoId || "savetube";
        if (!data.formats && Array.isArray(data.qualities)) {
          var f = [];
          data.qualities.forEach(function (q) {
            f.push({
              type: "video",
              quality: String(q.value),
              qualityLabel: q.label,
              note: q.sizeText ? q.sizeText : (q.fps ? q.fps + " fps" : "MP4"),
              url: null
            });
          });
          var bits = Array.isArray(data.audioBitrates) ? data.audioBitrates : [];
          f = f.concat(bits.map(function (b) {
            return { type: "audio", quality: String(b), qualityLabel: b + " kbps", note: "MP3", url: null };
          }));
          data.formats = f;
        }
        if (!data.qualities || !data.qualities.length) {
          if (!data.formats || !data.formats.length) throw new Error("No playable formats found for this link.");
        }
        data.sourceUrl = data.sourceUrl || url;
        return data;
      });
  }

  /* Own API first, then one retry, then a fast public resolver. The own
     engine now answers quickly too (Invidious fast-path first, cached, with
     a 25s budget on the rare cold extract), so the public resolver is only a
     rescue when the engine is down, and single-instance so a dead instance
     cannot stall us. The retry covers a cold Render boot or a transient
     rate-limit on the very first /api/info call. */
  function fetchInfoFast(id) {
    return fetchOwn(id)
      .then(function (data) {
        return data;
      })
      .catch(function () {
        return new Promise(function (resolve) { setTimeout(resolve, 1200); })
          .then(function () { return fetchOwn(id); });
      })
      .then(function (data) {
        if (!data || !data.formats || !data.formats.length) throw new Error("own-api-unavailable");
        return data;
      })
      .catch(function () {
        return fetchPiped(id).then(function (data) {
          if (!data || !data.formats || !data.formats.length) throw new Error("No playable formats found for this video. Try another video.");
          return data;
        });
      });
  }

  function fetchOwn(id) {
    return withTimeout(
      fetch(API_BASE + "/api/info?v=" + encodeURIComponent(id)).then(function (r) {
        if (!r.ok) throw new Error("API returned " + r.status);
        return r.json();
      }),
      OWN_API_TIMEOUT_MS
    ).then(function (data) {
      if (data && data.error) throw new Error(data.error);
      data.source = "own";
      data.videoId = data.videoId || id;
      // Our engine reports the real ladder as `qualities` + `audioBitrates`;
      // expose it the way the rest of the UI expects (formats[]) so videos
      // keep THEIR real heights — no fake 4K buttons for a 360p-only clip.
      if (!data.formats && Array.isArray(data.qualities)) {
        var f = [];
        data.qualities.forEach(function (q) {
          f.push({
            type: "video",
            quality: String(q.value),
            qualityLabel: q.label,
            note: q.sizeText ? q.sizeText : (q.fps ? q.fps + " fps" : "MP4"),
            url: null
          });
        });
        var bits = Array.isArray(data.audioBitrates) ? data.audioBitrates : [];
        f = f.concat(bits.map(function (b) {
          return { type: "audio", quality: String(b), qualityLabel: b + " kbps", note: "MP3", url: null };
        }));
        data.formats = f;
      }
      if (!data.formats || !data.formats.length) throw new Error("own-api-unavailable");
      return data;
    });
  }

  function fetchPiped(id) {
    var i = 0;
    function tryNext() {
      if (i >= PIPED_INSTANCES.length) return Promise.reject(new Error("YouTube is blocking our server right now. Wait a minute and press Start again — it usually goes through on retry."));
      var base = PIPED_INSTANCES[i++];
      return withTimeout(
        fetch(base + "/" + encodeURIComponent(id) + "?fields=title,author,lengthSeconds,formatStreams,adaptiveFormats"),
        5000
      )
        .then(function (r) { if (!r.ok) throw new Error("resolver error"); return r.json(); })
        .then(function (j) { return normalizeInvidious(j, id); })
        .catch(function () { return tryNext(); });
    }
    return tryNext();
  }

  /* Invidious JSON -> the format list the UI renders. Only REAL streams with
     playable URLs end up here; no invented resolutions. */
  function normalizeInvidious(j, id) {
    if (!j || j.error) throw new Error("resolver error");
    var formats = [];
    function isMuxed(s) {
      return (s.hasVideo && s.hasAudio) ||
        /codecs="[^"]*(avc1|avc3|vp9|av01)[^"]*,[^"]*(mp4a|opus|ac-3)[^"]*"/.test(String(s.type || ""));
    }
    var muxed = (j.formatStreams || []).filter(function (s) { return s.url && isMuxed(s); });
    var vids = (j.adaptiveFormats || []).filter(function (s) { return s.url && s.type && s.type.indexOf("video") === 0; });
    var auds = (j.adaptiveFormats || []).filter(function (s) { return s.url && s.type && s.type.indexOf("audio") === 0; });
    // Muxed MP4s first: a complete file with sound in one download.
    muxed.forEach(function (s) {
      formats.push({ type: "video", quality: String(parseQuality(s.qualityLabel)), qualityLabel: s.qualityLabel, note: "MP4", url: s.url });
    });
    // Video-only streams from adaptive formats, flagged honestly.
    vids.forEach(function (s) {
      var q = parseQuality(s.qualityLabel);
      var exists = formats.some(function (f) { return f.type === "video" && parseQuality(f.quality) === q; });
      if (!exists) formats.push({ type: "video", quality: String(q), qualityLabel: s.qualityLabel + " (video only)", note: "No audio", url: s.url });
    });
    // Audio streams: real bitrate label from the stream.
    auds.forEach(function (s) {
      var bitrate = s.bitrate || 128000;
      var kbps = String(Math.round(bitrate / 1000));
      var exists = formats.some(function (f) { return f.type === "audio" && f.quality === kbps; });
      if (!exists) formats.push({ type: "audio", quality: kbps, qualityLabel: kbps + " kbps", note: "M4A", url: s.url });
    });
    formats.sort(function (a, b) { return parseQuality(b.quality) - parseQuality(a.quality); });
    return {
      source: "piped",
      videoId: id,
      title: j.title || "Video",
      author: j.author || "",
      views: j.viewCount != null ? j.viewCount : null,
      durationText: j.lengthSeconds != null ? formatDuration(j.lengthSeconds) : "",
      thumbnail: "https://i.ytimg.com/vi/" + id + "/hqdefault.jpg",
      formats: formats
    };
  }
  function parseQuality(q) {
    /* "2160p60" -> 2160, "720p" -> 720, "60" -> 60. Take the height that
       appears before the optional "p<fps>" suffix. */
    var m = String(q).match(/(\d+)\s*p/i);
    var n = parseInt(m ? m[1] : String(q).replace(/[^0-9]/g, ""), 10);
    return isNaN(n) ? 0 : n;
  }
  function formatDuration(sec) {
    sec = Math.round(sec);
    var h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), s = sec % 60;
    var mm = h ? String(m).padStart(2, "0") : String(m);
    var ss = String(s).padStart(2, "0");
    return h ? h + ":" + mm + ":" + ss : mm + ":" + ss;
  }

  function withTimeout(promise, ms) {
    return new Promise(function (resolve, reject) {
      var t = setTimeout(function () { reject(new Error("timeout")); }, ms);
      promise.then(function (v) { clearTimeout(t); resolve(v); }, function (e) { clearTimeout(t); reject(e); });
    });
  }

  function renderResult(data) {
    var result = $("#result-card");
    if (!result) return;
    result.classList.add("visible");
    var thumb = $("#result-thumb");
    if (thumb) {
      var generic = !!(data.generic || (data.platform && data.platform !== "youtube") || data.sourceUrl);
      // Generic platforms: the source thumbnail CDN may block hotlinking, so
      // serve the image bytes through our own domain (real pixels, no fake).
      thumb.src = generic && data.sourceUrl
        ? API_BASE + "/api/thumbnail?u=" + encodeURIComponent(data.sourceUrl)
        : (data.thumbnail || ("https://i.ytimg.com/vi/" + data.videoId + "/hqdefault.jpg"));
    }
    var title = $("#result-title");
    if (title) title.textContent = data.title || "Untitled video";
    var channel = $("#result-channel");
    if (channel) {
      channel.textContent = data.author || "";
      // Show the detected platform so visitors know the reader worked.
      var platEl = $("#result-platform");
      if (platEl) {
        var p = data.platform;
        platEl.textContent = p && p !== "youtube" ? p.toUpperCase() : "";
        platEl.classList.toggle("visible", !!(p && p !== "youtube"));
      }
    }
    var viewsEl = $("#result-views"); if (viewsEl) viewsEl.textContent = formatViews(data.views);
    var durEl = $("#result-dur"); if (durEl) durEl.textContent = data.durationText || "";
    currentType = "video"; // every new result opens on the Video panel
    renderTabs(data);
    renderQualities(data);
    renderThumbs(data);
    var transEl = $("#result-transcript");
    if (transEl) transEl.style.display = "none";
    var body = $("#transcript-body");
    if (body) { delete body.dataset.loaded; body.innerHTML = ""; }
    var tools = $("#transcript-tools");
    if (tools) tools.hidden = true;
  }

  function formatViews(n) {
    if (n == null) return "";
    n = Number(n);
    if (n >= 1e6) return (n / 1e6).toFixed(1).replace(/\.0$/, "") + "M views";
    if (n >= 1e3) return (n / 1e3).toFixed(1).replace(/\.0$/, "") + "K views";
    return n + " views";
  }

  /* ---- Recent downloads (brings visitors back) ----
     Every successful lookup is remembered on this device. The strip under
     the result card shows the last 8 with one-click re-lookup, so a visitor
     who saved something yesterday is two taps away from saving it again. */
  var RECENT_KEY = "savetube_recent_v1";
  var RECENT_MAX = 8;

  function readRecent() {
    try {
      var a = JSON.parse(window.localStorage.getItem(RECENT_KEY) || "[]");
      return Array.isArray(a) ? a : [];
    } catch (e) { return []; }
  }

  function saveRecent(data) {
    if (!data || !data.videoId || (data.ok === false)) return;
    var url = (data.sourceUrl || ("https://www.youtube.com/watch?v=" + data.videoId));
    var entry = {
      id: data.videoId,
      url: url,
      title: (data.title || "Saved video").slice(0, 90),
      platform: data.platform || "youtube",
      thumb: data.thumbnail || (data.platform && data.platform !== "youtube" && data.sourceUrl
        ? API_BASE + "/api/thumbnail?u=" + encodeURIComponent(data.sourceUrl)
        : "https://i.ytimg.com/vi/" + data.videoId + "/hqdefault.jpg"),
      at: Date.now()
    };
    var list = readRecent().filter(function (x) { return x.id !== entry.id; });
    list.unshift(entry);
    list = list.slice(0, RECENT_MAX);
    try { window.localStorage.setItem(RECENT_KEY, JSON.stringify(list)); } catch (e) {}
    renderRecent();
  }

  function renderRecent() {
    var strip = $("#recent-strip");
    if (!strip) return;
    var list = readRecent();
    if (!list.length) { strip.hidden = true; strip.innerHTML = ""; return; }
    strip.hidden = false;
    var head = document.createElement("div");
    head.className = "recent-head";
    head.textContent = "Recent";
    var row = document.createElement("div");
    row.className = "recent-row";
    list.forEach(function (item) {
      var b = document.createElement("button");
      b.type = "button";
      b.className = "recent-chip";
      b.setAttribute("aria-label", "Re-open " + item.title);
      var img = document.createElement("img");
      img.loading = "lazy";
      img.width = 96;
      img.height = 54;
      img.alt = "";
      img.src = item.thumb;
      img.onerror = function () { img.style.visibility = "hidden"; };
      var txt = document.createElement("span");
      txt.className = "recent-txt";
      txt.textContent = item.title;
      b.appendChild(img);
      b.appendChild(txt);
      b.addEventListener("click", function () {
        var input = $("#url-input");
        if (input) input.value = item.url;
        hideError();
        if (item.platform && item.platform !== "youtube") {
          runUrl(item.url);
        } else {
          runDownload(item.id);
        }
        scrollToResult();
      });
      row.appendChild(b);
    });
    strip.innerHTML = "";
    strip.appendChild(head);
    strip.appendChild(row);
  }

  document.addEventListener("DOMContentLoaded", function () { renderRecent(); });

  /* Tabs are bound once; renderTabs only restores the right active state. */
  var tabsBound = false;
  function renderTabs(data) {
    if (!tabsBound) {
      tabsBound = true;
      $$(".q-tab").forEach(function (tab) {
        tab.addEventListener("click", function () {
          currentType = tab.getAttribute("data-type");
          selectedQuality = null;
          $$(".q-tab").forEach(function (t) {
            var on = t === tab;
            t.classList.toggle("active", on);
            t.setAttribute("aria-selected", on ? "true" : "false");
          });
          showPanel(currentType);
          if (currentType === "video" || currentType === "audio") {
            renderQualities(data);
            updateDownloadBtn();
          }
          if (currentType === "transcript" && !$("#transcript-body").dataset.loaded && currentMeta) {
            loadTranscript(currentMeta.videoId);
          }
        });
      });
    }
    $$(".q-tab").forEach(function (t) {
      var on = t.getAttribute("data-type") === (currentType || "video");
      t.classList.toggle("active", on);
      t.setAttribute("aria-selected", on ? "true" : "false");
    });
    showPanel(currentType || "video");
  }

  /* Show exactly one of the four result panels (video / audio / transcript
     / thumbnail). The download button row lives outside the panels and is
     only meaningful for the two media types. */
  function showPanel(type) {
    $$(".g-panel").forEach(function (p) {
      p.hidden = p.getAttribute("data-panel") !== type;
    });
    var dl = document.querySelector(".dl-btn-line");
    if (dl) dl.style.display = (type === "transcript" || type === "thumbnail") ? "none" : "flex";
  }

  function renderQualities(data) {
    var current = currentType || "video";
    var isAudio = current === "audio";
    var items = (data.formats || []).filter(function (f) { return f.type === current; });
    /* NO fake ladder. If the engine returned no real format of this type,
       the visitor sees a true message and a working retry — never a button
       that pretends to download something we do not have. */
    var grid = isAudio ? $("#a-grid") : $("#q-grid");
    if (!grid) return;
    grid.innerHTML = "";
    if (!items.length) {
      var empty = document.createElement("p");
      empty.className = "q-empty";
      empty.textContent = "No " + (current === "audio" ? "audio" : "video") + " format available for this video. Try another video or refresh.";
      grid.appendChild(empty);
      selectedQuality = null;
      updateDownloadBtn();
      return;
    }
    items.forEach(function (item) {
      var el = document.createElement("button");
      el.className = "q-item";
      el.type = "button";
      el.setAttribute("role", "radio");
      el.setAttribute("aria-checked", "false");
      el.innerHTML = "<b>" + escapeHtml(item.qualityLabel || item.quality) + "</b><span>" + escapeHtml(item.note || "") + "</span><span class='check' aria-hidden='true'>&#10003;</span>";
      el.addEventListener("click", function () {
        selectedQuality = item;
        $$(".q-item", grid).forEach(function (i) { i.classList.remove("selected"); i.setAttribute("aria-checked", "false"); });
        el.classList.add("selected");
        el.setAttribute("aria-checked", "true");
        updateDownloadBtn();
      });
      grid.appendChild(el);
    });
    if (items.length) {
      /* Speed default: 320kbps takes the longest to convert on the server.
         Preselect 128kbps (same song, much faster file) for audio; the full
         ladder stays one tap away. Video keeps the first (best) entry. */
      var defItem = items[0];
      var defEl = grid.firstElementChild;
      if (isAudio) {
        for (var di = 0; di < items.length; di++) {
          if (String(items[di].quality) === "128") { defItem = items[di]; break; }
        }
        if (defItem !== items[0]) {
          var kids = grid.children;
          for (var ki = 0; ki < kids.length; ki++) {
            var b = kids[ki].querySelector("b");
            if (b && b.textContent.indexOf("128") === 0) { defEl = kids[ki]; break; }
          }
        }
      }
      selectedQuality = defItem;
      if (defEl) { defEl.classList.add("selected"); defEl.setAttribute("aria-checked", "true"); }
    }
    updateDownloadBtn();
  }

  /* REAL thumbnail downloads — every button hits /api/thumbnail which proxies
   the real image bytes from YouTube's CDN and sends them as a file
   attachment. Sizes are the actual YouTube timeline variants. */
  var THUMB_SIZES = [
    { key: "maxres", label: "Max 1280\u00d7720" },
    { key: "sd", label: "SD 640\u00d7480" },
    { key: "hq", label: "HQ 480\u00d7360" },
    { key: "mq", label: "MQ 320\u00d7180" },
    { key: "default", label: "Default 120\u00d790" }
  ];
  function renderThumbs(data) {
    var box = $("#thumb-sizes");
    if (!box) return;
    var isGeneric = !!(data.generic || (data.platform && data.platform !== "youtube") || data.sourceUrl);
    box.innerHTML = "";
    if (isGeneric) {
      // One real thumbnail, straight from the platform's own metadata.
      var a = document.createElement("a");
      a.className = "thumb-size-btn";
      a.href = API_BASE + "/api/thumbnail?u=" + encodeURIComponent(data.sourceUrl || data.videoId);
      a.download = "";
      a.textContent = "Source image";
      a.setAttribute("aria-label", "Download the source thumbnail image");
      box.appendChild(a);
      return;
    }
    if (!data.videoId) return;
    THUMB_SIZES.forEach(function (s) {
      var a = document.createElement("a");
      a.className = "thumb-size-btn";
      a.href = API_BASE + "/api/thumbnail?v=" + encodeURIComponent(data.videoId) + "&size=" + s.key;
      a.download = "";
      a.textContent = s.label;
      a.setAttribute("aria-label", "Download thumbnail " + s.label);
      box.appendChild(a);
    });
  }

  function updateDownloadBtn() {
    var btn = $("#download-btn");
    if (!btn) return;
    btn.disabled = !(selectedQuality && currentMeta);
    var shareBtn = $("#share-btn");
    if (shareBtn) shareBtn.disabled = !currentMeta;
  }

  function initShare() {
    var btn = $("#share-btn");
    if (!btn) return;
    btn.addEventListener("click", function () {
      if (!currentMeta) return;
      var isGeneric = !!(currentMeta.generic || (currentMeta.platform && currentMeta.platform !== "youtube") || currentMeta.sourceUrl);
      var url = isGeneric && currentMeta.sourceUrl
        ? currentMeta.sourceUrl
        : "https://youtu.be/" + encodeURIComponent(currentMeta.videoId);
      var title = currentMeta.title || "SaveTube video";
      var text = title + " — download it free on SaveTube";
      if (navigator.share) {
        navigator.share({ title: title, text: text, url: url }).catch(function () {});
        return;
      }
      var done = function () {
        var note = $("#download-status-note");
        if (note) note.textContent = "Link copied to clipboard!";
      };
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(url).then(done, function () {});
        return;
      }
      var ta = document.createElement("textarea");
      ta.value = url;
      ta.style.position = "fixed";
      ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.select();
      try { document.execCommand("copy"); done(); } catch (e) {}
      document.body.removeChild(ta);
    });
  }

  /* Fires the unlock direct-link ad (SITE_CONFIG.unlockMode / adUnlockUrl)
     on a real download click: opens the network smartlink in a new tab AND
     lets the download proceed — instant mode, no modal, nothing blocked.
     Gated by consent, and throttled so repeated clicks do not spam tabs. */
  var lastUnlockTs = 0;
  function fireUnlockAd() {
    try {
      var cfg = window.SITE_CONFIG || {};
      var mode = cfg.unlockMode || "off";
      if (mode === "off") return;
      var adUrl = cfg.adUnlockUrl || "";
      if (!/^https?:\/\//i.test(adUrl)) return;
      if (!consentGiven()) return;
      var now = Date.now();
      if (now - lastUnlockTs < 45000) return;   // max one per ~45s
      lastUnlockTs = now;
      window.open(adUrl, "_blank", "noopener");
    } catch (e) {}
  }

  function bindDownload() {
    var btn = $("#download-btn");
    if (!btn) return;
    btn.addEventListener("click", function () {
      if (!currentMeta || !selectedQuality) return;
      // Monetization on the click: a real visitor click is worth much more
      // than an auto-load, so the one-per-session zone fires right here,
      // under the download. The download itself still opens normally in its
      // own tab, so the visitor gets their file AND nothing is blocked.
      tryLoadZoneAds();
      fireUnlockAd();
      var url;
      var isGeneric = !!(currentMeta.generic || (currentMeta.platform && currentMeta.platform !== "youtube") || currentMeta.sourceUrl);
      var idArg = isGeneric
        ? "u=" + encodeURIComponent(currentMeta.sourceUrl || currentMeta.videoId)
        : "v=" + encodeURIComponent(currentMeta.videoId);
      var fileExt = currentType === "audio" ? "mp3" : "mp4";
      var fileLabel = currentType === "audio"
        ? (selectedQuality.quality || "128") + "kbps"
        : (selectedQuality.quality || "video") + "p";
      var safeId = String(currentMeta.videoId || "media").replace(/[^A-Za-z0-9_-]/g, "").slice(0, 24) || "media";
      if (currentType === "audio") {
        // High-quality MP3: always route through the server, which converts
        // with ffmpeg at the requested bitrate (and has its own resolver
        // fallback, so this works even when this browser cannot reach one).
        url = API_BASE + "/api/download?" + idArg +
          "&type=audio&bitrate=" + encodeURIComponent(selectedQuality.quality || "128");
      } else {
        // ALWAYS through the server: it sets Content-Disposition attachment
        // (real auto-download, never a raw-streaming tab), merges video+audio
        // into one mp4, picks the watermark-free format and keeps a disk cache
        // so repeat visitors get the file instantly. Direct stream URLs are
        // never opened in a tab — video-only itag, no audio, no download.
        url = API_BASE + "/api/download?" + idArg +
          "&type=video&quality=" + encodeURIComponent(selectedQuality.quality);
      }
      /* AUTO-SAVE to the device: a same-origin anchor with the download
         attribute makes the browser save the file straight to Downloads —
         no new tab, no player page, nothing the visitor has to figure out.
         (window.open fallback stays for the rare blocked case.) */
      var fname = "savetube-" + safeId + "-" + String(fileLabel).replace(/[^A-Za-z0-9._-]+/g, "") + "." + fileExt;
      var a = document.createElement("a");
      a.href = url;
      a.setAttribute("download", fname);
      a.rel = "noopener";
      document.body.appendChild(a);
      a.click();
      setTimeout(function () { if (a.parentNode) a.parentNode.removeChild(a); }, 4000);
      var btn2 = $("#download-btn");
      if (btn2) {
        var orig = btn2.innerHTML;
        btn2.disabled = true;
        btn2.innerHTML = "Saving... check your Downloads folder";
        setTimeout(function () {
          btn2.disabled = false;
          try { btn2.innerHTML = orig; } catch (e) {}
          updateDownloadBtn();
        }, 6000);
      }
    });
  }

  /* ============ TRANSCRIPT (fetched from our own API, rendered in-page) ============ */
  /* Transcript is its own tab now: the panel auto-loads when the visitor
     opens it (renderTabs -> loadTranscript). Tools are bound once here. */
  function bindTranscript() {
    bindTranscriptTools();
  }

  var lastLines = [];
  var transcriptAbort = null;
  function loadTranscript(id) {
    var body = $("#transcript-body");
    if (!body) return;
    if (transcriptAbort) { try { transcriptAbort.abort(); } catch (e) {} }
    transcriptAbort = ("AbortController" in window) ? new AbortController() : null;
    body.dataset.loaded = "1";
    body.style.display = "block";
    var msgEl = function () { return $("#transcript-body .transcript-muted"); };
    body.innerHTML = '<p class="transcript-muted">Reading captions...</p>';
    /* Honest staged progress: caption reads take seconds, the speech engine
       (videos with zero captions) takes longer. The visitor always sees
       where it stands instead of a dead spinner. */
    var stageTimers = [];
    stageTimers.push(setTimeout(function () {
      var m = msgEl();
      if (m) m.textContent = "No captions found - listening to the audio (this takes a little while)...";
    }, 9000));
    stageTimers.push(setTimeout(function () {
      var m = msgEl();
      if (m) m.textContent = "Still listening - long videos take up to a minute. Stay here, it is working...";
    }, 30000));
    stageTimers.push(setTimeout(function () {
      var m = msgEl();
      if (m) m.textContent = "Almost there - finishing the last lines...";
    }, 90000));
    var clearStages = function () { stageTimers.forEach(function (t) { clearTimeout(t); }); };
    var isGeneric = !!(currentMeta && (currentMeta.generic || (currentMeta.platform && currentMeta.platform !== "youtube") || currentMeta.sourceUrl));
    var apiQuery = isGeneric && currentMeta
      ? "u=" + encodeURIComponent(currentMeta.sourceUrl || id)
      : "v=" + encodeURIComponent(id);
    var fetchOpts = transcriptAbort ? { signal: transcriptAbort.signal } : {};
    /* Hard stop at 4 minutes: the server caps the listen, so anything slower
       is a dead connection, not a slow one. The visitor gets a retry, not
       an eternal spinner. */
    var hardStop = setTimeout(function () {
      if (transcriptAbort) { try { transcriptAbort.abort(); } catch (e) {} }
    }, 240000);
    fetch(API_BASE + "/api/transcript?" + apiQuery, fetchOpts)
      .then(function (r) { return r.json(); })
      .then(function (j) {
        clearTimeout(hardStop);
        clearStages();
        if (!j || !j.ok || !j.lines || !j.lines.length) {
          throw new Error((j && j.error) ? j.error : "No transcript available for this video.");
        }
        lastLines = j.lines;
        var tools = $("#transcript-tools");
        if (tools) tools.hidden = false;
        renderTranscriptLines();
        if (j.partial) {
          var note = document.createElement("p");
          note.className = "transcript-muted";
          note.textContent = "Showing the opening minutes of a long video.";
          body.insertBefore(note, body.firstChild);
        }
      })
      .catch(function (err) {
        clearTimeout(hardStop);
        clearStages();
        var msg = (err && err.name === "AbortError")
          ? "The transcript took too long and was stopped. Tap the Transcript tab again to retry."
          : ((err && err.message) || "No transcript could be loaded for this video.");
        body.innerHTML = '<p class="transcript-muted">' + escapeHtml(msg) + "</p>";
        if (msg.indexOf("captions") === -1) delete body.dataset.loaded; // allow one retry
      });
  }

  /* Re-render the loaded lines honouring the Show-timeline checkbox. */
  function renderTranscriptLines() {
    var body = $("#transcript-body");
    if (!body) return;
    var showTl = $("#tl-toggle") ? $("#tl-toggle").checked : true;
    var frag = document.createDocumentFragment();
    lastLines.forEach(function (line) {
      var row = document.createElement("div");
      row.className = "t-line";
      var t = document.createElement("span");
      t.className = "t-time" + (showTl ? "" : " hidden");
      t.textContent = fmtClock(line.t);
      var txt = document.createElement("p");
      txt.textContent = line.text;
      row.appendChild(t);
      row.appendChild(txt);
      frag.appendChild(row);
    });
    body.innerHTML = "";
    body.appendChild(frag);
  }

  function bindTranscriptTools() {
    var tl = $("#tl-toggle");
    if (tl) {
      tl.addEventListener("change", function () {
        renderTranscriptLines();
      });
    }
    var copyBtn = $("#copy-transcript-btn");
    if (copyBtn) {
      copyBtn.addEventListener("click", function () {
        if (!lastLines.length) return;
        // Monetization: when a transcript ad link is configured the button
        // opens it (one tab) and still copies the text — the visitor keeps
        // the transcript, the site earns a view.
        try {
          var cfg = window.SITE_CONFIG || {};
          var adUrl = pickSmartlink();
          if (/^https?:\/\//i.test(adUrl) && consentGiven()) {
            var since = Date.now();
            try { since = sessionStorage.getItem("savetube_transcript_ad") || 0; } catch (e) {}
            if (Date.now() - Number(since) > 60000) {
              try { sessionStorage.setItem("savetube_transcript_ad", String(Date.now())); } catch (e) {}
              window.open(adUrl, "_blank", "noopener");
            }
          }
        } catch (e) {}
        var includeTl = $("#tl-toggle") ? $("#tl-toggle").checked : true;
        var text = lastLines
          .map(function (l) {
            return includeTl ? fmtClock(l.t) + "  " + l.text : l.text;
          })
          .join("\n");
        var ok = $("#copy-ok");
        var done = function () {
          if (ok) ok.textContent = "Copied " + lastLines.length + " lines";
          setTimeout(function () { if (ok) ok.textContent = ""; }, 2200);
        };
        var fail = function () {
          if (ok) ok.textContent = "Press Ctrl+C to copy";
          setTimeout(function () { if (ok) ok.textContent = ""; }, 2200);
        };
        if (navigator.clipboard && navigator.clipboard.writeText) {
          navigator.clipboard.writeText(text).then(done, fail);
        } else {
          var ta = document.createElement("textarea");
          ta.value = text;
          ta.style.position = "fixed";
          ta.style.opacity = "0";
          document.body.appendChild(ta);
          ta.select();
          try { document.execCommand("copy"); done(); } catch (e) { fail(); }
          ta.remove();
        }
      });
    }
  }

  function fmtClock(sec) {
    sec = Math.floor(sec || 0);
    var h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), s = sec % 60;
    var mm = h ? String(m).padStart(2, "0") : String(m);
    var ss = String(s).padStart(2, "0");
    return h ? h + ":" + mm + ":" + ss : mm + ":" + ss;
  }

  function showError(msg) {
    var box = $("#error-box");
    if (!box) return;
    box.textContent = msg;
    box.classList.add("visible");
  }
  function hideError() {
    var box = $("#error-box");
    if (box) box.classList.remove("visible");
  }
  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }

  function wireActions() {
    bindDownload();
    bindTranscript();
    bindTranscriptTools();
    initShare();
  }
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", wireActions);
  } else {
    wireActions();
  }
})();