@echo off
title Mudaqqiq - website demo
cd /d "%~dp0"
where node >nul 2>nul || (echo Node.js is not installed. Get the LTS version from https://nodejs.org then run this again. & pause & exit /b 1)
echo.
echo  Mudaqqiq website is starting...
echo  It will open at  http://localhost:8080/web/
echo  Keep this window open while you use it. Close it to stop.
echo.
npx --yes http-server@14.1.1 . -p 8080 -c-1 -o /web/
pause
