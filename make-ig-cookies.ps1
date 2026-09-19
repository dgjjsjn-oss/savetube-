# SaveTube — cookie unlock helper (YouTube + TikTok + Instagram)
# ---------------------------------------------------------------
# Datacentre servers (like Render) get blocked by YouTube/TikTok/Instagram:
# "Sign in to confirm you're not a bot". A logged-in session fixes it.
# This script exports the session cookies from your local Brave/Chrome
# browser into cookies.txt, which the server automatically uses for EVERY
# platform (the file holds all sites, not just Instagram).
#
# HOW TO USE (5 minutes, once):
#   1. Log into youtube.com, tiktok.com and instagram.com in Brave/Chrome.
#   2. CLOSE the browser completely (cookie db is locked while it runs).
#   3. Run this script:  powershell -ExecutionPolicy Bypass -File make-ig-cookies.ps1
#   4. LOCAL: restart the server (node server.js).
#      LIVE (Render): open Render dashboard > your service > Environment >
#      add variable  YT_COOKIES  with the FULL text of cookies.txt pasted in
#      (open cookies.txt in Notepad, copy everything), Save -> redeploy.
#      The server writes cookies.txt itself at boot from YT_COOKIES.
#
# NOTE: cookies.txt contains YOUR sessions. Never commit it to git
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
  $txt = Get-Content $out -Raw
  $has = @()
  if ($txt -match "youtube\.com") { $has += "youtube" }
  if ($txt -match "tiktok\.com") { $has += "tiktok" }
  if ($txt -match "instagram\.com") { $has += "instagram" }
  if ($sz -gt 50) {
    Write-Host "OK - cookies.txt written ($sz bytes). Sites inside: $($has -join ', ')." -ForegroundColor Green
    if ($has.Count -lt 3) { Write-Host "Missing some sites — log into youtube.com, tiktok.com and instagram.com in $browser, close it, and run again." -ForegroundColor Yellow }
    else { Write-Host "All three platforms unlocked. Restart the server (local) or paste into Render YT_COOKIES (live)." -ForegroundColor Green }
    exit 0
  }
}
Write-Host "Export did not produce a usable cookie file. Check that you are logged in, in $browser, and that the browser is closed." -ForegroundColor Yellow
exit 1