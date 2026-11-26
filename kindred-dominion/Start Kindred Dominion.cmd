@echo off
setlocal
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo Install Node.js 24 or newer, then run this file again.
  pause
  exit /b 1
)
if not exist node_modules (
  echo Installing dependencies. This first step requires internet access.
  call npm ci
  if errorlevel 1 (
    pause
    exit /b 1
  )
)
echo.
echo Kindred Dominion: http://127.0.0.1:5173/
echo Keep this window open while playing. Press Ctrl+C to stop the application.
echo.
if not exist server\.env.local (
  echo Configure the private backend environment first: npm run backend:configure
  echo Then run npm run db:migrate and npm run db:seed explicitly.
  echo For local practice alone, use npm run dev.
  pause
  exit /b 1
)
call npm run dev:all
if errorlevel 1 pause
