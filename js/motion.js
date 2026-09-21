/* ============================================================
   SaveTube — motion.js (ADDITIVE premium layer, v5)
   Two small jobs, both optional, both invisible when the device
   or the user says no motion:

   1. CURSOR AURA — a soft brand-colored light drifts after the
      pointer over the page. Cheap (one div, transform only, rAF
      throttled), pointer-events none, desktop fine-pointer only.

   2. TAB HIBERNATION — when the tab is hidden, every CSS
      animation on the page is paused (html.motion-paused), so
      the background never burns CPU nobody is watching.

   Nothing here touches the download pipeline.
   ============================================================ */
(function () {
  "use strict";

  var reduced = false;
  try {
    reduced = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  } catch (e) { reduced = false; }
  var finePointer = false;
  try {
    finePointer = window.matchMedia && window.matchMedia("(hover: hover) and (pointer: fine)").matches;
  } catch (e) { finePointer = false; }

  /* ---- 1. Cursor aura ---- */
  function aura() {
    if (reduced || !finePointer) return;
    var html = document.documentElement;
    var el = document.createElement("div");
    el.className = "pointer-aura is-hidden";
    document.body.appendChild(el);

    var tx = -1000, ty = -1000;
    var cx = -1000, cy = -1000;
    var raf = null;

    function tick() {
      cx += (tx - cx) * 0.14;
      cy += (ty - cy) * 0.14;
      el.style.transform = "translate3d(" + cx + "px," + cy + "px,0)";
      if (Math.abs(tx - cx) > 0.6 || Math.abs(ty - cy) > 0.6) raf = requestAnimationFrame(tick);
      else raf = null;
    }
    function move(e) {
      tx = e.clientX;
      ty = e.clientY;
      el.classList.remove("is-hidden");
      if (!raf) raf = requestAnimationFrame(tick);
    }
    function leave() {
      el.classList.add("is-hidden");
    }
    window.addEventListener("mousemove", move, { passive: true });
    document.documentElement.addEventListener("mouseleave", leave, { passive: true });
    window.addEventListener("beforeunload", function () {
      try { window.removeEventListener("mousemove", move); } catch (e) {}
      try { el.remove(); } catch (e) {}
    }, { once: true });
  }

  /* ---- 2. Tab hibernation ---- */
  function hibernate() {
    var html = document.documentElement;
    function sync() {
      if (document.hidden) html.classList.add("motion-paused");
      else html.classList.remove("motion-paused");
    }
    document.addEventListener("visibilitychange", sync, { passive: true });
    sync();
  }

  function ready(fn) {
    if (document.readyState !== "loading") fn();
    else document.addEventListener("DOMContentLoaded", fn, { once: true });
  }

  ready(function () {
    aura();
    hibernate();
  });
})();