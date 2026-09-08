@echo off
setlocal
cd /d "%~dp0"
title Fantasy Football Analyzer Launcher

powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\launch-windows.ps1"
set "FFA_EXIT=%ERRORLEVEL%"

if not "%FFA_EXIT%"=="0" (
  echo.
  echo The launcher could not finish. Read the error above, then press any key to close this window.
  pause >nul
)

exit /b %FFA_EXIT%
