@echo off
setlocal
cd /d "%~dp0"
title AI Office — Revenue PRO
echo.
node launch.js
set ERR=%ERRORLEVEL%
echo.
if %ERR% neq 0 echo [AI OFFICE] Exited with error code %ERR%
pause
endlocal
