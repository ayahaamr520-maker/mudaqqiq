@echo off
title Mudaqqiq - remove add-in from Word desktop
cd /d "%~dp0"
call npx --yes office-addin-debugging@6.1.2 stop word-addin\manifest.xml desktop
echo Done. Restart Word if the button is still visible.
pause
