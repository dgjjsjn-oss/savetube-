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

  /* Close must ALWAYS work. Previously #dl-close was only shown and hidden and
     never given a click handler, so pressing it did nothing at all. Now the
     button, the Escape key and a click on the dark backdrop all close it. */
  var progressStop = null;

  function closeProgress() {
    var overlay = $("#dl-overlay");
    var card = $("#dl-card");
    if (progressStop) { try { progressStop(); } catch (e) {} progressStop = null; }
    if (overlay) {
      overlay.hidden = true;
      overlay.classList.remove("is-done", "is-error");
    }
    if (card) card.classList.remove("is-success", "is-fail");
  }

  function initProgressClose() {
    var overlay = $("#dl-overlay");
    var closeBtn = $("#dl-close");

    if (closeBtn) {
      closeBtn.addEventListener("click", function (ev) {
        ev.preventDefault();
        ev.stopPropagation();
        closeProgress();
      });
    }

    if (overlay) {
      // Click on the dark area around the card, not on the card itself.
      overlay.addEventListener("click", function (ev) {
        if (ev.target === overlay) closeProgress();
      });
    }

    document.addEventListener("keydown", function (ev) {
      if (ev.key !== "Escape" && ev.key !== "Esc") return;
      if (!overlay || overlay.hidden) return;
      if (closeBtn && closeBtn.hidden) return; // still working: do not cancel by accident
      closeProgress();
    });
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

    progressStop = function () {
      stopped = true;
      clearInterval(stageTimer);
    };

    function stopSpinner() {
      stopped = true;
      clearInterval(stageTimer);
      progressStop = null;
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
      },

      /* Last resort that always works: a plain link to the same URL. A normal
         browser navigation to /api/download saves the file because the
         response carries Content-Disposition: attachment, so this succeeds
         even when the in-page fetch is blocked or runs out of memory. */
      direct: function (url, msg) {
        stopSpinner();
        if (overlay) overlay.classList.add("is-error");
        if (card) card.classList.add("is-fail");
        if (title) title.textContent = "Your MP4 with audio is ready";
        if (text) text.textContent = msg || "Your browser stopped the in-page download. The button below saves the same file and always works.";
        if (note) {
          note.textContent = "";
          var a = document.createElement("a");
          a.href = url;
          a.className = "dl-direct-link";
          a.textContent = "Save the MP4 with audio";
          a.setAttribute("download", "");
          note.appendChild(a);
        }
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

    // Watchdog: once bytes have started flowing, a long silence means the
    // in-page fetch is stuck. Hand the same URL to the browser so the file
    // still finishes in its own download manager instead of dying here.
    var lastByteAt = Date.now();
    var done = false;
    var watchdog = setInterval(function () {
      if (done) return;
      if (Date.now() - lastByteAt < 60000) return;
      done = true;
      clearInterval(watchdog);
      if (controller) { try { controller.abort(); } catch (e) { /* ignore */ } }
      window.location.href = url;
    }, 5000);

    function finish() {
      done = true;
      clearInterval(watchdog);
    }

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
          finish();
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
            lastByteAt = Date.now();
            var pct = total ? Math.round(90 + (received / total) * 10) : 95;
            ui.progress(pct, "Downloading… " + prettyBytes(received) + (total ? " / " + prettyBytes(total) : ""));
            return pump();
          });
        }
        return pump();
      })
      .then(function (out) {
        if (!out || !out.blob) return;
        finish();
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
        finish();
        if (err && err.name === "AbortError") return;
        // Never a dead end: offer the direct link as a working second route.
        ui.direct(url, err && err.message ? err.message : "");
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

  /* A format / transcript request.

     unlockMode "instant" (default): the FIRST click opens the ad link in a
     new tab, immediately, and the download starts on this site in the same
     moment. No modal, no countdown, no second step.

     unlockMode "modal": the older two-step gate.
     unlockMode "off":   never show an ad step. */
  function requestAction(action) {
    // The "Get link" moment: show the faster-link tip once per visit.
    showAliasHint();

    var mode = CFG.unlockMode || (CFG.adUnlockUrl ? "modal" : "off");

    if (mode === "instant" && CFG.adUnlockUrl) {
      if (!adClickedThisSession()) openAdTab(CFG.adUnlockUrl);
      doAction(action);
      return;
    }

    if (mode !== "modal" || !CFG.adUnlockUrl || isUnlocked()) {
      doAction(action);
      return;
    }

    openModal("Your file is ready. Complete one quick step, then come back and download.");

    $("#unlock-btn").onclick = function () {
      markUnlocked();
      openAdTab(CFG.adUnlockUrl);
      $("#unlock-text").textContent = "Done! Come back and click below to download your file.";
      $("#unlock-btn").textContent = "Download Now";
      $("#unlock-btn").onclick = function () { doAction(action); };
    };
  }

  /* Opens an ad link in a background tab and never steals focus, so the
     visitor stays on our page and the download is not interrupted. */
  function openAdTab(url) {
    if (!url) return;
    try {
      var win = window.open(url, "_blank", "noopener,noreferrer");
      if (win) { try { win.blur(); window.focus(); } catch (e) {} }
    } catch (e) { /* popup blocked: the download still goes ahead */ }
  }

  function adClickedThisSession() {
    try {
      if (sessionStorage.getItem("savetube-adclick") === "1") return true;
      sessionStorage.setItem("savetube-adclick", "1");
      return false;
    } catch (e) { return false; }
  }

  var lastTranscript = null;

  function doAction(action) {
    // Consent comes first: Terms, Privacy and Cookie Policy accepted. Without
    // it nothing downloads and no ad loads, which is what the legal pages and
    // the ad networks both require.
    if (!consentGiven()) {
      showConsentGate();
      return;
    }

    if (action.type === "transcript") {
      loadTranscript();
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

    // No engine and no partner site: never leave the visitor on a dead end
    // and never send them to another downloader. Tell them, in place.
    closeModal();
    showError("Our server is not answering right now. Please reload the page and try again.");
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

    // The "Download this clip" button: takes the cut range and downloads the
    // best video quality that exists for this video in one press.
    var go = $("#trim-download");
    if (go) {
      go.addEventListener("click", function () {
        var trim = readTrim();
        if (trim.error) {
          showError(trim.error);
          return;
        }
        if (!trim.start && !trim.end) {
          showError("Set a start time, an end time, or both, then press Download this clip.");
          return;
        }
        clearError();

        var best = null;
        if (videoMeta && videoMeta.qualities && videoMeta.qualities.length) {
          best = videoMeta.qualities[0];       // server sends them biggest first
        }

        requestAction({
          kind: "video",
          type: "video",
          value: best ? best.value : "1080",
          label: best ? best.label : ""
        });
      });
    }
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

    /* Start the lookup the moment a usable link is present, so pressing the
       button has nothing left to wait for. Typing is debounced; pasting is
       not, because a paste is a finished act. */
    var box = $("#video-url");
    if (box) {
      box.addEventListener("input", function () {
        var id = extractVideoId((box.value || "").trim());
        if (!id) return;
        if (prefetchTimer) clearTimeout(prefetchTimer);
        prefetchTimer = setTimeout(function () { prefetchInfo(id); }, 250);
      });
      box.addEventListener("paste", function () {
        setTimeout(function () {
          prefetchInfo(extractVideoId((box.value || "").trim()));
        }, 0);
      });
    }
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

  /* ---------- Instant lookups ----------

     Asking YouTube about a video is the slow part of "Get Link" - a few
     seconds of nothing before the result appears. So the question is asked
     the moment a usable link is in the box, not when the button is pressed.
     By the time the visitor clicks, the answer is usually already here and
     the result shows immediately. */

  var infoCache = {};          // videoId -> { data, at }
  var INFO_TTL = 10 * 60 * 1000;
  var pendingInfo = {};        // videoId -> true while a request is in flight
  var prefetchTimer = null;

  function cachedInfo(id) {
    var c = infoCache[id];
    if (!c) return null;
    if (Date.now() - c.at > INFO_TTL) { delete infoCache[id]; return null; }
    return c.data;
  }

  function prefetchInfo(id) {
    if (!id || !engine.available) return;
    if (cachedInfo(id) || pendingInfo[id]) return;

    pendingInfo[id] = true;
    fetch(apiBase() + "/api/info?v=" + encodeURIComponent(id), { cache: "no-store" })
      .then(function (r) { return r.json(); })
      .then(function (d) { if (d && d.ok) infoCache[id] = { data: d, at: Date.now() }; })
      .catch(function () { /* the button press will try again */ })
      .then(function () { pendingInfo[id] = false; });
  }

  function lookupVideo(id, done) {
    // Prefer our own engine: real title, real quality ladder.
    if (engine.available) {
      var ready = cachedInfo(id);
      if (ready) { done(null, ready); return; }

      fetch(apiBase() + "/api/info?v=" + encodeURIComponent(id), { cache: "no-store" })
        .then(function (r) { return r.json(); })
        .then(function (d) {
          if (d && d.ok) {
            infoCache[id] = { data: d, at: Date.now() };
            done(null, d);
          } else {
            done(new Error((d && d.error) || "lookup failed"), { title: "Video", author: "" });
          }
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

  /* ---------- Transcript, rendered on OUR OWN page ----------

     The server fetches the captions and returns JSON. Nothing here sends the
     visitor to another website: the text appears inside this tab. The
     timestamps switch can be turned on and off. The action button is an ad
     click when a link is configured, and a plain copy when it is not, so the
     site starts earning the moment a link is pasted into config.js. */

  var transcriptData = null;
  var tsWanted = true;

  function fmtTs(sec) {
    sec = Math.max(0, Math.round(Number(sec) || 0));
    var h = Math.floor(sec / 3600);
    var m = Math.floor((sec % 3600) / 60);
    var s = sec % 60;
    var mm = (h && m < 10 ? "0" : "") + m;
    var ss = (s < 10 ? "0" : "") + s;
    return (h ? h + ":" : "") + mm + ":" + ss;
  }

  function transcriptAdUrl() {
    var t = CFG.transcript || {};
    return String(t.adUrl || "").trim();
  }

  function transcriptText() {
    if (!transcriptData) return "";
    return transcriptData.lines.map(function (l) {
      return (tsWanted ? "[" + fmtTs(l.t) + "] " : "") + l.text;
    }).join("\n");
  }

  /* A line counts as speech once the caption decorations are stripped away.
     YouTube writes music as [music], [♪♪♪] or ♪ lyric ♪, and strips those
     out to leave nothing. Letters from any alphabet survive, so this works
     for languages that are not English too. */
  function hasSpeech(text) {
    var s = String(text || "")
      .replace(/\[[^\]]*\]/g, " ")
      .replace(/\u266A/g, " ")
      .replace(/>>/g, " ")
      .replace(/[^0-9A-Za-z\u00C0-\uFFFF\s]/g, " ")
      .replace(/\s+/g, " ")
      .trim();
    return s.length >= 2;
  }

  function renderTranscript() {
    var rows = $("#transcript-rows");
    var toolbar = $("#transcript-toolbar");
    if (!rows || !transcriptData) return;

    rows.textContent = "";
    var frag = document.createDocumentFragment();

    /* Some videos carry a caption track that holds no speech at all — a music
       video whose only cue is "[music]", or a silent clip. An empty panel
       would look like a broken page, so say what is really going on and hide
       the tools that would have nothing to work with. */
    var spoken = transcriptData.lines.filter(function (l) { return hasSpeech(l.text); });

    if (!spoken.length) {
      var none = document.createElement("p");
      none.className = "transcript-empty";
      none.textContent =
        "This video has no spoken words in it, so there is no transcript to show. " +
        "Any video with talking or singing does have one.";
      rows.appendChild(none);
      rows.hidden = false;
      if (toolbar) toolbar.hidden = true;
      var c = $("#ts-count");
      if (c) c.textContent = "no speech in this video";
      return;
    }

    transcriptData.lines.forEach(function (l) {
      var row = document.createElement("p");
      row.className = "transcript-row";

      if (tsWanted) {
        var ts = document.createElement("button");
        ts.type = "button";
        ts.className = "transcript-ts";
        ts.textContent = fmtTs(l.t);
        ts.setAttribute("data-seek", String(Math.round(l.t)));
        ts.title = "Jump to this moment in the video";
        ts.addEventListener("click", function () {
          try {
            window.open("https://www.youtube.com/watch?v=" + videoId + "&t=" + ts.getAttribute("data-seek") + "s", "_blank", "noopener");
          } catch (e) { /* ignore */ }
        });
        row.appendChild(ts);
      }

      var txt = document.createElement("span");
      txt.className = "transcript-text";
      txt.textContent = l.text;
      row.appendChild(txt);
      frag.appendChild(row);
    });

    rows.appendChild(frag);
    rows.hidden = false;
    if (toolbar) toolbar.hidden = false;

    var count = $("#ts-count");
    if (count) {
      count.textContent = transcriptData.lines.length + " lines · " +
        (transcriptData.words || 0) + " words";
    }
  }

  function copyTranscript() {
    var btn = $("#btn-transcript-copy");
    var text = transcriptText();

    function report(ok) {
      if (!btn) return;
      if (!btn.getAttribute("data-label")) btn.setAttribute("data-label", btn.textContent);
      btn.textContent = ok ? "Copied to clipboard" : "Press Ctrl+C to copy";
      setTimeout(function () {
        btn.textContent = btn.getAttribute("data-label") || "Copy transcript";
      }, 2200);
    }

    function fallback() {
      try {
        var ta = document.createElement("textarea");
        ta.value = text;
        ta.setAttribute("readonly", "");
        ta.style.position = "fixed";
        ta.style.left = "-9999px";
        document.body.appendChild(ta);
        ta.select();
        var ok = document.execCommand("copy");
        document.body.removeChild(ta);
        report(ok);
      } catch (e) { report(false); }
    }

    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(function () { report(true); }, fallback);
    } else {
      fallback();
    }
  }

  /* The button that used to be a plain copy. With an ad link set it opens the
     ad in a background tab, then still hands over the text, so the visitor is
     never left with nothing. Without a link it simply copies. */
  function onTranscriptAction() {
    var url = transcriptAdUrl();
    if (url) {
      openAdTab(url);
      if (!(CFG.transcript && CFG.transcript.revealAfterAd === false)) copyTranscript();
      var note = $("#transcript-note");
      if (note) note.textContent = "Thanks - that click keeps SaveTube free. Your text is below.";
      return;
    }
    copyTranscript();
  }

  function loadTranscript() {
    var status = $("#transcript-status");
    var btn = $("#btn-transcript");

    if (!videoId) {
      if (status) { status.hidden = false; status.textContent = "Enter a video link first."; }
      return;
    }

    if (!engine.available) {
      if (status) {
        status.hidden = false;
        status.textContent = "The transcript reader needs the download server. It is not reachable right now.";
      }
      return;
    }

    if (transcriptData) {          // already loaded for this video
      renderTranscript();
      return;
    }

    if (status) { status.hidden = false; status.textContent = "Reading the captions…"; }
    if (btn) { btn.disabled = true; btn.textContent = "Reading captions…"; }
    var copyBtn = $("#btn-transcript-copy");
    if (copyBtn) copyBtn.hidden = true;

    fetch(apiBase() + "/api/transcript?v=" + encodeURIComponent(videoId), { cache: "no-store" })
      .then(function (r) { return r.json(); })
      .then(function (d) {
        if (btn) { btn.disabled = false; }
        if (!d || !d.ok) {
          if (btn) btn.textContent = "Get transcript";
          if (status) {
            status.hidden = false;
            status.textContent = (d && d.error) || "No transcript could be read for this video.";
          }
          return;
        }

        transcriptData = d;
        tsWanted = !(CFG.transcript && CFG.transcript.timestampsDefault === false);

        var cb = $("#ts-timestamps");
        if (cb) cb.checked = tsWanted;

        var toolbar = $("#transcript-toolbar");
        if (toolbar) toolbar.hidden = false;

        if (btn) btn.hidden = true;
        if (status) status.hidden = true;

        var copyBtn2 = $("#btn-transcript-copy");
        if (copyBtn2) {
          copyBtn2.hidden = false;
          copyBtn2.textContent = transcriptAdUrl()
            ? (CFG.transcript.adButtonLabelWithAd || "Copy transcript")
            : (CFG.transcript.adButtonLabel || "Copy transcript");
        }

        var note = $("#transcript-note");
        if (note) {
          note.textContent = transcriptAdUrl()
            ? (CFG.transcript.adButtonNote || "One click supports the site at no cost to you.")
            : "Free to copy. No sign-up, nothing sent anywhere.";
        }

        renderTranscript();
      })
      .catch(function () {
        if (btn) { btn.disabled = false; btn.textContent = "Get transcript"; }
        if (status) {
          status.hidden = false;
          status.textContent = "Could not read the transcript. Please try again.";
        }
      });
  }

  function initTranscript() {
    var toggle = $("#ts-timestamps");
    if (toggle) {
      toggle.addEventListener("change", function () {
        tsWanted = !!toggle.checked;
        renderTranscript();
      });
    }

    var copyBtn = $("#btn-transcript-copy");
    if (copyBtn) copyBtn.addEventListener("click", onTranscriptAction);

    // A new video clears the old transcript.
    var input = $("#video-url");
    if (input) {
      input.addEventListener("input", function () {
        if (transcriptData) {
          transcriptData = null;
          var rows = $("#transcript-rows");
          var toolbar = $("#transcript-toolbar");
          var status = $("#transcript-status");
          var btn = $("#btn-transcript");
          var cb = $("#btn-transcript-copy");
          if (rows) { rows.hidden = true; rows.textContent = ""; }
          if (toolbar) toolbar.hidden = true;
          if (status) status.hidden = true;
          if (btn) { btn.hidden = false; btn.disabled = false; btn.textContent = "Get transcript"; }
          if (cb) cb.hidden = true;
        }
      });
    }
  }

  /* The sticky mobile banner stays hidden until it has something in it. */
  function initAdAnchor() {
    var bar = $("#ad-anchor");
    var slot = $("#ad-anchor-slot");
    var close = $("#ad-anchor-close");
    if (!bar || !slot) return;

    if (slot.querySelector("iframe, ins, img, script, div")) bar.hidden = false;

    if (close) {
      close.addEventListener("click", function () { bar.hidden = true; });
    }

    // Watch for a network injecting a creative after load.
    if ("MutationObserver" in window) {
      var mo = new MutationObserver(function () {
        if (slot.querySelector("iframe, ins, img, script, div")) {
          bar.hidden = false;
          mo.disconnect();
        }
      });
      mo.observe(slot, { childList: true, subtree: true });
    }
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

  /* Google Consent Mode v2.
     Defaults are set to "denied" in the page head, so nothing is stored on the
     device until the visitor chooses. Accepting upgrades the signal to
     "granted", which is what lets Google serve personalised advertising —
     the better-paying inventory. Declining keeps everything denied, so no
     ad cookie is written at all. Either way the choice is honoured. */
  function gtagConsent(granted) {
    if (typeof window.gtag !== "function") return;
    try {
      window.gtag("consent", "update", {
        ad_storage: granted ? "granted" : "denied",
        ad_user_data: granted ? "granted" : "denied",
        ad_personalization: granted ? "granted" : "denied",
        analytics_storage: granted ? "granted" : "denied"
      });
    } catch (e) { /* never block the page on this */ }
  }

  /* Terms + Privacy + Cookies all count as accepted only through the banner's
     "Accept all" button, so the legal pages are genuinely agreed to before
     anything downloads or any ad loads. */
  function consentGiven() {
    return readConsent() === "accepted";
  }

  /* Someone tried to download before answering. Bring the banner back into
     view and say why, instead of silently doing nothing. */
  function showConsentGate() {
    var banner = $("#cookie-consent");
    if (banner) {
      banner.hidden = false;
      banner.classList.add("is-nudge");
      setTimeout(function () { banner.classList.remove("is-nudge"); }, 1800);
    }
    showError("Please accept the Terms of Service, Privacy Policy and Cookie Policy to download.");
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
      gtagConsent(true);
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

  /* ---------- Ad blocker notice ----------
     A bait element with the class names blockers hide. If it comes back
     display:none or zero-height, something is hiding ads, so we show a polite
     note asking the visitor to allow them.

     This deliberately does NOT try to defeat the blocker. Routing around one
     is an arms race that ends in the visitor leaving, and Google treats
     circumventing ad blocking as invalid traffic — which is how sites lose
     their ad account entirely. Asking is the version that keeps the revenue. */
  function initAdBlockNotice() {
    var cfg = CFG.adBlockNotice || {};
    if (cfg.enabled === false) return;

    var bait = document.createElement("div");
    bait.className = "adsbox ad-banner ad-placement text-ad advertisement";
    bait.setAttribute("aria-hidden", "true");
    bait.style.cssText =
      "position:absolute;left:-9999px;top:-9999px;width:1px;height:1px;pointer-events:none";
    document.body.appendChild(bait);

    setTimeout(function () {
      var style = window.getComputedStyle(bait);
      var hidden =
        bait.offsetHeight === 0 ||
        bait.offsetWidth === 0 ||
        style.display === "none" ||
        style.visibility === "hidden" ||
        style.opacity === "0";

      if (bait.parentNode) bait.parentNode.removeChild(bait);
      if (!hidden) return;

      var note = $("#adblock-note");
      if (!note) return;
      note.hidden = false;

      var close = $("#adblock-note-close");
      if (close) {
        close.addEventListener("click", function () { note.hidden = true; });
      }
    }, 700);
  }

  /* ---------- Alias tip ----------
     Shown at the "Get link" moment: adding SOS to a YouTube link works the
     same on this site and starts the download faster. One per visit, never
     blocking the download, and it closes itself. */
  function showAliasHint() {
    var cfg = CFG.aliasHint || {};
    if (cfg.enabled === false) return;

    var host = (cfg.domain || "SOSyoutube.com").replace(/^https?:\/\//, "").replace(/\/+$/, "");

    try {
      if (sessionStorage.getItem("savetube-alias-hint") === "1") return;
      sessionStorage.setItem("savetube-alias-hint", "1");
    } catch (e) { /* private mode: still show it once */ }

    var el = $("#alias-hint");
    if (!el) return;

    var textEl = $("#alias-hint-text");
    if (textEl) {
      textEl.innerHTML = (cfg.text || "Tip: add SOS to the YouTube link and it works the same here, but starts faster.") +
        ' <strong>' + host + '/watch?v=' + (videoId || "VIDEOID") + "</strong>";
    }

    el.hidden = false;
    el.classList.add("is-in");

    var closed = false;
    function hide() {
      if (closed) return;
      closed = true;
      el.classList.remove("is-in");
      setTimeout(function () { el.hidden = true; }, 300);
    }

    var close = $("#alias-hint-close");
    if (close) close.onclick = hide;
    setTimeout(hide, (Number(cfg.seconds) || 9) * 1000);
  }

  /* ---------- Deep links ----------
     A shared link such as /watch?v=ID, /video/ID or /?v=ID opens the result
     straight away, so a link that looks like a YouTube link still works here. */
  function autoFromUrl() {
    var params = new URLSearchParams(window.location.search);

    var id = params.get("v") || "";
    if (!id) {
      // /video/ID, /v/ID, /embed/ID
      var m = window.location.pathname.match(/\/(?:video|v|embed)\/([A-Za-z0-9_-]{11})/);
      if (m) id = m[1];
    }
    if (!id || !/^[A-Za-z0-9_-]{11}$/.test(id)) return false;

    var input = $("#video-url");
    var form = $("#search-form");
    if (!input || !form) return false;

    input.value = "https://www.youtube.com/watch?v=" + id;
    try {
      form.dispatchEvent(new Event("submit", { cancelable: true, bubbles: true }));
    } catch (e) {
      try { if (typeof handleSubmit === "function") handleSubmit({ preventDefault: function () {} }); } catch (e2) { return false; }
    }
    return true;
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

    var unlockClose = $("#unlock-close");
    if (unlockClose) unlockClose.addEventListener("click", closeModal);

    var unlockModal = $("#unlock-modal");
    if (unlockModal) {
      unlockModal.addEventListener("click", function (e) {
        if (e.target === this) closeModal();
      });
    }

    initTabs();
    initTrim();
    initProgressClose();   // the Close button on the progress overlay
    initTranscript();      // in-page transcript + timestamps toggle
    initAdAnchor();        // mobile sticky ad bar
    initCookieConsent();
    initAdBlockNotice();   // a gentle note if ads are being hidden

    // A shared link (/watch?v=ID, /video/ID, /?v=ID) opens the result at once.
    autoFromUrl();

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
