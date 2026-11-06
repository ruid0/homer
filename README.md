# H.O.M.E.R. is a virtual local Assistant

* Home — it’s for your home

* Operations — schedule, calendar, todo lists

* Maintenance — filter changes, softener salt, cleaning

* Essentials — groceries, consumables

* Reminders — “check the milk,” “buy salt,” “change furnace filter”

A self-hosted household dashboard that knows what's running out, what needs
doing, and what's coming up. Runs entirely localy, no cloud, no accounts, no data leaving the house.

## Quick start

### Prerequisites

- **Node.js** 24+
- **pnpm** 12+ (`npm i -g pnpm`)
- **Ollama** ([install](https://ollama.com/download)) — running at `127.0.0.1:11434`
- **Docker** (optional, for the all-in-one compose setup)

### Pull the models
s
```bash
ollama pull qwen3-vl:8b     # vision / OCR
ollama pull qwen3.5:9b       # chat + tool calling
```
If hardware allows use 

```bash
ollama pull qwen3.8:27b-mlx # chat + tool calling
```

### Install & run (dev)
```bash
git clone https://github.com/you/homer.git
cd homer
pnpm install
pnpm db:migrate
pnpm dev

Web: http://localhost:3000

API: http://localhost:3001

Ollama: http://localhost:11434

```

### Docker Compose (the household copy)

Ollama keeps running natively on the Mac (Docker on macOS has no GPU access). Compose runs only the web and the api.

```bash
docker compose up -d --build
```

- **Data.** The database lives in the `homer-data` Docker volume, so the household copy starts empty and is separate from the
  dev database in `apps/api`. Nothing from dev reaches the image.
- **Time zone.** Containers run in UTC, so compose sets `TZ` for the api (default `America/Edmonton`). To change it, export `TZ`
  in your shell before `docker compose up` or edit `docker-compose.yml`; `.env.local` is not read for this one. The assistant
  works out "today" and "Friday" from it.
- **Ollama.** The api reaches Ollama on the Mac through `host.docker.internal`. If the assistant says it can't reach it, check
  from inside the container: `docker compose exec api node -e "fetch('http://host.docker.internal:11434/api/tags').then(r => console.log(r.status))"`.
  If that fails (OrbStack, Colima), start Ollama with `OLLAMA_HOST=0.0.0.0`.
- **Reaching it.** The web port is bound to this machine only (`127.0.0.1:3000`), and the api is not published at all: HOMER has
  no login, so it should not be open to the whole network. Phones and tablets use Tailscale, which also gives the HTTPS an
  installable app needs:

  ```bash
  tailscale serve --bg 3000
  ```

  Open the `https://<machine>.<tailnet>.ts.net` address it prints, then use "Add to Home Screen" (iOS) or "Install app" (Android).
- **Daily usage.** Stock counts down: once a day (05:30 household time, `DEPLETION_TIME`) and when the api starts, each item
  with a usage estimate loses what the days since the last run used up, and items that become low are added to the grocery
  list. A Mac that slept catches up when the api next starts. Like `TZ`, set `DEPLETION_TIME` in your shell or a root `.env`.
- **Backups.** The api copies the database once a day at 06:00 (household time) into `./backups` on this machine, as
  `homer-YYYY-MM-DD.db`. It keeps the last 14 days and one per week for six weeks before that, and never touches other
  files in the folder. If the Mac slept through 06:00, the api backs up when it next starts. Set `BACKUP_HOST_DIR` to use
  another folder (an external disk or a synced folder), and `BACKUP_TIME` to change the time. Like `TZ`, export them in
  your shell or put them in a root `.env` before `docker compose up`; `.env.local` is not read for these. A failed backup is written to
  the api log: `docker compose logs api`. The folder is on this Mac, so it does not protect against losing the Mac unless
  it is synced somewhere.

  To restore, stop the api, copy a backup over the live file, then start it again (replace the file name):

  ```bash
  ls backups   # pick a file
  docker compose stop api
  docker compose run --rm --no-deps --entrypoint sh api -c \
    "rm -f /data/homer.db-wal /data/homer.db-shm && cp /backups/homer-2026-11-05.db /data/homer.db"
  docker compose up -d api
  ```
- **Update** after pulling: `docker compose up -d --build`. Migrations run when the api starts.

## Stack

| Layer | Choice | Notes |
|---|---|---|
| Language | TypeScript (end-to-end) | Monorepo, shared types |
| Package manager | pnpm workspaces | |
| Frontend | React + Vite + Tailwind | TanStack Query via tRPC |
| API framework | Hono | Express-shaped, official tRPC adapter |
| RPC | tRPC | Typed client, no codegen |
| ORM | Drizzle ORM | Migrations via drizzle-kit |
| Database | SQLite (`better-sqlite3`) | One file, backed up daily |
| Validation | Zod | Shared schemas: DB, tRPC, LLM all use them |
| Pure logic tests | Vitest + fast-check | Property-based tests |
| Scheduling | node-cron | Daily backup (more jobs in v2) |
| LLM runtime | Ollama (`127.0.0.1:11434`) | Local only |
| Vision model | `qwen3-vl:8b` | OCR, labels, receipts |
| Chat/tools model | `qwen3.5:9b` or `qwen3.8:27b-mlx` | Tool calling |
| Deployment | Docker Compose | web + api (Ollama runs natively on the Mac) |```

## Repo layout

```bash
homer/
├── apps/
│   ├── web/                  React + Vite + Tailwind frontend
│   │   └── src/
│   │       ├── pages/        Dashboard, Inventory, Schedule, Tasks, Assistant
│   │       ├── components/
│   │       └── trpc.ts       typed tRPC client
│   └── api/                  Hono + tRPC backend
│       └── src/
│           ├── routers/      inventory, groceries, schedule, tasks, maintenance, assistant
│           ├── ai/           Ollama client + tool-call loop
│           ├── jobs/         node-cron: daily depletion & due-maintenance checks
│           └── db/           Drizzle schema + migrations
├── packages/
│   └── shared/               the spine of the app
│       └── src/
│           ├── schemas.ts    Zod schemas (DB ↔ tRPC ↔ LLM all share these)
│           ├── tools.ts      LLM tool definitions + dispatcher types
│           └── domain.ts     pure functions (daysRemaining, nextDueDate…)
├── docker-compose.yml
├── CLAUDE.md
└── README.md
```

## Architecture 

```bash
┌──────────────────────────────────────────────────────────────────────┐
│                            BROWSER (LAN)                             │
│   React + Vite + Tailwind  ──►  tRPC client (typed, no codegen)      │
└───────────────────────────────┬──────────────────────────────────────┘
                                │ HTTP / WebSocket
┌───────────────────────────────▼──────────────────────────────────────┐
│                          API (Hono)                                  │
│                                                                      │
│  tRPC routers                                                        │
│  inventory · groceries · schedule · tasks · maintenance · assistant  │
│                                                                      │
│  ┌──────────────┐  ┌────────────────┐  ┌──────────────────────────┐  │
│  │ Domain logic │  │ Scheduler      │  │ AI orchestrator          │  │
│  │ (pure TS)    │  │ (node-cron)    │  │ tool loop · Zod ·        │  │
│  │              │  │ daily 06:00    │  │ dispatcher               │  │
│  └──────────────┘  └────────────────┘  └────────────┬─────────────┘  │
│                                                     │                │
│  ┌─────────────────────────────────────────────┐    │                │
│  │ Drizzle ORM → SQLite (single .db file)      │    │                │
│  └─────────────────────────────────────────────┘    │                │
└─────────────────────────────────────────────────────┼────────────────┘
                                                      │ HTTP 127.0.0.1:11434
                                       ┌──────────────▼─────────────┐
                                       │          OLLAMA            │
                                       │  qwen3-vl:8b   (vision)    │
                                       │  qwen3.5:9b    (tools)     │
                                       └────────────────────────────┘
```

## Remote access and notifications

- For remote access the most streightforward way is to use `Tailscale` installed on both the server and a users devices
- Notifications are not built yet. They are planned for v2 with `ntfy` (see `docs/v2-plan.md`).
