@echo off
cd /d %~dp0
start cmd /k npm run bridge
timeout /t 2
start cmd /k npm run agent
