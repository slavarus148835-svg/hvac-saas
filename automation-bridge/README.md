# automation-bridge

Минимальный Node.js/Express сервер для связки ChatGPT -> Cursor (пока без реального Cursor API).

## Режимы работы

- `BRIDGE_MODE=mock`  
  Задача проходит цикл `queued -> running -> done` через имитацию (`setTimeout`).
- `BRIDGE_MODE=real`  
  Задача остаётся в `queued` и помечается как подготовленная к отправке в Cursor.
- `TELEGRAM_BOT_TOKEN` + `TELEGRAM_ALLOWED_CHAT_ID`  
  Включают Telegram-режим: задачи можно отправлять сообщениями в бота.

## Что есть (endpoints)

- `POST /tasks` — создать задачу
- `GET /run?text=...` — быстрый запуск задачи из браузера
- `POST /tasks/preview` — собрать `title/prompt` без создания задачи
- `GET /tasks` — список всех задач (сначала новые)
- `GET /tasks/:id` — получить состояние задачи
- `GET /tasks/:id/timeline` — lifecycle + история событий
- `POST /tasks/:id/plan` — сохранить управляемый план выполнения
- `POST /tasks/:id/user-response` — передать ответ пользователя по уточняющим вопросам
- `POST /tasks/:id/execute` — перевести задачу в выполнение
- `POST /tasks/:id/revise` — запросить доработку по текущей задаче без создания новой
- `POST /tasks/:id/cursor-webhook` — частично обновить задачу от внешнего обработчика
- `POST /task-result` — упрощённый отчёт агента / локального watcher (`taskId`, `status`: `done` | `error`, `summary`, `changedFiles`, `logs`, при ошибке поле `error`)
- `POST /tasks/:id/controller-review` — решение контролера (ChatGPT side)
- автоматический `controller-review` после завершения execute/report
- `GET /tasks/:id/summary` — компактная сводка задачи для контролера
- `POST /tasks/:id/review` — решение ревью (`approve` / `reject`)
- `POST /tasks/:id/archive` — архивировать задачу
- `GET /dashboard` — агрегированная сводка по оркестрации
- `GET /health` — состояние bridge (`mode`, `totalTasks`, `uptimeSeconds`)
- `GET /telegram-debug` — диагностика Telegram (`telegramEnabled`, `allowedChatId`, последние событие/ошибка, meta последнего сообщения)

Хранение задач временное — в памяти процесса.

## Установка и запуск

1. Перейти в папку:
   - `cd automation-bridge`
2. Установить зависимости:
   - `npm install`
3. Скопировать переменные окружения:
   - `copy .env.example .env` (Windows)
4. При необходимости сменить режим в `.env`:
   - `BRIDGE_MODE=mock` или `BRIDGE_MODE=real`
   - для Telegram дополнительно:
     - `TELEGRAM_BOT_TOKEN=...`
     - `TELEGRAM_ALLOWED_CHAT_ID=...`
5. Запустить:
   - `npm start`

Сервер поднимется на `http://localhost:4100` (или `PORT` из `.env`).

Локальная веб-панель доступна по адресу:
- `http://localhost:4100`

Через панель можно:
- запускать задачи кнопкой "Запустить задачу"
- смотреть последний результат запуска
- видеть список задач и открывать их summary

Если Telegram env не заполнены, bridge работает как обычно и пишет в лог:
- `telegram disabled: TELEGRAM_BOT_TOKEN or TELEGRAM_ALLOWED_CHAT_ID is empty`

## Telegram режим

Bridge поддерживает Telegram Bot API через long polling (`services/telegramBot.js`).

### Как создать бота

