# ============================================================
#  SaveTube - push your site to GitHub
# ------------------------------------------------------------
#  Double-click PUSH-TO-GITHUB.cmd instead of running this
#  directly. This script:
#    1. opens the GitHub page that creates your token
#    2. asks you to paste the token once
#    3. pushes everything to your repo
#    4. removes the token from the project afterwards, so it is
#       never left lying in a file
# ============================================================

$ErrorActionPreference = "Continue"
Set-Location -LiteralPath $PSScriptRoot

$OWNER = "dgjjsjn-oss"
$REPO  = "savetube-"

function Line { param($t) Write-Host $t }

Line ""
Line "============================================================"
Line "  SaveTube - push to GitHub"
Line "============================================================"
Line ""

# ---- is git here? ----
$git = Get-Command git -ErrorAction SilentlyContinue
if (-not $git) {
  Line "  Git is not installed. Install it from https://git-scm.com/download/win"
  Line "  then run this file again."
  Line ""
  exit 1
}

if (-not (Test-Path ".git")) {
  Line "  This folder is not a git repository. Run this from the project folder."
  Line ""
  exit 1
}

# ---- show what is about to be sent ----
Line "  Files ready to send:"
$changed = git status --short
if (-not $changed) { Line "    (nothing new - everything already committed)" }
else { $changed | ForEach-Object { Line "    $_" } }
Line ""

# ---- step 1: token page ----
Line "  STEP 1 - the GitHub page that creates your token is opening now."
Line ""
Line "    On that page:"
Line "      * Note          : type  SaveTube"
Line "      * Expiration    : choose  90 days  (or No expiration)"
Line "      * Tick the box  : repo   (the first big one)"
Line "      * Scroll down, click the green  Generate token"
Line "      * Click  Copy  on the long code that appears  (starts with ghp_)"
Line ""

Start-Process "https://github.com/settings/tokens/new?scopes=repo&description=SaveTube"

Line "  STEP 2 - come back to this window and paste the token."
Line "  (Right-click in this window pastes it. It will NOT be shown as you paste - that is normal.)"
Line ""

$token = ""
while ([string]::IsNullOrWhiteSpace($token)) {
  $sec = Read-Host "  Paste token, then press Enter" -AsSecureString
  $token = [Runtime.InteropServices.Marshal]::PtrToStringAuto(
             [Runtime.InteropServices.Marshal]::SecureStringToBSTR($sec))
  $token = ($token -replace '\s', '')
  if ([string]::IsNullOrWhiteSpace($token)) {
    Line "    Nothing was pasted - try again (or close this window to cancel)."
  }
}

if ($token.Length -lt 20) {
  Line ""
  Line "  That does not look like a token (too short). A token is around 40+ characters."
  Line "  Make sure you copied the token itself, not the address of the page."
  Line ""
  exit 1
}

# ---- step 3: push ----
Line ""
Line "  STEP 3 - sending your site to GitHub..."
Line ""

$cleanUrl = "https://github.com/$OWNER/$REPO.git"
$authUrl  = "https://$OWNER`:$token@github.com/$OWNER/$REPO.git"

git remote set-url origin $authUrl 2>&1 | Out-Null

$env:GIT_TERMINAL_PROMPT = "0"
$out = git push -u origin main 2>&1
$code = $LASTEXITCODE
$out | ForEach-Object { Line "    $_" }

# The token must never stay in the project's config.
git remote set-url origin $cleanUrl 2>&1 | Out-Null

Line ""
if ($code -eq 0) {
  Line "============================================================"
  Line "  DONE - your code is on GitHub."
  Line "============================================================"
  Line ""
  Line "  Next: put it online with Render (free)."
  Line ""
  Line "    1. Go to  https://render.com   and sign up with GitHub"
  Line "    2. Click  New +   then  Web Service"
  Line "    3. Pick the repository  $OWNER/$REPO"
  Line "    4. Render reads the settings by itself - just click  Create"
  Line "    5. Wait 3-5 minutes. You get a link like"
  Line "         https://savetube-xxxx.onrender.com"
  Line ""
  Line "  That link is your live, public website."
  Line ""
} else {
  Line "============================================================"
  Line "  The push did not go through."
  Line "============================================================"
  Line ""
  Line "  Most common causes:"
  Line "    * the token was copied with a missing character - try again"
  Line "    * the token was not given the  repo  permission - make a new one"
  Line "    * the token already expired"
  Line ""
  Line "  Also check that this repository exists and is yours:"
  Line "    https://github.com/$OWNER/$REPO"
  Line ""
}
Line "  The token has been removed from the project folder."
Line ""
