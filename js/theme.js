/* SaveTube theme: no-flash initializer.
   Runs in <head> before paint. Reads saved theme, falls back to OS. */
(function () {
  var KEY = "savetube_theme";
  var saved = null;
  try { saved = localStorage.getItem(KEY); } catch (e) { saved = null; }
  var prefersLight = window.matchMedia && window.matchMedia("(prefers-color-scheme: light)").matches;
  var theme = saved || (prefersLight ? "light" : "dark");
  document.documentElement.setAttribute("data-theme", theme);
})();