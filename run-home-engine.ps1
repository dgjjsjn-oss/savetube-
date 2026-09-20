# ============================================================
#  SaveTube — HOME ENGINE LAUNCHER
#  Run this on your HOME computer where YouTube/TikTok/Instagram
#  are NOT blocked. It starts the SaveTube engine and opens a
#  secure tunnel. Paste the printed URL into your admin panel
#  (Remote Engine tab) and the live site will use YOUR home
#  connection to fetch every video. No cookies, no account.
# ============================================================

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $MyInvocation.MyCommand.Path

Write-Host "`n==============================" -ForegroundColor Cyan
Write-Host "  SaveTube Home Engine" -ForegroundColor Cyan
Write-Host "==============================" -ForegroundColor Cyan

# 1) Check node exists
$node = Get-Command node -ErrorAction SilentlyContinue
if (-not $node) { Write-Host "Node.js not found. Install it first." -ForegroundColor Red; exit 1 }

# 2) Token for the tunnel (protects the engine from being borrowed)
$tokFile = Join-Path $root ".engine-token.txt"
$engineToken = ""
if (Test-Path $tokFile) { $engineToken = (Get-Content $tokFile -Raw).Trim() }
if (-not $engineToken) {
  $engineToken = -join ((48..57)+(65..90)+(97..122) | Get-Random -Count 24 | ForEach-Object {[char]$_})
  Set-Content -Path $tokFile -Value $engineToken -NoNewline
  Write-Host "Generated engine token." -ForegroundColor Yellow
}
Write-Host "Engine token: $engineToken" -ForegroundColor Green
Write-Host "(This same value will be shown in the admin panel after you paste the URL.)" -ForegroundColor DarkGray

# 3) Start the engine on port 8787 (engine mode uses the same server; the
#    /api/info /api/download /api/transcript endpoints are what the tunnel exposes)
$log = Join-Path $root "home-engine.log"
Write-Host "Starting engine on port 8787 ..." -ForegroundColor Cyan
$engine = Start-Process node -ArgumentList "server.js" -WorkingDirectory $root -PassThru -WindowStyle Hidden -RedirectStandardOutput $log -RedirectStandardError $log
Write-Host "Engine PID: $($engine.Id) (log: $log)" -ForegroundColor Green

Start-Sleep -Seconds 3
try {
  $h = Invoke-WebRequest -Uri "http://localhost:8787/health" -UseBasicParsing -TimeoutSec 10
  Write-Host "Local engine health: $($h.StatusCode) $($h.Content)" -ForegroundColor Green
} catch {
  Write-Host "Engine did not answer on :8787 - check home-engine.log" -ForegroundColor Red
  Stop-Process -Id $engine.Id -Force -ErrorAction SilentlyContinue
  exit 1
}

# 4) Open a tunnel. Try cloudflared (best) then localhost.run (no install).
$cloudflared = Get-Command cloudflared -ErrorAction SilentlyContinue
$url = ""
if ($cloudflared) {
  Write-Host "Using cloudflared tunnel..." -ForegroundColor Cyan
  $tunnel = Start-Process cloudflared -ArgumentList "tunnel --url http://localhost:8787 --no-autoupdate" -PassThru -WindowStyle Hidden -RedirectStandardOutput (Join-Path $root "tunnel.log") -RedirectStandardError (Join-Path $root "tunnel.log")
  Write-Host "Waiting for tunnel URL (up to 25s)..." -ForegroundColor DarkGray
  for ($i = 0; $i -lt 25; $i++) {
    Start-Sleep -Seconds 1
    if (Test-Path (Join-Path $root "tunnel.log")) {
      $m = Select-String -Path (Join-Path $root "tunnel.log") -Pattern "https://[a-z0-9-]+\.trycloudflare\.com" -AllMatches
      if ($m -and $m.Matches.Count -gt 0) { $url = $m.Matches[0].Value; break }
    }
  }
  if (-not $url) { Write-Host "cloudflared did not print a URL. Check tunnel.log" -ForegroundColor Red; Stop-Process -Id $engine.Id -Force -ErrorAction SilentlyContinue; exit 1 }
} else {
  Write-Host "cloudflared not found - using localhost.run instead (no install needed)..." -ForegroundColor Cyan
  $tunnel = Start-Process ssh -ArgumentList "-o StrictHostKeyChecking=no -o ServerAliveInterval=60 -R 80:localhost:8787 nokey@localhost.run" -PassThru -WindowStyle Hidden -RedirectStandardOutput (Join-Path $root "tunnel.log") -RedirectStandardError (Join-Path $root "tunnel.log")
  Write-Host "Waiting for tunnel URL (up to 25s)..." -ForegroundColor DarkGray
  for ($i = 0; $i -lt 25; $i++) {
    Start-Sleep -Seconds 1
    if (Test-Path (Join-Path $root "tunnel.log")) {
      $m = Select-String -Path (Join-Path $root "tunnel.log") -Pattern "https://[a-z0-9-]+\.lhr\.life" -AllMatches
      if ($m -and $m.Matches.Count -gt 0) { $url = $m.Matches[0].Value; break }
    }
  }
  if (-not $url) { Write-Host "localhost.run did not print a URL. Check tunnel.log" -ForegroundColor Red; Stop-Process -Id $engine.Id -Force -ErrorAction SilentlyContinue; exit 1 }
}

# 5) Save the URL + token to a state file the admin panel can read.
"$url`n$engineToken" | Set-Content -Path (Join-Path $root ".engine-state.txt") -Encoding UTF8
Write-Host "`n================================================" -ForegroundColor Green
Write-Host "  HOME ENGINE IS LIVE!" -ForegroundColor Green
Write-Host "  URL  : $url" -ForegroundColor Green
Write-Host "  Token: $engineToken" -ForegroundColor Green
Write-Host "================================================" -ForegroundColor Green
Write-Host "`nNow paste these into your admin panel (Remote Engine tab)." -ForegroundColor Cyan
Write-Host "Keep this window open - closing it stops the engine." -ForegroundColor Yellow
Write-Host ""

# Keep the script alive so the engine + tunnel stay up
try {
  while ($true) {
    Start-Sleep -Seconds 30
    if ($engine.HasExited) { Write-Host "Engine crashed! Restarting..." -ForegroundColor Red; exit 1 }
  }
} finally {
  Stop-Process -Id $engine.Id -Force -ErrorAction SilentlyContinue
  if ($tunnel) { Stop-Process -Id $tunnel.Id -Force -ErrorAction SilentlyContinue }
}