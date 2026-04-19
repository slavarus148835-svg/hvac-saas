@echo off
title HVAC SaaS Launcher
echo Запуск HVAC SaaS...

echo.
echo === Запуск MCP Bridge ===
start "MCP Bridge" cmd /k "cd /d C:\Users\User\hvac-saas\mcp-bridge && node server.cjs"

timeout /t 2 > nul

echo.
echo === Запуск Frontend ===
start "Frontend" cmd /k "cd /d C:\Users\User\hvac-saas && npm run dev"

timeout /t 2 > nul

start "" http://localhost:3000/calculator

echo.
echo Готово. Если браузер не открылся сам, открой:
echo http://localhost:3000/calculator
pause
