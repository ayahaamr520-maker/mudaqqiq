@echo off
title Mudaqqiq - Word add-in server (HTTPS)
cd /d "%~dp0"
where node >nul 2>nul || (echo Node.js is not installed. Get the LTS version from https://nodejs.org then run this again. & pause & exit /b 1)
if not exist "%USERPROFILE%\.office-addin-dev-certs\localhost.crt" (
  echo First run: installing a local HTTPS certificate. Click YES when Windows asks.
  call npx --yes office-addin-dev-certs@3.0.1 install
)
echo.
echo  Word add-in server is running at  https://localhost:3000
echo  Now open Word (web or desktop) and load:  word-addin\manifest.xml
echo  Keep this window open while you use the add-in. Close it to stop.
echo.
npx --yes http-server@14.1.1 . -p 3000 -c-1 -S -C "%USERPROFILE%\.office-addin-dev-certs\localhost.crt" -K "%USERPROFILE%\.office-addin-dev-certs\localhost.key"
pause
