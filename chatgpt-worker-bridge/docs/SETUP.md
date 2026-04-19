# Setup

1. Node.js **20+** (uses `import.meta.dirname`, native `fetch`).

2. Clone / copy `chatgpt-worker-bridge` and enter the folder.

3. Copy env and set OpenAI key:

```bash
cp .env.example .env
```

Edit `.env`:

- `OPENAI_API_KEY` — required for real model output (without it executor echoes a fallback).
- `OPENAI_MODEL` — default `gpt-4o-mini`.
- `PORT` — API port (default `8787`).
- `DATABASE_URL` — default `file:./data/bridge.db` (relative to repo root when server/migrate run from root).
- `SERVER_BASE_URL` — worker uses this to reach API (default `http://127.0.0.1:8787`).
- `WORKER_POLL_MS` — idle poll interval.
- `TASK_CALLBACK_URL` — optional HTTP POST after done/fail.

4. Prepare dirs and DB:

```bash
node scripts/setup-data.mjs
npm install
npm run db:migrate
npm run build
```

5. Start server then worker (two terminals) or `npm run dev` for development.

## Prisma

Schema: `packages/db/prisma/schema.prisma`.  
Migrations: `packages/db/prisma/migrations/`.  
Always run `npm run db:migrate` from **repository root** so `DATABASE_URL=file:./data/bridge.db` resolves to `./data/bridge.db` here.
