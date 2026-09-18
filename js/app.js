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
  var OWN_API_TIMEOUT_MS = 7000;            // own API budget before fast fallback kicks in
  var PIPED_INSTANCES = [
    "https://pipedapi.kavin.rocks",
    "https://api.piped.yt",
    "https://pipedapi.adminforge.de"
  ];
  var STATIC_FORMATS = {
    video: [
      { quality: "2160p", label: "2160p", display: "4K", note: "Best quality" },
      { quality: "1440p", label: "1440p", display: "2K", note: "High quality" },
      { quality: "1080p", label: "1080p", display: "Full HD", note: "Most popular" },
      { quality: "720p",  label: "720p",  display: "HD",   note: "Great balance" },
      { quality: "480p",  label: "480p",  display: "SD",   note: "Smaller file" },
      { quality: "360p",  label: "360p",  display: "SD",   note: "Smallest file" }
    ],
    audio: [
      { quality: "320", label: "320 kbps", display: "320", note: "Studio quality" },
      { quality: "256", label: "256 kbps", display: "256", note: "High quality" },
      { quality: "192", label: "192 kbps", display: "192", note: "Standard" },
      { quality: "128", label: "128 kbps", display: "128", note: "Compact" }
    ]
  };

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
        if (kind === "leaderboard" || kind === "footer") {
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

    // Zone scripts: once per session, after the tool is usable (never in review mode).
    if (!off) {
      setTimeout(tryLoadZoneAds, 12000 + Math.floor(Math.random() * 4000));
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
      // Results live on their own page so the homepage stays clean.
      // Works on the homepage and on the download page alike.
      window.location.href = "download.html?v=" + encodeURIComponent(id);
    });
    input.addEventListener("input", function () { hideError(); });

    // Direct hits: /download.html?v=ID — start immediately.
    var auto = new URLSearchParams(window.location.search).get("v");
    if (auto && /^[A-Za-z0-9_-]{11}$/.test(auto)) {
      if (/(?:^|\/)download(?:\.html)?(?:$|\?)/.test(window.location.pathname)) {
        input.value = "https://youtu.be/" + auto;
        runDownload(auto);
      } else {
        // A shared link landed on the homepage — keep it clean, send it on.
        window.location.href = "download.html?v=" + encodeURIComponent(auto);
      }
    }
  }

  function extractYouTubeId(raw) {
    if (!raw) return null;
    var m = raw.match(/(?:youtube\.com\/(?:watch\?v=|shorts\/|embed\/|live\/)|youtu\.be\/)([A-Za-z0-9_-]{11})/);
    if (m) return m[1];
    if (/^[A-Za-z0-9_-]{11}$/.test(raw)) return raw;
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

  /* Own API first, then fast public resolver. Keeps total time ~2-7s. */
  function fetchInfoFast(id) {
    return fetchOwn(id).then(function (data) {
      if (data && !data.error && (data.formats || data.title)) return data;
      throw new Error("own-api-unavailable");
    }).catch(function () {
      return fetchPiped(id).then(function (data) {
        if (data && data.formats && data.formats.length) return data;
        throw new Error("No playable formats found for this video. Try another video.");
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
      return data;
    });
  }

  function fetchPiped(id) {
    var i = 0;
    function tryNext() {
      if (i >= PIPED_INSTANCES.length) return Promise.reject(new Error("All resolvers are busy. Try again in a moment."));
      var base = PIPED_INSTANCES[i++];
      return withTimeout(fetch(base + "/streams/" + encodeURIComponent(id)), 6000)
        .then(function (r) { if (!r.ok) throw new Error("resolver error"); return r.json(); })
        .then(function (j) { return normalizePiped(j, id); })
        .catch(function () { return tryNext(); });
    }
    return tryNext();
  }

  function normalizePiped(j, id) {
    if (!j || j.error) throw new Error("resolver error");
    var formats = [];
    var vids = j.videoStreams || [];
    vids.forEach(function (s) {
      if (s.videoOnly) return; // skip video-only; prefer muxed
      formats.push({ type: "video", quality: s.quality, qualityLabel: s.quality, note: s.format || "MP4", url: s.url });
    });
    if (!formats.length) {
      vids.forEach(function (s) {
        formats.push({ type: "video", quality: s.quality, qualityLabel: s.quality + " (video only)", note: "No audio", url: s.url });
      });
    }
    (j.audioStreams || []).forEach(function (s, idx) {
      var bitrate = s.bitrate || s.quality || "128";
      formats.push({ type: "audio", quality: String(bitrate).replace(/[^0-9]/g, "") || "128", qualityLabel: bitrate + " kbps", note: s.codec || "M4A", url: s.url });
    });
    formats.sort(function (a, b) { return parseQuality(b.quality) - parseQuality(a.quality); });
    return {
      source: "piped",
      videoId: id,
      title: j.title || "Video",
      author: j.uploader || "",
      views: j.views != null ? j.views : null,
      durationText: j.duration != null ? formatDuration(j.duration) : "",
      thumbnail: j.thumbnailUrl || j.thumbnail || ("https://i.ytimg.com/vi/" + id + "/hqdefault.jpg"),
      formats: formats
    };
  }
  function parseQuality(q) {
    var n = parseInt(String(q).replace(/[^0-9]/g, ""), 10);
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
    var transEl = $("#result-transcript");
    if (transEl) transEl.style.display = "none";
    var head = $("#transcript-head");
    if (head) head.setAttribute("aria-expanded", "false");
    var body = $("#transcript-body");
    if (body) { delete body.dataset.loaded; body.innerHTML = ""; }
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
    if (!items.length) items = (STATIC_FORMATS[current] || []).map(function (s) {
      return { quality: s.quality, qualityLabel: s.display, note: s.note, url: null };
    });
    var grid = $("#q-grid");
    if (!grid) return;
    grid.innerHTML = "";
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
        var frag = document.createDocumentFragment();
        j.lines.forEach(function (line) {
          var row = document.createElement("div");
          row.className = "t-line";
          var t = document.createElement("span");
          t.className = "t-time";
          t.textContent = fmtClock(line.t);
          var txt = document.createElement("p");
          txt.textContent = line.text;
          row.appendChild(t);
          row.appendChild(txt);
          frag.appendChild(row);
        });
        body.innerHTML = "";
        body.appendChild(frag);
      })
      .catch(function (err) {
        var msg = (err && err.message) || "No transcript could be loaded for this video.";
        body.innerHTML = '<p class="transcript-muted">' + escapeHtml(msg) + "</p>";
        if (msg.indexOf("captions") === -1) delete body.dataset.loaded; // allow one retry
      });
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
    initShare();
    initRecent();
  }
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", wireActions);
  } else {
    wireActions();
  }
})();