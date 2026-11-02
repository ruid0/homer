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

### Docker Compose (production-ish)
```bash
docker compose up -d
```
## Stack

| Layer | Choice | Notes |
|---|---|---|
| Language | TypeScript (end-to-end) | Monorepo, shared types |
| Package manager | pnpm workspaces | |
| Frontend | React + Vite + Tailwind | TanStack Query via tRPC |
| API framework | Hono | Express-shaped, official tRPC adapter |
| RPC | tRPC | Typed client, no codegen |
| ORM | Drizzle ORM | Migrations via drizzle-kit |
| Database | SQLite (`better-sqlite3`) | One file to back up |
| Validation | Zod | Shared schemas: DB, tRPC, LLM all use them |
| Pure logic tests | Vitest + fast-check | Property-based tests |
| Scheduling | node-cron | Daily jobs |
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
- Notifications are implemented via `ntfy`
