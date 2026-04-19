#!/bin/bash
# Двойной клик в Finder: если macOS спросит права, один раз выполните в Терминале:
#   chmod +x START_AI_OFFICE.command
cd "$(dirname "$0")" || exit 1
echo ""
node launch.js
echo ""
read -r -p "Нажмите Enter, чтобы закрыть окно... " _
