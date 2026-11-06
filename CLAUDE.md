# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project status

H.O.M.E.R. is a self-hosted, fully local household assistant: inventory, groceries, schedule, tasks, maintenance reminders, plus a local-LLM chat assistant.

**v1 is built and released (v1.0.0).** It has items with learned usage, the grocery list, people, tasks and events, Home, the assistant (eleven tools, journal and Undo, eval harness via `pnpm eval`), a PWA (no service worker, not offline) and Docker Compose for the household copy (see the README). There are no notifications yet: HOMER is pull-only. **v2 is in progress**, in `docs/v2-plan.md`. **Built: the daily backup** (`apps/api/src/backups`, `jobs/backups.ts`, into `./backups` on the Mac; see the README). **Built: per-person routines** (a weekly grid at People, then Routine; see `docs/design-routines.md`). **Planned:** jobs and ntfy, maintenance schedules, receipts, voice, Russian and English. "Architecture" below is the target design, so check the actual tree before relying on it, and update this file as code lands.

**Docs and their status.** Each file in `docs/` starts with `Status: <State> (<detail>) · Owner · Last updated · Source`. States: Draft, Ready (agreed, not started), In progress, Built, Superseded. Slice designs: `design-slice-1-items.md`, `-2-groceries`, `-3-schedule`, `-4-dashboard`, `-5-assistant`, `-6-packaging`, `-7-learned-usage` (all Built); `design-routines.md` (Built); `design-ui-pass.md` (Superseded by slice 4); `v2-plan.md` (In progress); `PRD.md` follows the same Status line (Built for v1 scope). Update the Status line when the state changes.

**Product requirements:** `docs/PRD.md` defines scope, acceptance criteria and open questions. Read it during DEFINE and PLAN, and update it when scope changes.

## Commands

```bash
pnpm install
pnpm typecheck     # tsc --noEmit in every package (pnpm -r)
pnpm test          # vitest run (Vitest + fast-check)
pnpm exec vitest related <file> --run   # tests touching one file
pnpm dev           # web :3000, api :3001
pnpm db:generate   # new Drizzle migration from apps/api/src/db/schema.ts (run in apps/api)
pnpm db:migrate    # apply migrations by hand; the api also applies them on boot
```

Household copy: `docker compose up -d --build` (see the README). Not set up yet: CI, lint.

- Requires Node 24+, pnpm (pinned to `pnpm@12.16.1` via `packageManager`), and Ollama at `127.0.0.1:11434` with `qwen3-vl:8b` (vision/OCR) and `qwen3.5:9b` (chat + tool calling) pulled.
- TypeScript 7. Shared settings live in `tsconfig.base.json`; each package extends it. `packages/shared` loads no Node or DOM types on purpose, so domain code stays pure.

## Architecture

pnpm-workspace TypeScript monorepo:

- `apps/web`: React + Vite + Tailwind; typed tRPC client (`src/trpc.ts`) with TanStack Query. Pages: Home, Items, Groceries, Schedule, People (with a Routine page per person), Assistant.
- `apps/api`: Hono server with the tRPC adapter. `routers/` (inventory, groceries, schedule, tasks, routines, maintenance, assistant), `ai/` (Ollama client + tool-call loop), `jobs/` (node-cron daily ~06:00 depletion and due-maintenance checks), `db/` (Drizzle schema + migrations, SQLite via `better-sqlite3`).
- `packages/shared`: the spine of the app. `schemas.ts` (Zod schemas shared by DB, tRPC, and LLM tools), `tools.ts` (LLM tool definitions + dispatcher types), `domain.ts` (pure functions such as `daysRemaining`, `nextDueDate`).

Key design constraints:
- **Single source of truth for types**: Zod schemas in `packages/shared` are reused for DB rows, tRPC input/output, and LLM tool-call arguments. Change them there, not per layer.
- **Pure domain logic** lives in `shared/domain.ts` with no I/O, which is what the property-based tests target.
- **Everything local**: no cloud services, accounts, or outbound data. The LLM runs only via Ollama on localhost; the DB is one SQLite file.
- The assistant router drives an Ollama tool-calling loop whose tools dispatch into the same domain/DB layer as the tRPC routers.
- **Installable as an app**: the web app is a PWA that can be added to a phone or tablet home screen, even though it's a website.
- Deployment: Docker Compose with web + api; Ollama runs natively on the Mac host (Docker on macOS has no GPU access).

## Claude Code setup

- **Skills** (`.claude/skills/`): `coding-style` (the owner's code style), `homer-ui` (visual and interaction rules for `apps/web`), `frontend-design` (from [anthropics/skills](https://github.com/anthropics/skills/tree/main/skills/frontend-design), Apache 2.0; distinctive visual design, and where it conflicts with `homer-ui` the `homer-ui` rules win), `test-driven-development` (red-green-refactor loop).
- **Subagent** (`.claude/agents/reviewer.md`): read-only, fresh-context review of the uncommitted diff.
- **Hooks** (`.claude/settings.json`, `.claude/hooks/`):
  - `guard.sh` (before edits and shell commands) blocks touching `.env` files and the SQLite database directly. Change data through the app or a Drizzle migration.
  - `check.sh` (after editing `.ts`/`.tsx`) runs `pnpm typecheck` and the related tests. If it reports a failure, fix it before moving on.

## How we work

Every piece of work moves through six phases, in order. **Name the phase you are in**, and don't start one before the previous one is done:

1. **DEFINE**: the problem, who it's for, what's in and out of scope, and what "done" means.
   Output: a short written definition plus the open questions for the owner. No design and no code yet.
2. **PLAN**: the approach: files, schema or interface changes, risks, and the order of work.
   Output: a plan the owner approves or changes. Nothing is built before the plan is agreed.
3. **BUILD**: implement the agreed plan in small, coherent commits, each one buildable. The post-edit hook typechecks and runs related tests automatically.
   **Ship in small PRs, not whole slices.** When a meaningful part is done, testable and works by itself (for example the shared domain code, or an api router with its tests, or one page), run VERIFY, REVIEW and SHIP for that part before starting the next. A slice is usually several PRs. Each PR must leave `main` working: typecheck and tests pass, and nothing half-wired is visible in the app. The PLAN names the PR boundaries up front.
4. **VERIFY**: evidence, not claims. Run `pnpm typecheck` and `pnpm test`, and for anything visual, check the running app with the Playwright MCP. Say what passed and what didn't.
5. **REVIEW**: run the `reviewer` subagent on the diff and address its Must fix items.
6. **SHIP**: open a PR with `.github/pull_request_template.md` filled in, wait for CI (once it exists), merge, then rebuild with `docker compose up -d --build`.
