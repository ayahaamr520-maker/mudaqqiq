@echo off
title Mudaqqiq - build browser extension
cd /d "%~dp0"
where node >nul 2>nul || (echo Node.js is not installed. Get the LTS version from https://nodejs.org then run this again. & pause & exit /b 1)
node tools\build-extension.mjs
echo.
echo Now open chrome://extensions (or edge://extensions), turn on Developer mode,
echo click "Load unpacked" and choose this folder:
echo   %~dp0extension
echo (If it is already loaded, just click the reload arrow on its card.)
pause
