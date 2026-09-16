/* ============================================================
   SaveTube - app logic (vanilla JS, no framework)

   Two modes:
     engine mode  -> real downloads straight from YOUR domain
                     (server.js on your host)
     partner mode -> fallback redirect if there is no engine
   ============================================================ */

(function () {
  "use strict";

  var CFG = window.SITE_CONFIG || {};
  var engine = { available: false, checked: false, ffmpeg: false };

  var videoId = null;
  var videoMeta = null;
  var popupHandled = false;

  /* ---------- Helpers ---------- */

  function $(sel) { return document.querySelector(sel); }

  function apiBase() { return (CFG.apiBase || "").replace(/\/$/, ""); }

  function isChannelUrl(input) {
    return /youtube\.com\/(channel\/|c\/|user\/|@)/i.test(input) ||
           /^@[\w.-]+$/.test(input.trim());
  }

  function extractVideoId(input) {
    input = input.trim();
    var m;
    m = input.match(/^https?:\/\/(www\.)?youtube\.com\/shorts\/([\w-]{11})/);
    if (m) return m[2];
    m = input.match(/^https?:\/\/(www\.)?youtube\.com\/watch\?v=([\w-]{11})/);
    if (m) return m[2];
    m = input.match(/^https?:\/\/(www\.)?youtu\.be\/([\w-]{11})/);
    if (m) return m[2];
    m = input.match(/^https?:\/\/(www\.)?youtube\.com\/embed\/([\w-]{11})/);
    if (m) return m[2];
    m = input.match(/^https?:\/\/(www\.)?youtube\.com\/live\/([\w-]{11})/);
    if (m) return m[2];
    m = input.match(/[?&]v=([\w-]{11})/);
    if (m) return m[1];
    m = input.match(/^([\w-]{11})$/);
    if (m) return m[1];
    return null;
  }

  function escapeHtml(s) {
    return String(s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function buildPartnerUrl(placeholders) {
    var url = CFG.downloadPartnerUrl || "";
    url = url.replace("{VIDEO_ID}", placeholders.videoId || "");
    url = url.replace("{FORMAT}", placeholders.value || "");
    return url;
  }

  function showError(msg) {
    var el = $("#form-error");
    if (el) el.textContent = msg;
  }

  function clearError() {
    var el = $("#form-error");
    if (el) el.textContent = "";
  }

  /* ---------- Engine detection ----------
     Asks our own server "are you there?".
     Present -> real downloads from our domain.
     Absent  -> partner fallback, site still works. */
  function detectEngine(cb) {
    var mode = CFG.mode || "auto";

    if (mode === "partner") {
      engine.checked = true;
      engine.available = false;
      return cb(false);
    }

    var url = apiBase() + "/api/info?v=ping";
    var finished = false;

    function finish(ok) {
      if (finished) return;
      finished = true;
      engine.checked = true;
      engine.available = ok;
      cb(ok);
    }

    // If the host does not answer in 4s, fall back.
    setTimeout(function () { finish(engine.available); }, 4000);

    fetch(url, { cache: "no-store" })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (d) {
        if (d && d.ok) { engine.ffmpeg = !!d.ffmpeg; finish(true); }
        else { finish(false); }
      })
      .catch(function () { finish(false); });
  }

  /* ---------- Download progress UI ---------- */

  var MAX_BUFFER = 400 * 1024 * 1024;   // above this, let the browser save directly

  function prettyBytes(n) {
    if (!n) return "";
    var u = ["B", "KB", "MB", "GB"], i = 0;
    while (n >= 1024 && i < u.length - 1) { n = n / 1024; i++; }
    return (Math.round(n * 10) / 10) + " " + u[i];
  }

  function filenameFromHeaders(res, fallback) {
    var cd = res.headers.get("Content-Disposition") || "";
    var m = cd.match(/filename\*?=(?:UTF-8'')?"?([^";]+)"?/i);
    if (m && m[1]) {
      try { return decodeURIComponent(m[1]); } catch (e) { return m[1]; }
    }
    return fallback;
  }

  /* Overlay with rotating stage messages while the server prepares the file,
     then a real percentage once bytes start arriving. */
  function openProgress() {
    var overlay = $("#dl-overlay");
    var card = $("#dl-card");
    var title = $("#dl-title");
    var text = $("#dl-text");
    var note = $("#dl-note");
    var fill = $("#dl-bar-fill");
    var bar = $("#dl-bar");
    var closeBtn = $("#dl-close");
    var spinner = $("#dl-spinner");

    var stages = [
      "Contacting the server…",
      "Fetching the video stream…",
      "Merging video and audio…",
      "Almost ready…"
    ];
    var i = 0;
    var stopped = false;

    if (overlay) {
      overlay.hidden = false;
      overlay.classList.remove("is-done", "is-error");
    }
    if (card) card.classList.remove("is-success", "is-fail");
    if (title) title.textContent = "Preparing your download";
    if (text) text.textContent = stages[0];
    if (note) note.textContent = "This usually takes 10 to 40 seconds. Please keep this page open.";
    if (fill) fill.style.width = "6%";
    if (bar) { bar.removeAttribute("aria-valuenow"); bar.classList.add("is-waiting"); }
    if (closeBtn) closeBtn.hidden = true;

    var stageTimer = setInterval(function () {
      if (stopped) return;
      i = Math.min(i + 1, stages.length - 1);
      if (text) text.textContent = stages[i];
    }, 4500);

    function stopSpinner() {
      stopped = true;
      clearInterval(stageTimer);
      if (bar) bar.classList.remove("is-waiting");
      if (spinner) spinner.style.display = "none";
    }

    return {
      stage: function (msg, pct) {
        if (text) text.textContent = msg;
        if (fill && typeof pct === "number") fill.style.width = pct + "%";
      },
      progress: function (pct, msg) {
        if (msg && text) text.textContent = msg;
        if (fill && typeof pct === "number") {
          fill.style.width = pct + "%";
          if (bar) bar.setAttribute("aria-valuenow", String(pct));
        }
      },
      success: function (name, size) {
        stopSpinner();
        if (overlay) overlay.classList.add("is-done");
        if (card) card.classList.add("is-success");
        if (title) title.textContent = "Download started";
        if (text) text.textContent = (name || "Your file") + (size ? " · " + prettyBytes(size) : "");
        if (note) note.textContent = "Check your browser's Downloads. You can close this and get another video.";
        if (fill) fill.style.width = "100%";
        if (closeBtn) closeBtn.hidden = false;
      },
      fail: function (msg) {
        stopSpinner();
        if (overlay) overlay.classList.add("is-error");
        if (card) card.classList.add("is-fail");
        if (title) title.textContent = "Download did not start";
        if (text) text.textContent = msg || "Something went wrong. Please try again.";
        if (note) note.textContent = "Try a smaller quality, or wait a moment and press download again.";
        if (fill) fill.style.width = "100%";
        if (closeBtn) closeBtn.hidden = false;
      }
    };
  }

  /* Real download from our own domain: fetched with progress, then saved.
     The page never navigates away, so a server error shows a message
     instead of dumping the visitor on a blank page. */
  function startOwnDownload(params, fallbackName) {
    var ui = openProgress();
    var url = apiBase() + "/api/download?" + params;
    var controller = ("AbortController" in window) ? new AbortController() : null;
    var opts = { cache: "no-store" };
    if (controller) opts.signal = controller.signal;

    fetch(url, opts)
      .then(function (res) {
        var ct = (res.headers.get("Content-Type") || "").toLowerCase();
        var looksLikeError = ct.indexOf("application/json") >= 0 || ct.indexOf("text/plain") >= 0;

        if (!res.ok || looksLikeError) {
          return res.text().then(function (t) {
            var msg = String(t || "").trim();
            try { var j = JSON.parse(msg); if (j && j.error) msg = j.error; } catch (e) { /* plain text */ }
            throw new Error(msg || "The server could not prepare this file. Please try again.");
          });
        }

        var total = Number(res.headers.get("Content-Length")) || 0;
        var name = filenameFromHeaders(res, fallbackName);

        // Very large file: hand it to the browser so memory stays safe.
        if (total > MAX_BUFFER) {
          ui.stage("Handing the file to your browser…", 100);
          if (controller) controller.abort();
          window.location.href = url;
          return null;
        }

        ui.stage("Downloading… " + (total ? prettyBytes(total) : ""), 90);

        var reader = (res.body && res.body.getReader) ? res.body.getReader() : null;
        if (!reader) {
          return res.blob().then(function (b) { return { blob: b, name: name }; });
        }

        var chunks = [];
        var received = 0;

        function pump() {
          return reader.read().then(function (r) {
            if (r.done) return { blob: new Blob(chunks), name: name };
            chunks.push(r.value);
            received += r.value.length;
            var pct = total ? Math.round(90 + (received / total) * 10) : 95;
            ui.progress(pct, "Downloading… " + prettyBytes(received) + (total ? " / " + prettyBytes(total) : ""));
            return pump();
          });
        }
        return pump();
      })
      .then(function (out) {
        if (!out || !out.blob) return;
        var href = URL.createObjectURL(out.blob);
        var a = document.createElement("a");
        a.href = href;
        a.download = out.name || fallbackName || "save-tube-file";
        document.body.appendChild(a);
        a.click();
        a.remove();
        setTimeout(function () { URL.revokeObjectURL(href); }, 120000);
        ui.success(out.name || fallbackName, out.blob.size);
      })
      .catch(function (err) {
        if (err && err.name === "AbortError") return;
        ui.fail(err && err.message ? err.message : "");
      });
  }

  /* ---------- Unlock gate ---------- */

  function isUnlocked() {
    try { return sessionStorage.getItem("savetube-unlocked") === "1"; } catch (e) { return false; }
  }

  function markUnlocked() {
    try { sessionStorage.setItem("savetube-unlocked", "1"); } catch (e) { /* ignore */ }
  }

  function openModal(text) {
    $("#unlock-text").textContent = text || "Your file is ready. Complete one quick step, then come back and download.";
    $("#unlock-modal").hidden = false;
  }

  function closeModal() {
    $("#unlock-modal").hidden = true;
  }

  /* A format / transcript request:
       - adUnlockUrl set -> show the gate once per session
       - otherwise       -> run the action right away */
  function requestAction(action) {
    if (!CFG.adUnlockUrl || isUnlocked()) {
      doAction(action);
      return;
    }

    openModal("Your file is ready. Complete one quick step, then come back and download.");

    $("#unlock-btn").onclick = function () {
      markUnlocked();
      try { window.open(CFG.adUnlockUrl, "_blank"); } catch (e) { /* popup blocked */ }
      // The visitor returns to OUR site and clicks below. The file then
      // comes straight from our own domain.
      $("#unlock-text").textContent = "Done! Come back and click below to download your file.";
      $("#unlock-btn").textContent = "Download Now";
      $("#unlock-btn").onclick = function () { doAction(action); };
    };
  }

  function doAction(action) {
    if (action.type === "transcript") {
      var t = (CFG.transcriptPartnerUrl || "").replace("{VIDEO_ID}", videoId || "");
      if (t) window.location.href = t;
      return;
    }

    // Download
    if (engine.available) {
      // REAL download from our own domain, with progress shown on the page.
      var trim = readTrim();
      if (trim.error) {
        closeModal();
        showError(trim.error);
        return;
      }

      var params = "v=" + encodeURIComponent(videoId || "");
      var fallbackName;
      var cutFrom = trim.start || "";
      var cutTo = trim.end || "";
      var isCut = !!(cutFrom || cutTo);

      if (action.kind === "audio") {
        params += "&type=audio&bitrate=" + encodeURIComponent(action.value);
        fallbackName = "audio-" + (action.value || "128") + "kbps.mp3";
      } else {
        params += "&type=video&quality=" + encodeURIComponent(action.value);
        fallbackName = "video-" + (action.value || "1080") + "p.mp4";
      }

      if (isCut) {
        if (cutFrom) params += "&start=" + encodeURIComponent(cutFrom);
        if (cutTo) params += "&end=" + encodeURIComponent(cutTo);
      }

      if (videoMeta && videoMeta.title) {
        params += "&title=" + encodeURIComponent(videoMeta.title);
        fallbackName = videoMeta.title.replace(/[\\/:*?"<>|]/g, "_").slice(0, 80) +
          (action.kind === "audio" ? ".mp3" : ".mp4");
      }

      if (isCut) {
        fallbackName = fallbackName.replace(/\.(mp3|mp4)$/i, "") +
          " (cut " + (cutFrom || "0:00") + "-" + (cutTo || "end") + ")" +
          (action.kind === "audio" ? ".mp3" : ".mp4");
      }

      closeModal();
      clearError();
      startOwnDownload(params, fallbackName);
      return;
    }

    // Fallback partner redirect.
    var target = buildPartnerUrl(action);
    if (target) window.location.href = target;
  }

  /* ---------- Pop-up / popunder ads (click anywhere) ---------- */

  var popunderStarted = false;

  /* Starts only after consent. Opens one ad per visit, on a click, and never
     more often than minSecondsBetween. If no popunder url is set yet, the
     unlock url is used instead, so a single ad link is enough to switch
     click-anywhere ads on.

     The caps exist so visitors are not driven away: an aggressive pop-up
     earns a few cents once and then loses the visitor for good. */
  function startPopunder() {
    if (popunderStarted) return;

    var p = CFG.popunder || {};
    var url = (p.url || "").trim() || (CFG.adUnlockUrl || "").trim();
    if (!p.enabled || !url) return;
    if (p.respectConsent !== false && !adsAllowed()) return;

    var now = Date.now();
    var gap = (Number(p.minSecondsBetween) || 0) * 1000;
    var last = 0;

    try {
      if (p.oncePerSession && sessionStorage.getItem("savetube-pop") === "1") return;
      last = Number(localStorage.getItem("savetube-pop-at") || 0) || 0;
    } catch (e) { /* ignore */ }

    // A hard floor between pop-ups, even across page loads.
    if (gap && last && now - last < gap) return;

    // Nothing opens in the first seconds on the page, so the visit does not
    // feel like an ambush the moment somebody arrives.
    var armedAt = now + (Number(p.delayMs) || 0);

    popunderStarted = true;
    var clicks = 0;

    function fire() {
      try {
        sessionStorage.setItem("savetube-pop", "1");
        localStorage.setItem("savetube-pop-at", String(Date.now()));
      } catch (err) { /* ignore */ }
      try { window.open(url, "_blank"); } catch (err) { /* popup blocked */ }
    }

    document.addEventListener("click", function (e) {
      if (popupHandled) return;
      if (Date.now() < armedAt) return;

      // Never pop when the visitor is using our own controls.
      var skip = p.skipInside || "";
      if (e.target && e.target.closest && skip && e.target.closest(skip)) return;

      clicks++;
      if (clicks <= (p.ignoreFirstClicks || 0)) return;

      popupHandled = true;
      fire();
    }, true);
  }

  function adsAllowed() {
    return readConsent() === "accepted";
  }

  /* ---------- Timeline cut (trim) ---------- */

  /* Accepts "90", "1:30", "01:02:03", "1h2m3s". Returns seconds or null. */
  function timeToSeconds(v) {
    var s = String(v || "").trim();
    if (!s) return null;

    var m = s.match(/^(\d{1,3}):(\d{1,2}):(\d{1,2})$/);
    if (m) return Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[3]);

    m = s.match(/^(\d{1,4}):(\d{1,2})$/);
    if (m) return Number(m[1]) * 60 + Number(m[2]);

    m = s.match(/^(\d+(?:\.\d+)?)$/);
    if (m) return Math.floor(Number(m[1]));

    m = s.match(/^(?:(\d+)\s*h)?\s*(?:(\d+)\s*m)?\s*(?:(\d+)\s*s)?$/i);
    if (m && (m[1] || m[2] || m[3])) {
      return Number(m[1] || 0) * 3600 + Number(m[2] || 0) * 60 + Number(m[3] || 0);
    }
    return null;
  }

  function secondsToTime(sec) {
    var h = Math.floor(sec / 3600);
    var m = Math.floor((sec % 3600) / 60);
    var s = Math.floor(sec % 60);
    var pad = function (n) { return (n < 10 ? "0" : "") + n; };
    return (h > 0 ? pad(h) + ":" : "") + pad(m) + ":" + pad(s);
  }

  function trimEnabled() {
    var box = document.getElementById("trim-enable");
    return !!(box && box.checked);
  }

  /* Reads and validates the cut fields.
     Returns { start, end } (raw strings) or { error: "message" }. */
  function readTrim() {
    if (!trimEnabled()) return { start: "", end: "" };

    var startEl = document.getElementById("trim-start");
    var endEl = document.getElementById("trim-end");
    var startRaw = (startEl.value || "").trim();
    var endRaw = (endEl.value || "").trim();

    startEl.classList.remove("is-invalid");
    endEl.classList.remove("is-invalid");

    if (!startRaw && !endRaw) {
      startEl.classList.add("is-invalid");
      endEl.classList.add("is-invalid");
      return { error: "Type a From time, a To time, or both." };
    }

    var start = startRaw ? timeToSeconds(startRaw) : 0;
    if (start === null) {
      startEl.classList.add("is-invalid");
      return { error: "The From time is not valid. Use a format like 0:30 or 1:15." };
    }

    var end = endRaw ? timeToSeconds(endRaw) : null;
    if (endRaw && end === null) {
      endEl.classList.add("is-invalid");
      return { error: "The To time is not valid. Use a format like 0:30 or 1:15." };
    }

    var duration = videoMeta && videoMeta.duration ? Number(videoMeta.duration) : null;
    if (duration && start >= duration - 1) {
      startEl.classList.add("is-invalid");
      return { error: "The From time is past the end of this video (" + secondsToTime(duration) + ")." };
    }
    if (end !== null && end <= start) {
      endEl.classList.add("is-invalid");
      return { error: "The To time must be later than the From time." };
    }

    if (!engine.available) {
      return { error: "Cutting works with direct downloads. Please try again in a moment." };
    }

    return { start: secondsToTime(start), end: end !== null ? secondsToTime(Math.min(end, duration || end)) : "" };
  }

  /* Shows a running "cut: 0:10 to 0:25 (15s)" hint under the fields. */
  function updateTrimHint() {
    var hint = document.getElementById("trim-hint");
    if (!hint) return;

    var base = 'Type times like <code>0:30</code> or <code>1:15</code>. Leave <em>To</em> empty to keep everything to the end.';
    if (!trimEnabled()) return;

    var startEl = document.getElementById("trim-start");
    var endEl = document.getElementById("trim-end");
    var s = timeToSeconds(startEl.value) || 0;
    var e = timeToSeconds(endEl.value);

    if (videoMeta && videoMeta.durationText) {
      base += ' This video is <strong>' + escapeHtml(videoMeta.durationText) + '</strong> long.';
    }

    if (e !== null && e > s) {
      base = '<strong>' + secondsToTime(e - s) + '</strong> will be saved (from ' +
        secondsToTime(s) + ' to ' + secondsToTime(e) + '). ' + base;
    }
    hint.innerHTML = base;
  }

  function initTrim() {
    var box = document.getElementById("trim-enable");
    var fields = document.getElementById("trim-fields");
    if (!box || !fields) return;

    box.addEventListener("change", function () {
      fields.hidden = !box.checked;
      if (box.checked) {
        var s = document.getElementById("trim-start");
        if (s && !s.value) s.value = "0:00";
        updateTrimHint();
        var first = document.getElementById("trim-start");
        if (first) try { first.focus(); } catch (e) {}
      }
    });

    ["trim-start", "trim-end"].forEach(function (id) {
      var el = document.getElementById(id);
      if (el) el.addEventListener("input", function () {
        el.classList.remove("is-invalid");
        updateTrimHint();
      });
    });
  }

  /* ---------- Render result ---------- */

  function renderResult(data) {
    var thumb = document.getElementById("result-thumb");
    thumb.src = data.thumbnail || ("https://i.ytimg.com/vi/" + videoId + "/hqdefault.jpg");
    thumb.alt = data.title ? (data.title + " thumbnail") : "Video thumbnail";

    document.getElementById("result-title").textContent = data.title || "Video";
    document.getElementById("result-author").textContent = data.author || data.author_name || "";

    // Show the length so the cut fields make sense.
    var lengthEl = document.getElementById("result-author");
    if (lengthEl && data.durationText) {
      lengthEl.textContent = (data.author || data.author_name || "") + " · " + data.durationText;
    }

    document.getElementById("result").hidden = false;
    document.getElementById("back-link").hidden = false;
    document.getElementById("result").scrollIntoView({ block: "start", behavior: "smooth" });
  }

  function formatButton(label, sub, onClick) {
    var btn = document.createElement("button");
    btn.type = "button";
    btn.className = "format-btn";
    btn.innerHTML =
      '<span class="fmt">' + escapeHtml(label) + "</span>" +
      '<span class="dim">' + escapeHtml(sub) + "</span>";
    btn.addEventListener("click", onClick);
    return btn;
  }

  function renderFormats() {
    var videoList = $("#format-video-list");
    var audioList = $("#format-audio-list");
    videoList.innerHTML = "";
    audioList.innerHTML = "";

    var cutNote = trimEnabled() ? '<span class="trim-badge">cut</span>' : "";

    // Video: use the REAL ladder the engine found when we have it.
    var videoItems = (CFG.videoFormats || []);

    if (engine.available && videoMeta && videoMeta.qualities && videoMeta.qualities.length) {
      videoItems = videoMeta.qualities.map(function (q) {
        var sub = q.height + "p";
        if (q.fps && q.fps > 30) sub += " · " + q.fps + "fps";
        if (q.sizeText) sub += " · " + q.sizeText;
        return { label: q.label, sub: sub, value: q.value };
      });
    } else {
      videoItems = videoItems.map(function (f) {
        return { label: f.label, sub: f.quality + " · " + f.hint, value: f.value };
      });
    }

    videoItems.forEach(function (item) {
      var btn = formatButton(item.label, item.sub, function () {
        requestAction({ type: "download", kind: "video", videoId: videoId, value: item.value, label: item.label });
      });
      if (cutNote && videoItems.length === 1) btn.querySelector(".fmt").insertAdjacentHTML("beforeend", cutNote);
      videoList.appendChild(btn);
    });

    var audioItems = (CFG.audioFormats || []).map(function (f) {
      return { label: f.label, sub: f.quality + " · " + f.hint, value: f.value };
    });

    audioItems.forEach(function (item) {
      audioList.appendChild(formatButton(item.label, item.sub, function () {
        requestAction({ type: "download", kind: "audio", videoId: videoId, value: item.value, label: item.label });
      }));
    });
  }

  /* ---------- Tabs ---------- */

  function initTabs() {
    var tabs = [
      { tab: "tab-video", panel: "panel-video" },
      { tab: "tab-audio", panel: "panel-audio" },
      { tab: "tab-transcript", panel: "panel-transcript" }
    ];

    tabs.forEach(function (t) {
      var btn = document.getElementById(t.tab);
      btn.addEventListener("click", function () {
        tabs.forEach(function (x) {
          var b = document.getElementById(x.tab);
          var p = document.getElementById(x.panel);
          b.classList.toggle("is-active", b === btn);
          b.setAttribute("aria-selected", b === btn ? "true" : "false");
          p.hidden = b !== btn;
        });
      });
    });

    $("#btn-transcript").addEventListener("click", function () {
      requestAction({ type: "transcript", videoId: videoId });
    });
  }

  /* ---------- Form handling ---------- */

  function handleSubmit(ev) {
    ev.preventDefault();
    clearError();

    var input = $("#video-url");
    var url = (input.value || "").trim();
    if (!url) { showError("Paste a YouTube link first."); return; }

    var id = extractVideoId(url);
    if (!id) {
      if (isChannelUrl(url)) {
        showError("That is a channel link. Open the video you want, then copy the video link (it has watch?v= in it).");
      } else {
        showError("That does not look like a YouTube link. Try a watch?v= or youtu.be link.");
      }
      return;
    }

    videoId = id;

    var btn = $("#btn-start");
    btn.disabled = true;
    btn.textContent = "Looking up...";

    lookupVideo(id, function (err, data) {
      btn.disabled = false;
      btn.textContent = "Get Link";
      videoMeta = data || {};
      renderResult(videoMeta);
      renderFormats();
      if (err) showError("Could not read this video's details, but you can still try a download.");
    });
  }

  function lookupVideo(id, done) {
    // Prefer our own engine: real title, real quality ladder.
    if (engine.available) {
      fetch(apiBase() + "/api/info?v=" + encodeURIComponent(id), { cache: "no-store" })
        .then(function (r) { return r.json(); })
        .then(function (d) {
          if (d && d.ok) done(null, d);
          else done(new Error((d && d.error) || "lookup failed"), { title: "Video", author: "" });
        })
        .catch(function () { done(new Error("lookup failed"), { title: "Video", author: "" }); });
      return;
    }

    // Fallback: YouTube's free oEmbed endpoint.
    var url = "https://www.youtube.com/oembed?url=" +
      encodeURIComponent("https://www.youtube.com/watch?v=" + id) +
      "&format=json";

    fetch(url)
      .then(function (r) { if (!r.ok) throw new Error("bad status"); return r.json(); })
      .then(function (data) { done(null, data || {}); })
      .catch(function (err) { done(err, { title: "Video", author_name: "" }); });
  }

  /* ---------- Cookie consent + ad gating ---------- */

  /* Splits an ad block into the pieces a browser needs.
     Adsterra (and most networks) ship an inline settings object FIRST and a
     loader <script src> SECOND. The settings must run before the loader, so
     both are collected separately and appended in that order. */
  function extractAdScripts(code) {
    var inline = [];
    var srcs = [];
    var re = /<script([^>]*)>([\s\S]*?)<\/script>/gi;
    var m;

    while ((m = re.exec(code)) !== null) {
      var attrs = m[1] || "";
      var body = m[2] || "";
      var srcMatch = attrs.match(/src\s*=\s*["']([^"']+)["']/i);
      if (srcMatch) srcs.push(srcMatch[1]);
      else if (body.trim()) inline.push(body);
    }

    // A block with no script tags at all is treated as inline code.
    if (!inline.length && !srcs.length && code.trim()) inline.push(code);

    return { inline: inline, srcs: srcs };
  }

  function activateConsentedScripts() {
    var blocks = document.querySelectorAll('script[type="text/plain"][data-consent="ads"]');

    Array.prototype.forEach.call(blocks, function (block) {
      if (block.getAttribute("data-activated") === "1") return;

      var parts = extractAdScripts(block.textContent || "");

      /* Find the slot this block belongs to. Ad code injects itself next to
         the script that loaded it, so the scripts must live INSIDE the slot —
         otherwise the banner is appended to the end of <body> and the styled
         container stays empty. */
      var selector = block.getAttribute("data-target") || "";
      var slot = selector ? document.querySelector(selector) : null;
      if (!slot) {
        var prev = block.previousElementSibling;
        while (prev && !slot) {
          if (prev.classList && (prev.classList.contains("ad-slot") || prev.querySelector)) {
            slot = prev.classList && prev.classList.contains("ad-slot")
              ? prev
              : prev.querySelector(".ad-slot");
          }
          prev = prev.previousElementSibling;
        }
      }
      var host = slot || block.parentNode || document.body;

      if (slot) {
        // Real code is arriving: drop the placeholder look.
        slot.classList.add("is-live");
        var label = slot.querySelector(".ad-label");
        if (label) label.remove();
      }

      // Inline settings first, so the loader finds them.
      parts.inline.forEach(function (code) {
        var s = document.createElement("script");
        s.type = "text/javascript";
        s.text = code;
        host.appendChild(s);
      });

      // Then every loader script.
      parts.srcs.forEach(function (src) {
        var s = document.createElement("script");
        s.type = "text/javascript";
        s.async = true;
        if (src.indexOf("//") === 0) src = location.protocol + src;
        else if (src.indexOf("/") === 0) src = location.protocol + src;
        s.src = src;
        host.appendChild(s);
      });

      block.setAttribute("data-activated", "1");
    });

    // Slots with no code yet keep their reserved space so the layout is stable.
    Array.prototype.forEach.call(document.querySelectorAll(".ad-slot"), function (slot) {
      if (!slot.querySelector("iframe, ins, img, object, embed, div, script")) return;
      slot.classList.add("is-live");
      var label = slot.querySelector(".ad-label");
      if (label) label.hidden = true;
    });

    // Click-anywhere ads need consent too, so they start here.
    startPopunder();
  }

  function readConsent() {
    try { return localStorage.getItem("savetube-consent"); } catch (e) { return null; }
  }

  function writeConsent(value) {
    try { localStorage.setItem("savetube-consent", value); } catch (e) { /* ignore */ }
  }

  function initCookieConsent() {
    var banner = $("#cookie-consent");
    if (!banner) return;

    // "Cookie settings" link in the footer lets a visitor change their mind.
    var reset = document.getElementById("cookie-settings");
    if (reset) {
      reset.addEventListener("click", function (e) {
        e.preventDefault();
        try { localStorage.removeItem("savetube-consent"); } catch (err) { /* ignore */ }
        window.location.reload();
      });
    }

    var choice = readConsent();

    if (choice === "accepted") {
      activateConsentedScripts();
      return;
    }
    if (choice === "declined") return;

    banner.hidden = false;

    $("#cookie-accept").addEventListener("click", function () {
      writeConsent("accepted");
      banner.hidden = true;
      activateConsentedScripts();   // ads start here, never before
    });

    $("#cookie-decline").addEventListener("click", function () {
      writeConsent("declined");
      banner.hidden = true;         // no ad scripts are ever loaded
    });
  }

  /* ---------- Init ---------- */

  function init() {
    var form = $("#search-form");
    if (form) form.addEventListener("submit", handleSubmit);

    var input = $("#video-url");
    if (input) {
      input.addEventListener("paste", function () {
        setTimeout(function () {
          var v = input.value.trim();
          var m = v.match(/https?:\/\/[^\s]+/);
          if (m) input.value = m[0];
        }, 10);
      });
    }

    $("#unlock-close").addEventListener("click", closeModal);
    $("#unlock-modal").addEventListener("click", function (e) {
      if (e.target === this) closeModal();
    });

    initTabs();
    initTrim();
    initCookieConsent();

    // Plus / minus keys nudge the cut times by 5 seconds, once the fields
    // exist, so a section can be dialled in without typing.
    ["trim-start", "trim-end"].forEach(function (id) {
      var el = document.getElementById(id);
      if (!el) return;
      el.addEventListener("keydown", function (e) {
        if (e.key !== "ArrowUp" && e.key !== "ArrowDown") return;
        e.preventDefault();
        var cur = timeToSeconds(el.value) || 0;
        var next = Math.max(0, cur + (e.key === "ArrowUp" ? 5 : -5));
        el.value = secondsToTime(next);
        el.classList.remove("is-invalid");
        updateTrimHint();
      });
    });

    // Find out which mode we are in (own engine vs fallback).
    detectEngine(function (ok) {
      var badge = $("#engine-badge");
      if (badge) {
        badge.hidden = !ok;
        badge.textContent = ok ? "Direct download" : "";
      }
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