1. Откройте [@BotFather](https://t.me/BotFather)
2. Создайте бота командой `/newbot`
3. Скопируйте токен в `.env`:
   - `TELEGRAM_BOT_TOKEN=<ваш_токен>`
4. Узнайте ваш chat id и добавьте:
   - `TELEGRAM_ALLOWED_CHAT_ID=<ваш_chat_id>`

Только `TELEGRAM_ALLOWED_CHAT_ID` может отправлять команды боту. Другие чаты получают `access denied`.

### Команды бота

- Отправьте обычный текст — bridge создаст quick task с `source: "telegram"`, сохранит `telegramChatId` / `telegramMessageId`, запустит flow (`plan -> execute -> auto-review`), дальше при `BRIDGE_MODE=real` может подключаться корневой watcher.
- `/status <taskId>` — полный статус: `goal`, `status`, `agentStatus`, `reviewStatus`, `controllerDecision`, `lifecycleStage`, последние 3 строки лога.
- `/last` — последняя задача: `taskId`, `status`, `controllerDecision`, `lifecycleStage`, `summary` (если есть в `result`).
- `/help` — краткая справка по использованию.

### Полный Telegram flow

1. Пользователь пишет боту текст → `telegramBot` → `runQuickTaskFromText` с `source: "telegram"` и id сообщения / чата.
2. Bridge ставит план и `execute` (как quick flow); при `real` задача остаётся в очереди до внешнего исполнителя / watcher.
3. После появления результата (`POST /task-result`, webhook или mock-runner) bridge помечает задачу `done` и запускает auto-review.
4. Функция `sendTelegramTaskUpdate` (`services/telegramBot.js`) шлёт в тот же чат второе сообщение с итогом:
   - `задача: <goal>`
   - `статус: done` или `error`
   - `summary: …`
   - при наличии — превью `changedFiles` (до 5 имён)
   - при ошибке — строка `ошибка: …`
5. При уходе на доработку (`revision_requested` / auto-revise / `POST /tasks/:id/revise`) в Telegram уходит: **«Задача отправлена на доработку»** (без дублирования при auto-revise: контроллерное решение подавляется, уведомление одно из `requestRevisionForTask`).

Первый ответ бота после текста задачи по-прежнему краткий (`taskId`, `goal`, `status`, короткий `summary`-статус); развёрнутый итог приходит отдельным сообщением после завершения выполнения.

### Быстрый запуск Telegram

1. Скопируйте `.env.example` в `.env` и заполните:
   - `TELEGRAM_BOT_TOKEN` — токен от [@BotFather](https://t.me/BotFather)
   - `TELEGRAM_ALLOWED_CHAT_ID` — ваш числовой chat id (только этот чат может писать боту)
2. Запустите bridge: `npm start` из папки `automation-bridge`
3. В логах при старте: `TELEGRAM_BOT_TOKEN present: yes/no`, `TELEGRAM_ALLOWED_CHAT_ID present: yes/no`, `telegram enabled: yes/no`, затем строка `[telegram] startup: ...`
4. В логах при **включённом** Telegram: проверка токена (`telegram bot token ok (...)` или `getMe failed`), затем polling
5. Напишите боту любой текст задачи или `/help` из разрешённого чата

**Без ручного редактирования `.env`:** откройте в браузере `http://localhost:4100/telegram-setup`, введите token/chat id и нажмите «Сохранить» — значения запишутся в `automation-bridge/.env`, бот перезапустится сам (перезапуск всего bridge не обязателен).

**Авто chat id при старте:** если в `.env` уже есть `TELEGRAM_BOT_TOKEN`, но нет `TELEGRAM_ALLOWED_CHAT_ID`, bridge при запуске вызывает `getUpdates` и, если есть последнее сообщение, дописывает `TELEGRAM_ALLOWED_CHAT_ID` в `.env`.

**Как понять, что Telegram реально подключён**

- В логах: `telegram enabled: yes`, затем `[telegram] bot started` / `getMe ok` и polling.
- **`GET /telegram-debug`** (например `http://localhost:4100/telegram-debug`) — JSON с полями `telegramEnabled`, `allowedChatId`, `lastTelegramEvent`, `lastTelegramError`, `lastTelegramMessageMeta` (последнее входящее сообщение и ошибки цепочки).
- На главной `/` в карточке Telegram — enabled/disabled, allowed chat id, последние event/error и кнопка «Открыть telegram debug».

Если бот «молчит», откройте `/telegram-debug`: при несовпадении чата в `lastTelegramError` будет строка `access denied: received chat id=... allowed=...`, в Telegram придёт ответ с вашим `chat.id`.

## Подключение как remote MCP server

- Запустите bridge: `npm start`
- Локальный URL для теста: `http://localhost:4100`
- Основная точка входа MCP: `POST /mcp`
- Для подключения из ChatGPT нужен публичный HTTPS URL (через tunnel: ngrok/cloudflared и т.п.)
- Проверка доступности: `GET /healthz`

## Примеры запросов

### Новый формат `POST /tasks` (основной)

```json
{
  "goal": "Доработать мобильный UX калькулятора",
  "targetPaths": ["app/calculator/page.tsx"],
  "constraints": ["Не ломать текущую бизнес-логику"],
  "acceptanceChecks": ["Проверить отсутствие горизонтального скролла"],
  "context": {
    "project": "hvac-saas",
    "page": "/calculator",
    "notes": "Приоритет мобильной версии"
  }
}
```

Bridge автоматически собирает:
- `title` — короткая версия `goal`
- `prompt` — структурированный текст из `goal`, `targetPaths`, `constraints`, `acceptanceChecks`, `context`

### Создать задачу (curl, новый формат)

```bash
curl -X POST http://localhost:4100/tasks \
  -H "Content-Type: application/json" \
  -d "{\"goal\":\"Добавить sticky блок действий\",\"targetPaths\":[\"app/calculator/page.tsx\"],\"constraints\":[\"Не ломать desktop\"],\"acceptanceChecks\":[\"Кнопки удобны на мобильном\"],\"context\":{\"project\":\"hvac-saas\",\"page\":\"/calculator\",\"notes\":\"Работа на объекте\"}}"
```

### Быстрый запуск из браузера

Открой в браузере:

`http://localhost:4100/run?text=добавь%20историю%20смет`

Что делает endpoint `/run`:
- создает задачу
- автоматически добавляет простой план (3 шага)
- ставит `needsUserInput=false`
- запускает выполнение
- делает редирект на `GET /tasks/:id/summary`

### Preview сборки задачи (без создания)

```bash
curl -X POST http://localhost:4100/tasks/preview \
  -H "Content-Type: application/json" \
  -d "{\"goal\":\"Подготовить мобильную форму\",\"targetPaths\":[\"app/calculator/page.tsx\"],\"constraints\":[\"Сохранить текущую логику\"],\"acceptanceChecks\":[\"Линтер без ошибок\"],\"context\":{\"project\":\"hvac-saas\"}}"
```

### Получить список задач

```bash
curl http://localhost:4100/tasks
```

Примеры фильтрации:

```bash
curl "http://localhost:4100/tasks?status=running"
curl "http://localhost:4100/tasks?reviewStatus=pending"
curl "http://localhost:4100/tasks?archived=true"
curl "http://localhost:4100/tasks?lifecycleStage=under_review"
```

### Получить задачу по id

```bash
curl http://localhost:4100/tasks/task_123
```

### Обновить задачу webhook-ом

```bash
curl -X POST http://localhost:4100/tasks/task_123/cursor-webhook \
  -H "Content-Type: application/json" \
  -d "{\"externalTaskId\":\"cursor-task-123\",\"agentStatus\":\"running\",\"status\":\"running\",\"result\":{\"summary\":\"что сделал Cursor\",\"changedFiles\":[\"app/calculator/page.tsx\"],\"checks\":[\"lint ok\"],\"notes\":[\"UI adjusted\"],\"diffSummary\":\"Updated calculator mobile layout\"},\"report\":{\"stage\":\"implementation\",\"message\":\"текущий этап\",\"progress\":50},\"logMessage\":\"Cursor started execution\",\"reviewStatus\":\"pending\"}"
```

### Запросить revision

```bash
curl -X POST http://localhost:4100/tasks/task_123/revise \
  -H "Content-Type: application/json" \
  -d "{\"reason\":\"Найдены проблемы в мобильной верстке\",\"instructions\":\"Исправить sticky-блок и размеры controls\",\"requestedBy\":\"controller\"}"
```

### Controller review

```bash
curl -X POST http://localhost:4100/tasks/task_123/controller-review \
  -H "Content-Type: application/json" \
  -d "{\"decision\":\"revise\",\"note\":\"Нужно поправить sticky-блок\",\"nextAction\":\"Переделать mobile controls\"}"
```

### Получить summary по задаче

```bash
curl http://localhost:4100/tasks/task_123/summary
```

### Получить timeline по задаче

```bash
curl http://localhost:4100/tasks/task_123/timeline
```

Пример ответа summary:

```json
{
  "id": "task_123",
  "goal": "Доработать мобильную версию",
  "status": "running",
  "agentStatus": "running",
  "reviewStatus": "pending",
  "controllerDecision": "revise",
  "changedFiles": ["app/calculator/page.tsx"],
  "diffSummary": "Updated calculator mobile layout",
  "checks": ["lint ok"],
  "lastReport": {
    "stage": "implementation",
    "message": "текущий этап",
    "progress": 50
  },
  "lastLogs": [
    { "at": "2026-01-01T12:00:00.000Z", "message": "Cursor started execution" }
  ]
}
```

### Решение ревью

```bash
curl -X POST http://localhost:4100/tasks/task_123/review \
  -H "Content-Type: application/json" \
  -d "{\"decision\":\"approve\",\"note\":\"Looks good\"}"
```

### Передать план по задаче

```bash
curl -X POST http://localhost:4100/tasks/task_123/plan \
  -H "Content-Type: application/json" \
  -d "{\"plan\":[\"Шаг 1\",\"Шаг 2\"],\"risks\":[\"Можно сломать верстку\"],\"needsUserInput\":false,\"questions\":[]}"
```

### Передать ответ пользователя

```bash
curl -X POST http://localhost:4100/tasks/task_123/user-response \
  -H "Content-Type: application/json" \
  -d "{\"answer\":\"Делаем без изменений desktop\"}"
```

### Запустить выполнение

```bash
curl -X POST http://localhost:4100/tasks/task_123/execute
```

### Архивировать задачу

```bash
curl -X POST http://localhost:4100/tasks/task_123/archive
```

### Dashboard

```bash
curl http://localhost:4100/dashboard
```

## Модель задачи

- `id`
- `title`
- `prompt`
- `goal`
- `targetPaths`
- `constraints`
- `acceptanceChecks`
- `context`
- `plan`
- `risks`
- `questions`
- `needsUserInput`
- `status` (`queued` | `running` | `done` | `failed`)
- `executionMode` (`mock` | `real`)
- `externalTaskId`
- `agentStatus` (`pending` | `submitted` | `running` | `finished` | `failed`)
- `reviewStatus` (`pending` | `approved` | `rejected`)
- `report`
- `reviewNotes`
- `controllerDecision`
- `lifecycleStage`
- `history`
- `lastAction`
- `archived`
- `revisionCount`
- `revisions`
- `latestRevision`
- `previousResults`
- `createdAt`
- `updatedAt`
- `result` (например `{ summary, changedFiles, checks }`)
- `logs`

## Совместимость

Старый формат с `title` + `prompt` также поддерживается.
Новый формат с `goal` является основным.

## Поток работы

1. `POST /tasks` — create task
2. `POST /tasks/:id/plan` — plan
3. `POST /tasks/:id/execute` — execute
4. `POST /tasks/:id/cursor-webhook` — report (для real mode)
5. Bridge автоматически выполняет `controller-review`:
   - `approve`, если `status=done` и результат непустой/без ошибок
   - `revise`, если есть ошибки или `result` пустой
6. При auto-`revise` Bridge автоматически запускает `/tasks/:id/revise` c причиной
7. `POST /tasks/:id/controller-review` — ручной review (опционально, если нужно переопределить решение)
8. `GET /tasks/:id/summary` / `GET /tasks/:id/timeline` — summary/history

Если `needsUserInput=true` после шага plan:
   - `POST /tasks/:id/user-response`

Lifecycle stages:

- `created`
- `planned`
- `waiting_user`
- `ready`
- `executing`
- `reported`
- `under_review`
- `revision_requested`
- `completed`
- `failed`

## Revision flow

- После проверки можно вызвать `POST /tasks/:id/revise`
- Bridge увеличивает `revisionCount`, создаёт `latestRevision`, сохраняет прошлый `result` в `previousResults`
- В `mock` режиме задача сразу запускается повторно
- В `real` режиме задача повторно отправляется через Cursor adapter (с revision-aware `externalTaskId`)
- Ревизия не создаёт новую задачу: используется тот же `task.id` с обновлением revision state
- При автоконтроле в логи добавляется:
  - `auto review: approved`
  - `auto review: revise triggered`

## Архитектура

- `server.js`  
  HTTP слой: валидация, хранение задач в памяти, CRUD/status endpoints.
- `services/taskRunner.js`  
  Единая точка запуска задачи: `runTask(task, store)`, `runMockTask(task, store)`, `runRealTask(task, store)`.
- `services/cursorAdapter.js`  
  Adapter layer для Cursor. Сейчас это заглушка (`submitTask`) без реального API-запроса.
- `services/telegramBot.js`  
  Telegram Bot API polling, команды (`/help`, `/status`, `/last`), quick-task и экспорт `sendTelegramTaskUpdate` / `sendTelegramText` для автоответов по завершении задачи.
- `services/telegramClient.js`  
  Минимальные вызовы Telegram API (`getUpdates` для авто chat id и страницы настройки).
- `services/dotEnvFile.js`  
  Чтение/обновление ключей в `.env` без ручного редактирования файлов.
