@echo off
title Mudaqqiq - load add-in into Word desktop
cd /d "%~dp0"
echo Make sure "2-start-word-addin-server.bat" is already running in another window.
echo Word will open with the Mudaqqiq button on the Home tab.
call npx --yes office-addin-debugging@6.1.2 start word-addin\manifest.xml desktop --app word --no-debug
pause
