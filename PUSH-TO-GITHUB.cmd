@echo off
title SaveTube - push to GitHub
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0push.ps1"
echo.
echo Press any key to close this window...
pause >nul
