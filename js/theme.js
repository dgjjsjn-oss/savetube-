/* ============================================================
   SaveTube — theme (auto dark mode)

   Loaded in <head> before the page paints, so there is never a
   flash of the wrong colours.

   Behaviour:
     1. Follows the visitor's device setting (prefers-color-scheme)
        from the moment the page opens. Dark device = dark site.
     2. If the visitor presses the toggle, that choice is remembered
        and wins from then on.
     3. If the device setting changes later (for example the phone
        switches to night mode on a schedule), the site follows along
        until the visitor has picked a side.
   ============================================================ */

(function () {
  var KEY = "savetube-theme";
  var root = document.documentElement;

  function saved() {
    try { return localStorage.getItem(KEY); } catch (e) { return null; }
  }

  function systemMode() {
    if (!window.matchMedia) return "light";
    return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  }

  function apply(mode) {
    if (mode !== "dark") mode = "light";

    root.setAttribute("data-theme", mode);
    root.style.colorScheme = mode;

    // Keep the mobile browser bar in step with the page.
    var meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute("content", mode === "dark" ? "#0d1117" : "#0a7a3d");

    var btn = document.getElementById("theme-toggle");
    if (btn) {
      var next = mode === "dark" ? "light" : "dark";
      btn.setAttribute("aria-label", "Switch to " + next + " mode");
      btn.setAttribute("title", "Switch to " + next + " mode");
      btn.setAttribute("aria-pressed", mode === "dark" ? "true" : "false");
      var icon = btn.querySelector(".theme-icon");
      if (icon) icon.textContent = mode === "dark" ? "\u2600" : "\u263D";
    }
  }

  // 1. Apply immediately, before paint.
  apply(saved() || systemMode());

  // 2. Follow the device live while no choice has been made.
  if (window.matchMedia) {
    var mq = window.matchMedia("(prefers-color-scheme: dark)");
    var onChange = function (e) {
      if (!saved()) apply(e.matches ? "dark" : "light");
    };
    if (mq.addEventListener) mq.addEventListener("change", onChange);
    else if (mq.addListener) mq.addListener(onChange);
  }

  // 3. Public toggle.
  window.STTheme = {
    current: function () { return root.getAttribute("data-theme") || "light"; },
    set: function (mode) {
      try { localStorage.setItem(KEY, mode); } catch (e) {}
      apply(mode);
      return mode;
    },
    toggle: function () {
      return window.STTheme.set(window.STTheme.current() === "dark" ? "light" : "dark");
    }
  };

  // 4. Wire the button once the DOM exists (and again for late headers).
  function bind() {
    var btn = document.getElementById("theme-toggle");
    if (!btn || btn.getAttribute("data-bound") === "1") return;
    btn.setAttribute("data-bound", "1");
    btn.addEventListener("click", function () { window.STTheme.toggle(); });
    apply(root.getAttribute("data-theme") || "light");
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", bind);
  } else {
    bind();
  }
  window.addEventListener("load", bind);
})();
