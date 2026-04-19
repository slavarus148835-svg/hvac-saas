# Telegram авто-воркер (файловый watcher)

## Как это работает

- Скрипт `telegram-autoworker/watcher.js` через **chokidar** следит за файлами в каталоге проекта (по умолчанию корень репозитория).
- Служебный вывод пишется в **`logs/worker.log`** (папка `logs/` не попадает в watcher, чтобы не зацикливаться на своих логах).
- События **add / change / unlink / addDir / unlinkDir** накапливаются и через **debounce** (`DEBOUNCE_MS` в `.env`, по умолчанию 4000 мс) отправляются **одним сообщением** в Telegram.
- Игнорируются: `node_modules`, `.git`, `.next`, `dist`, `build`, `coverage`, `*.log`.
- При старте в Telegram уходит: **«Авто-воркер запущен»** с абсолютным путём к проекту.
- При ошибках **chokidar**, **unhandledRejection**, **uncaughtException** — отдельное сообщение в Telegram и вывод в консоль.
- Корневой `watcher.js` для automation-bridge **не трогается**; Telegram-воркер лежит в `telegram-autoworker/watcher.js`, запуск: `npm run worker`.

## Где менять токен и chat

Файл **`.env`** в корне проекта (рядом с `package.json`):

- `TELEGRAM_BOT_TOKEN`
- `TELEGRAM_CHAT_ID`
- `WATCH_PATH` — что отслеживать (`.` = корень проекта)
- `DEBOUNCE_MS` — пауза перед пакетной отправкой (мс)

После правок перезапустите воркер (закройте окно / остановите процесс и снова `npm run worker` или перезапуск задачи в Планировщике).

## Ручной перезапуск

```bat
start-worker.cmd
```

или из корня проекта:

```bash
npm run worker
```

## Удалить автозапуск

В PowerShell от имени того же пользователя:

```powershell
Unregister-ScheduledTask -TaskName "ProjectTelegramWatcher" -Confirm:$false
```

Имя задачи в Планировщике заданий Windows: **`ProjectTelegramWatcher`**.

## Первичная установка автозапуска

```powershell
cd путь\к\hvac-saas
powershell -ExecutionPolicy Bypass -File .\install-autostart.ps1
```

Скрипт `install-autostart.ps1` намеренно без кириллицы в выводе, чтобы не ломаться из‑за кодировки PowerShell на части систем.

## Файл воркера

Реализация: **`telegram-autoworker/watcher.js`**. Корневой **`watcher.js`** остаётся для опроса automation-bridge (`npm run dev`).
