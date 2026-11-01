# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project status

H.O.M.E.R. is a self-hosted, fully local household assistant (inventory, groceries, schedule, tasks, maintenance reminders, plus a local-LLM chat assistant). **The repo is currently only scaffolding**: `README.md` and a stub `package.json` (no workspaces, no source, no real scripts; `npm test` just errors). Everything below under "Planned architecture" is the design from the README, not existing code. Verify against the actual tree before relying on it, and update this file as the code lands.

## Commands

Intended (per README; not yet wired up in `package.json`):

```bash
pnpm install
pnpm db:migrate    # Drizzle migrations (drizzle-kit)
pnpm dev           # web :3000, api :3001
docker compose up -d
```

- Requires Node 24+, pnpm (pinned to `pnpm@12.16.1` via `packageManager`), and Ollama running at `127.0.0.1:11434` with `qwen3-vl:8b` (vision/OCR) and `qwen3:8b` (chat + tool calling) pulled.
- Tests are planned as Vitest + fast-check (property-based) for pure logic. No lint/test/single-test commands exist yet; add them here once defined.

## Planned architecture

pnpm-workspace TypeScript monorepo:

- `apps/web`: React + Vite + Tailwind; typed tRPC client (`src/trpc.ts`) with TanStack Query. Pages: Dashboard, Inventory, Schedule, Tasks, Assistant.
- `apps/api`: Hono server with the tRPC adapter. `routers/` (inventory, groceries, schedule, tasks, maintenance, assistant), `ai/` (Ollama client + tool-call loop), `jobs/` (node-cron daily ~06:00 depletion and due-maintenance checks), `db/` (Drizzle schema + migrations, SQLite via `better-sqlite3`).
- `packages/shared`: the spine of the app. `schemas.ts` (Zod schemas shared by DB, tRPC, and LLM tools), `tools.ts` (LLM tool definitions + dispatcher types), `domain.ts` (pure functions such as `daysRemaining`, `nextDueDate`).

Key design constraints:
- **Single source of truth for types**: Zod schemas in `packages/shared` are reused for DB rows, tRPC input/output, and LLM tool-call arguments. Change them there, not per layer.
- **Pure domain logic** lives in `shared/domain.ts` with no I/O, which is what the property-based tests target.
- **Everything local**: no cloud services, accounts, or outbound data. The LLM runs only via Ollama on localhost; the DB is one SQLite file.
- The assistant router drives an Ollama tool-calling loop whose tools dispatch into the same domain/DB layer as the tRPC routers.
- Deployment: Docker Compose with web + api + ollama.
