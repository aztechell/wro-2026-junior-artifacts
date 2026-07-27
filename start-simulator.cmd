@echo off
setlocal
cd /d "%~dp0"

where node.exe >nul 2>&1
if errorlevel 1 (
  echo Node.js is required to run the simulator.
  echo Install Node.js and try again.
  pause
  exit /b 1
)

echo Starting the simulator...
echo Close this window or press Ctrl+C to stop it.
echo.

node scripts\static-server.mjs --open
if errorlevel 1 (
  echo.
  echo The simulator could not be started.
  pause
  exit /b 1
)
