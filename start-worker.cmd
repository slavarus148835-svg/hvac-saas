@echo off
setlocal
cd /d "%~dp0"
if not exist "logs\" mkdir "logs" 2>nul
where node >nul 2>&1
if errorlevel 1 (
  exit /b 1
)
node "%~dp0telegram-autoworker\watcher.js"
set EXITCODE=%ERRORLEVEL%
exit /b %EXITCODE%
