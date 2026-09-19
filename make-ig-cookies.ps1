# SaveTube — Instagram unlock helper
# ---------------------------------------------------------------
# Instagram now requires a logged-in session (yt-dlp cannot read public
# posts without cookies since mid-2026). This script exports the session
# cookies from your local Brave/Chrome browser into cookies.txt, which the
# server automatically uses for every platform (Instagram + anything else
# that needs auth).
#
# HOW TO USE:
#   1. Log into instagram.com in Brave/Chrome on this machine.
#   2. CLOSE the browser completely (cookie db is locked while it runs).
#   3. Run this script:  powershell -ExecutionPolicy Bypass -File make-ig-cookies.ps1
#   4. Restart the server. Instagram downloads now work.
#
# NOTE: cookies.txt contains YOUR session. Never commit it to git
# (.gitignore already excludes it) and never share it.

$ErrorActionPreference = "Stop"
$yt = "C:\Users\nasri\AppData\Local\Programs\Python\Python313\Scripts\yt-dlp.exe"
if (-not (Test-Path $yt)) {
  # try PATH
  $resolved = Get-Command yt-dlp -ErrorAction SilentlyContinue
  if (-not $resolved) { Write-Host "yt-dlp not found. Install it first." -ForegroundColor Red; exit 1 }
  $yt = $resolved.Source
}
$out = Join-Path $PSScriptRoot "cookies.txt"

$browser = "brave"
if (-not (Test-Path "$env:LOCALAPPDATA\BraveSoftware\Brave-Browser")) { $browser = "chrome" }

Write-Host "Exporting $browser cookies to $out ..." -ForegroundColor Cyan
& $yt "--cookies-from-browser" $browser "--cookies" $out "--simulate" "--skip-download" "--no-warnings" "https://www.instagram.com/" 2>&1 | Out-Null

Start-Sleep -Milliseconds 800
if (Test-Path $out) {
  $sz = (Get-Item $out).Length
  if ($sz -gt 50) {
    Write-Host "OK - cookies.txt written ($sz bytes). Restart the server and Instagram works." -ForegroundColor Green
    exit 0
  }
}
Write-Host "Export did not produce a usable cookie file. Check that you are logged into instagram.com in $browser and that the browser is closed." -ForegroundColor Yellow
exit 1