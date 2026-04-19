# ChatGPT ↔ local worker bridge

Node.js + TypeScript monorepo: REST API + SQLite (Prisma) + polling worker + OpenAI-backed `code_task` executor.

## Project tree

```
chatgpt-worker-bridge/
  package.json
  tsconfig.base.json
  .env.example
  apps/server/          # Fastify API
  apps/worker/          # polling worker + executor
  packages/db/          # Prisma + SQLite
  scripts/
  docs/
  data/                 # SQLite DB (gitignored)
  logs/                 # server.log, worker.log (gitignored)
  task-runs/            # per-task artifacts (gitignored)
```

## Commands

```bash
cd chatgpt-worker-bridge
cp .env.example .env
# fill OPENAI_API_KEY in .env
node scripts/setup-data.mjs
npm install
npm run db:migrate
npm run build
```

Terminal 1 — API:

```bash
npm run start:server
```

Terminal 2 — worker:

```bash
npm run start:worker
```

Dev (tsx, no build):

```bash
npm run db:migrate
npm run dev
```

## Create a test task

```bash
curl -s -X POST http://127.0.0.1:8787/api/tasks ^
  -H "Content-Type: application/json" ^
  -d "{\"type\":\"code_task\",\"payload\":{\"prompt\":\"Say hello in one line.\"}}"
```

PowerShell:

```powershell
Invoke-RestMethod -Method Post -Uri http://127.0.0.1:8787/api/tasks `
  -ContentType application/json `
  -Body '{"type":"code_task","payload":{"prompt":"Say hello in one line."}}'
```

Poll task:

```bash
curl -s http://127.0.0.1:8787/api/tasks/<TASK_ID>
```

## How to know it works

- `GET /health` → `{"ok":true,...}`
- POST task returns `id`; within a few seconds worker claims it, `GET /api/tasks/:id` shows `status` `done` (or `error` with `errorText`).
- `task-runs/<id>/` contains `prompt.txt`, `openai-response.txt` (or error file).
- Logs under `logs/`.

## Logs

| File | Source |
|------|--------|
| `logs/server.log` | API |
| `logs/worker.log` | worker loop + executor |
| `task-runs/<id>/` | prompt + model output |

## Automatic flow

1. Client `POST /api/tasks` → row `status=new`.
2. Worker `POST /api/worker/claim` → first `new` task becomes `running`, returned to worker.
3. Worker runs `code_task`: writes `task-runs/<id>/`, calls OpenAI, runs a shell probe, `POST .../complete` with `{ summary, changedFiles, logs }` or `.../fail`.
4. Server stores `result_json` / `error_text`, optional `TASK_CALLBACK_URL` POST.

See `docs/SETUP.md`, `docs/USAGE.md`, `docs/WINDOWS_AUTOSTART.md`.
