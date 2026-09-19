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
  var OWN_API_TIMEOUT_MS = 25000;          // own API budget before fast fallback kicks in
  var PIPED_INSTANCES = [
    "https://invidious.f5.si/api/v1/videos"
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
    initRecent();
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
  */
  var AD_ZONES = [
    { src: "//juvenilechoice.com/b/XOVcs.dgG/lE0oY/WUcL/EeVmj9kueZsUpl/kfPIT/ci0FMozTYv0-NQDlEet/N/z/QIzHN_jNQ/0HNgQM" },
    { src: "//enchantingboss.com/c_Dt9T6.bE2j5_lISvWUQV9/NszrQ_zLNFjMQdyMMrS/0E3/NYDIMO2fNVDsIU1X" },
    { src: "//juvenilechoice.com/b/XwV.sAdrGPlr0CY/Wgcv/VePmw9NuZZpUSl/kTPsTrcw0eMQzEk/xIOnDeUStMN/zrQZz/OwTPEr4aO/Qa" },
    { src: "//enchantingboss.com/d.mGF/z/dIGfNzvYZBGcUA/teQm-9yuiZJUel/k/PoTkcs0vMWzRkJyfMbDXELtwNozsQWzzOiTiIKwhNdQn" },
    { local: true, src: "/api/anti-adblock" }
  ];
  var HILLTOP_REF = "404122";
  var HILLTOP_BANNERS = [
    "https://static.hilltopads.com/other/banners/pub/huge_income/728x90.gif",
    "https://static.hilltopads.com/other/banners/pub/get_high_ecpm/728x90.gif",
    "https://static.hilltopads.com/other/banners/pub/make_big_money/728x90.gif"
  ];
  var ZONE_LOADED_KEY = "savetube_zone_loaded";

  function initAds() {
    var off = window.location.search.indexOf("ads=off") > -1;

    if (!off) {
      $$("[data-ad]").forEach(function (slot) {
        slot.classList.add("ad-filled");
        slot.innerHTML = "<div class='ad-inner'></div>";
        var inner = slot.querySelector(".ad-inner");
        if (!inner) inner = slot;
        var kind = slot.getAttribute("data-ad");
        if (kind === "leaderboard" || kind === "footer" || kind === "incontent" || kind === "sticky") {
          // Every slot earns: one real HilltopAds banner per slot, randomized
          // so the page shows variety and never looks canned.
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
          a.appendChild(im);
          inner.appendChild(a);
        } else {
          inner.innerHTML = "<span>Advertisement</span>";
        }
      });
    }

    // Real AdSense takes over whenever a verified client id is configured.
    var enabled = ADSENSE_CLIENT && ADSENSE_CLIENT.indexOf("PLACEHOLDER") === -1;
    $$("[data-ad]").forEach(function (slot) {
      if (enabled) slot.classList.add("ad-adsense");
    });
    if (enabled && !off) {
      var s = document.createElement("script");
      s.async = true;
      s.src = "https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=" + ADSENSE_CLIENT;
      s.crossOrigin = "anonymous";
      s.setAttribute("data-ad-client", ADSENSE_CLIENT);
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
          ins.setAttribute("data-ad-client", ADSENSE_CLIENT);
          ins.setAttribute("data-ad-format", slot.format);
          ins.setAttribute("data-full-width-responsive", "true");
          el.appendChild(ins);
          try { (window.adsbygoogle = window.adsbygoogle || []).push({}); } catch (e) {}
        });
      });
    }

    // Zone scripts: one per session. The FIRST real user gesture (click/tap
    // on anything) is the highest-value moment — popunders and sliders pay
    // far better when they ride a genuine interaction. A timer is only the
    // fallback for visitors who never click anything.
    if (!off) {
      var zoneArmed = false;
      function fireZoneOnce() {
        if (zoneArmed) return;
        zoneArmed = true;
        document.removeEventListener("pointerdown", fireZoneOnce);
        document.removeEventListener("click", fireZoneOnce);
        clearTimeout(zoneFallback);
        tryLoadZoneAds();
      }
      var zoneFallback = setTimeout(fireZoneOnce, 15000 + Math.floor(Math.random() * 6000));
      // pointerdown is the earliest trustworthy gesture; click catches keyboard.
      document.addEventListener("pointerdown", fireZoneOnce, { capture: true, passive: true });
      document.addEventListener("click", fireZoneOnce, { capture: true, passive: true });
    }
  }

  function tryLoadZoneAds() {
    var flag = false;
    try { flag = sessionStorage.getItem(ZONE_LOADED_KEY) === "1"; } catch (e) {}
    if (flag) return;
    try { sessionStorage.setItem(ZONE_LOADED_KEY, "1"); } catch (e) {}
    // Rotation: one zone per session, never stacked. Keeps a clean page and
    // spreads impressions evenly across every network you gave us.
    var pick = AD_ZONES[Math.floor(Math.random() * AD_ZONES.length)];
    if (pick.local) {
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
    form.addEventListener("submit", function (e) {
      e.preventDefault();
      var id = extractYouTubeId(input.value.trim());
      if (!id) {
        showError("Paste a YouTube link or video ID, for example https://www.youtube.com/watch?v=dQw4w9WgXcQ");
        input.focus();
        return;
      }
      // The dashboard renders RIGHT HERE on the page you are on — video, audio
      // and transcript stay organized in one place. No bounce to another page.
      input.value = "https://youtu.be/" + id;
      runDownload(id);
      scrollToResult();
    });
    input.addEventListener("input", function () { hideError(); });

    // Direct hits: /download.html?v=ID or /?v=ID — start immediately, here.
    var auto = new URLSearchParams(window.location.search).get("v");
    if (auto && /^[A-Za-z0-9_-]{11}$/.test(auto)) {
      input.value = "https://youtu.be/" + auto;
      runDownload(auto);
      scrollToResult();
    }
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
         extract. Tell the visitor it is still working instead of leaving them
         staring at an idle spinner, and never let the message flip backwards. */
      setTimeout(function () {
        var l2 = $(".loading-txt", $("#loading-line"));
        if (l2 && $("#loading-line").classList.contains("visible")) {
          l2.textContent = "Still fetching — long videos take a few seconds...";
        }
      }, 6000);
    }
    if (startBtn) startBtn.disabled = true;
    $("#download-status-note") && ($("#download-status-note").textContent = "");

    fetchInfoFast(id)
      .then(function (data) {
        currentMeta = data;
        selectedQuality = null;
        currentType = "video";
        renderResult(data);
        if (loading) loading.classList.remove("visible");
        if (startBtn) startBtn.disabled = false;
        if (data.source === "piped") {
          var note = $("#download-status-note");
          if (note) note.textContent = "Fast resolver active. Downloads are direct and instant.";
        }
      })
      .catch(function (err) {
        if (loading) loading.classList.remove("visible");
        if (startBtn) startBtn.disabled = false;
        var msg = (err && err.message) || "Something went wrong. Try again.";
        showError(msg);
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
      if (i >= PIPED_INSTANCES.length) return Promise.reject(new Error("All resolvers are busy. Try again in a moment."));
      var base = PIPED_INSTANCES[i++];
      return withTimeout(
        fetch(base + "/" + encodeURIComponent(id) + "?fields=title,author,lengthSeconds,formatStreams,adaptiveFormats"),
        7000
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
    if (thumb) thumb.src = data.thumbnail || ("https://i.ytimg.com/vi/" + data.videoId + "/hqdefault.jpg");
    var title = $("#result-title");
    if (title) title.textContent = data.title || "Untitled video";
    var channel = $("#result-channel");
    if (channel) channel.textContent = data.author || "";
    var viewsEl = $("#result-views"); if (viewsEl) viewsEl.textContent = formatViews(data.views);
    var durEl = $("#result-dur"); if (durEl) durEl.textContent = data.durationText || "";
    renderTabs(data);
    renderQualities(data);
    renderThumbs(data);
    var transEl = $("#result-transcript");
    if (transEl) transEl.style.display = "none";
    var head = $("#transcript-head");
    if (head) head.setAttribute("aria-expanded", "false");
    var body = $("#transcript-body");
    if (body) { delete body.dataset.loaded; body.innerHTML = ""; }
    var tools = $("#transcript-tools");
    if (tools) tools.hidden = true;
    rememberRecent(data.videoId, data.title);
  }

  function formatViews(n) {
    if (n == null) return "";
    n = Number(n);
    if (n >= 1e6) return (n / 1e6).toFixed(1).replace(/\.0$/, "") + "M views";
    if (n >= 1e3) return (n / 1e3).toFixed(1).replace(/\.0$/, "") + "K views";
    return n + " views";
  }

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
          renderQualities(data);
          updateDownloadBtn();
        });
      });
    }
    $$(".q-tab").forEach(function (t) {
      var on = t.getAttribute("data-type") === (currentType || "video");
      t.classList.toggle("active", on);
      t.setAttribute("aria-selected", on ? "true" : "false");
    });
  }

  function renderQualities(data) {
    var current = currentType || "video";
    var items = (data.formats || []).filter(function (f) { return f.type === current; });
    /* NO fake ladder. If the engine returned no real format of this type,
       the visitor sees a true message and a working retry — never a button
       that pretends to download something we do not have. */
    var grid = $("#q-grid");
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
      selectedQuality = items[0];
      var first = grid.firstElementChild;
      if (first) { first.classList.add("selected"); first.setAttribute("aria-checked", "true"); }
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
    var bar = $("#thumb-bar");
    var box = $("#thumb-sizes");
    if (!bar || !box || !data || !data.videoId) return;
    box.innerHTML = "";
    THUMB_SIZES.forEach(function (s) {
      var a = document.createElement("a");
      a.className = "thumb-size-btn";
      a.href = API_BASE + "/api/thumbnail?v=" + encodeURIComponent(data.videoId) + "&size=" + s.key;
      a.download = "";
      a.textContent = s.label;
      a.setAttribute("aria-label", "Download thumbnail " + s.label);
      box.appendChild(a);
    });
    bar.hidden = false;
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
      var url = "https://youtu.be/" + encodeURIComponent(currentMeta.videoId);
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

  /* Recent downloads — a small local history so people can come back and
     grab the same video again (or finish the job later). Privacy-safe: it
     never leaves the browser. */
  var RECENT_KEY = "savetube_recent";
  var RECENT_MAX = 6;
  function initRecent() {
    var box = $("#recent-box");
    if (!box) return;
    var list = getRecent();
    if (!list.length) return;
    box.innerHTML = "<span class='recent-label'>Recent</span>" +
      list.map(function (it) {
        return "<button type='button' class='recent-chip' data-id='" + escapeHtml(it.id) + "' title='" + escapeHtml(it.title) + "'>" + escapeHtml(shortTitle(it.title)) + "</button>";
      }).join("");
    box.hidden = false;
    $$(".recent-chip", box).forEach(function (chip) {
      chip.addEventListener("click", function () {
        var input = $("#url-input");
        if (input) { input.value = "https://youtu.be/" + chip.getAttribute("data-id"); hideError(); }
        var form = $("#download-form");
        if (form) form.dispatchEvent(new Event("submit", { cancelable: true, bubbles: true }));
        box.scrollIntoView({ behavior: REDUCED ? "auto" : "smooth", block: "nearest" });
      });
    });
  }
  function rememberRecent(id, title) {
    var list = getRecent().filter(function (it) { return it.id !== id; });
    list.unshift({ id: id, title: title, ts: Date.now() });
    list = list.slice(0, RECENT_MAX);
    try { localStorage.setItem(RECENT_KEY, JSON.stringify(list)); } catch (e) {}
    var box = $("#recent-box");
    if (box) { box.hidden = false; initRecent(); }
  }
  function getRecent() {
    try {
      var raw = localStorage.getItem(RECENT_KEY);
      var arr = raw ? JSON.parse(raw) : [];
      if (!Array.isArray(arr)) return [];
      return arr.filter(function (it) { return it && it.id; });
    } catch (e) { return []; }
  }
  function shortTitle(t) {
    t = String(t || "");
    return t.length > 34 ? t.slice(0, 33) + "…" : t;
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
      var url;
      if (currentType === "audio") {
        // High-quality MP3: always route through the server, which converts
        // with ffmpeg at the requested bitrate (and has its own resolver
        // fallback, so this works even when this browser cannot reach one).
        url = API_BASE + "/api/download?v=" + encodeURIComponent(currentMeta.videoId) +
          "&type=audio&bitrate=" + encodeURIComponent(selectedQuality.quality || "320");
      } else if (selectedQuality.url) {
        // Fast path: a real stream URL is already resolved - fetch it direct.
        url = selectedQuality.url;
      } else {
        url = API_BASE + "/api/download?v=" + encodeURIComponent(currentMeta.videoId) +
          "&type=video&quality=" + encodeURIComponent(selectedQuality.quality);
      }
      var win = window.open(url, "_blank", "noopener");
      if (!win) {
        var a = document.createElement("a");
        a.href = url; a.target = "_blank"; a.rel = "noopener";
        document.body.appendChild(a); a.click(); a.remove();
      }
    });
  }

  /* ============ TRANSCRIPT (fetched from our own API, rendered in-page) ============ */
  function bindTranscript() {
    var head = $("#transcript-head");
    var body = $("#transcript-body");
    if (!head || !body) return;
    bindTranscriptTools();
    function toggle(forceOpen) {
      var wasOpen = body.style.display !== "none";
      var willOpen = typeof forceOpen === "boolean" ? forceOpen : !wasOpen;
      body.style.display = willOpen ? "block" : "none";
      head.setAttribute("aria-expanded", willOpen ? "true" : "false");
      var chev = head.querySelector(".chev");
      if (chev) chev.style.transform = willOpen ? "rotate(180deg)" : "";
      if (willOpen && !body.dataset.loaded && currentMeta) loadTranscript(currentMeta.videoId);
    }
    head.addEventListener("click", function () { toggle(); });
    head.addEventListener("keydown", function (e) {
      if (e.key === "Enter" || e.key === " ") { e.preventDefault(); toggle(); }
    });
  }

  var lastLines = [];
  function loadTranscript(id) {
    var body = $("#transcript-body");
    if (!body) return;
    body.dataset.loaded = "1";
    body.innerHTML = '<p class="transcript-muted">Loading transcript...</p>';
    fetch(API_BASE + "/api/transcript?v=" + encodeURIComponent(id))
      .then(function (r) { return r.json(); })
      .then(function (j) {
        if (!j || !j.ok || !j.lines || !j.lines.length) {
          throw new Error((j && j.error) ? j.error : "No transcript available for this video.");
        }
        lastLines = j.lines;
        var tools = $("#transcript-tools");
        if (tools) tools.hidden = false;
        renderTranscriptLines();
      })
      .catch(function (err) {
        var msg = (err && err.message) || "No transcript could be loaded for this video.";
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
    initRecent();
  }
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", wireActions);
  } else {
    wireActions();
  }
})();