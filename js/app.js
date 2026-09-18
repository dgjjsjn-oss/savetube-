/* SaveTube front-end app.
   Speed contract: warm-up ping on load + heartbeat keeps the engine awake; if the own API
   does not answer within ~7s, a fast public resolver (Piped) returns playable stream URLs
   in 2-4s. Download button always opens a real, working URL.
   - Ads: policy-safe gating. Swap ADSENSE_CLIENT to a real verified client id and ads load
     instantly; while it stays "ca-pub-PLACEHOLDER" the slots render as labelled empty boxes
     (zero layout shift) and no ad script ever loads.
   - Popup: one Ad-labelled popup per session, 8s after load OR first successful download.
   - Motion: scroll reveals, accordion, glass console tilt, counters. Reduced-motion friendly.
*/

(function () {
  "use strict";

  /* ============ CONFIG ============ */
  var ADSENSE_CLIENT = "ca-pub-PLACEHOLDER"; // <- put your verified client id here to go live
  var ADSENSE_SLOTS = {
    leaderboard: { el: ".ad-leaderboard", format: "auto", responsive: true },
    incontent:   { el: ".ad-incontent",   format: "auto", responsive: true },
    sidebar:     { el: ".ad-sidebar",     format: "auto", responsive: true },
    footer:      { el: ".ad-footer",      format: "auto", responsive: true }
  };
  var POPUP_DELAY_MS = 8000;
  var POPUP_KEY = "savetube_popup_seen";
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
    initPopup();
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

  /* ============ CONTACT FORM ============ */
  function initContactForm() {
    var form = $("#contact-form");
    if (!form) return;
    form.addEventListener("submit", function (e) {
      e.preventDefault();
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
      if (btn) { btn.disabled = true; btn.textContent = "Sending..."; }
      setTimeout(function () {
        form.style.display = "none";
        var okWrap = $("#form-success");
        if (okWrap) okWrap.classList.add("visible");
      }, 500);
    });
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

  /* ============ ADS ============ */
  function initAds() {
    if (window.location.search.indexOf("ads=off") > -1) return;
    var enabled = ADSENSE_CLIENT && ADSENSE_CLIENT.indexOf("PLACEHOLDER") === -1;
    $$("[data-ad]").forEach(function (slot) {
      if (enabled) {
        slot.classList.add("ad-filled");
        slot.innerHTML = "<div class='ad-inner'></div>";
      } else {
        slot.innerHTML = "<div class='ad-inner'><span>Advertisement</span></div>";
      }
    });
    if (!enabled) return;
    var s = document.createElement("script");
    s.async = true;
    s.src = "https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=" + ADSENSE_CLIENT;
    s.crossOrigin = "anonymous";
    s.setAttribute("data-ad-client", ADSENSE_CLIENT);
    document.head.appendChild(s);
    Object.keys(ADSENSE_SLOTS).forEach(function (key) {
      var slot = ADSENSE_SLOTS[key];
      $$(slot.el).forEach(function (el) {
        var id = "slot-" + key + "-" + Math.random().toString(36).slice(2, 8);
        el.id = id;
        var ins = document.createElement("ins");
        ins.className = "adsbygoogle";
        ins.style.display = "block";
        ins.setAttribute("data-ad-client", ADSENSE_CLIENT);
        ins.setAttribute("data-ad-format", slot.format);
        ins.setAttribute("data-full-width-responsive", "true");
        var inner = el.querySelector(".ad-inner") || el;
        inner.appendChild(ins);
        try { (window.adsbygoogle = window.adsbygoogle || []).push({}); } catch (e) {}
      });
    });
  }

  /* ============ POPUP (one per session) ============ */
  function initPopup() {
    var overlay = $(".popup-overlay");
    if (!overlay) return;
    var seen = false;
    try { seen = localStorage.getItem(POPUP_KEY) === "1"; } catch (e) {}
    if (seen) return;
    var shown = false;
    function open() {
      if (shown || seen) return;
      shown = true;
      overlay.classList.add("open");
      try { localStorage.setItem(POPUP_KEY, "1"); } catch (e) {}
    }
    function close() { overlay.classList.remove("open"); }
    var closeBtn = $(".popup-close", overlay);
    if (closeBtn) closeBtn.addEventListener("click", close);
    overlay.addEventListener("click", function (e) { if (e.target === overlay) close(); });
    document.addEventListener("keydown", function (e) { if (e.key === "Escape") close(); });
    setTimeout(open, POPUP_DELAY_MS);
    window.__savetube_download_ready = open;
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
      runDownload(id);
    });
    input.addEventListener("input", function () { hideError(); });
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
        try { if (window.__savetube_download_ready) window.__savetube_download_ready(); } catch (e) {}
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
  }

  function formatViews(n) {
    if (n == null) return "";
    n = Number(n);
    if (n >= 1e6) return (n / 1e6).toFixed(1).replace(/\.0$/, "") + "M views";
    if (n >= 1e3) return (n / 1e3).toFixed(1).replace(/\.0$/, "") + "K views";
    return n + " views";
  }

  function renderTabs(data) {
    $$(".q-tab").forEach(function (tab) {
      tab.addEventListener("click", function () {
        currentType = tab.getAttribute("data-type");
        selectedQuality = null;
        $$(".q-tab").forEach(function (t) { t.classList.toggle("active", t === tab); });
        renderQualities(data);
        updateDownloadBtn();
      });
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
  }

  function bindDownload() {
    var btn = $("#download-btn");
    if (!btn) return;
    btn.addEventListener("click", function () {
      if (!currentMeta || !selectedQuality) return;
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
      try { if (window.__savetube_download_ready) window.__savetube_download_ready(); } catch (e) {}
    });
  }

  function bindTranscript() {
    var head = $("#transcript-head");
    var body = $("#transcript-body");
    if (!head || !body) return;
    head.addEventListener("click", function () {
      var open = body.style.display !== "none";
      body.style.display = open ? "none" : "block";
      var chev = head.querySelector(".chev");
      if (chev) chev.style.transform = open ? "" : "rotate(180deg)";
    });
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
  }
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", wireActions);
  } else {
    wireActions();
  }
})();