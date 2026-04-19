# Usage

## API

| Method | Path | Description |
|--------|------|-------------|
| GET | `/health` | Liveness |
| POST | `/api/tasks` | Body `{ "type": "code_task", "payload": { "prompt": "...", "repoPath": "optional/relative" } }` |
| GET | `/api/tasks/:id` | Task detail |
| POST | `/api/worker/claim` | Atomically pick oldest `new` → `running`, return task or 204 |
| POST | `/api/worker/:id/complete` | Body `{ "result": { ... } }`, `running` → `done` |
| POST | `/api/worker/:id/fail` | Body `{ "error": "..." }`, `running` → `error` |

## `code_task` result shape

```json
{
  "summary": "string from model (truncated stored)",
  "changedFiles": [],
  "logs": "shell + openai meta"
}
```

## Callback

If `TASK_CALLBACK_URL` is set, server POSTs JSON `{ taskId, status, result? | error? }` after complete/fail (fire-and-forget).

## cURL examples

Create:

```bash
curl -s -X POST http://127.0.0.1:8787/api/tasks \
  -H "Content-Type: application/json" \
  -d '{"type":"code_task","payload":{"prompt":"List 3 colors."}}'
```

Fetch:

```bash
curl -s http://127.0.0.1:8787/api/tasks/TASK_ID_HERE
```
