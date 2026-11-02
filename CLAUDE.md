# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project status

H.O.M.E.R. is a self-hosted, fully local household assistant: inventory, groceries, schedule, tasks, maintenance reminders, plus a local-LLM chat assistant.

**Early stage.** The pnpm workspace, package manifests, TypeScript configs and Claude Code tooling are in place. Each package has only a stub entry file (`export {};`); no features are built yet. "Architecture" below is the target design. Check the actual tree before relying on it, and update this file as code lands.

**Product requirements:** `docs/PRD.md` defines scope, acceptance criteria and open questions. Read it during DEFINE and PLAN, and update it when scope changes.

## Commands

```bash
pnpm install
pnpm typecheck     # tsc --noEmit in every package (pnpm -r)
pnpm test          # vitest run (Vitest + fast-check)
pnpm exec vitest related <file> --run   # tests touching one file
pnpm dev           # web :3000, api :3001
pnpm db:migrate    # Drizzle migrations (drizzle-kit); not configured yet
```

Not set up yet: `docker-compose.yml` (`docker compose up -d`), CI, lint.

- Requires Node 24+, pnpm (pinned to `pnpm@12.16.1` via `packageManager`), and Ollama at `127.0.0.1:11434` with `qwen3-vl:8b` (vision/OCR) and `qwen3:8b` (chat + tool calling) pulled.
- TypeScript 7. Shared settings live in `tsconfig.base.json`; each package extends it. `packages/shared` loads no Node or DOM types on purpose, so domain code stays pure.

## Architecture

pnpm-workspace TypeScript monorepo:

- `apps/web`: React + Vite + Tailwind; typed tRPC client (`src/trpc.ts`) with TanStack Query. Pages: Dashboard, Inventory, Schedule, Tasks, Assistant.
- `apps/api`: Hono server with the tRPC adapter. `routers/` (inventory, groceries, schedule, tasks, maintenance, assistant), `ai/` (Ollama client + tool-call loop), `jobs/` (node-cron daily ~06:00 depletion and due-maintenance checks), `db/` (Drizzle schema + migrations, SQLite via `better-sqlite3`).
- `packages/shared`: the spine of the app. `schemas.ts` (Zod schemas shared by DB, tRPC, and LLM tools), `tools.ts` (LLM tool definitions + dispatcher types), `domain.ts` (pure functions such as `daysRemaining`, `nextDueDate`).

Key design constraints:
- **Single source of truth for types**: Zod schemas in `packages/shared` are reused for DB rows, tRPC input/output, and LLM tool-call arguments. Change them there, not per layer.
- **Pure domain logic** lives in `shared/domain.ts` with no I/O, which is what the property-based tests target.
- **Everything local**: no cloud services, accounts, or outbound data. The LLM runs only via Ollama on localhost; the DB is one SQLite file.
- The assistant router drives an Ollama tool-calling loop whose tools dispatch into the same domain/DB layer as the tRPC routers.
- **Installable as an app**: the web app is a PWA that can be added to a phone or tablet home screen, even though it's a website.
- Deployment: Docker Compose with web + api; Ollama runs natively on the Mac host (Docker on macOS has no GPU access).

## Claude Code setup

- **Skills** (`.claude/skills/`): `coding-style` (the owner's code style), `homer-ui` (visual and interaction rules for `apps/web`), `test-driven-development` (red-green-refactor loop).
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
4. **VERIFY**: evidence, not claims. Run `pnpm typecheck` and `pnpm test`, and for anything visual, check the running app with the DevTools MCP. Say what passed and what didn't.
5. **REVIEW**: run the `reviewer` subagent on the diff and address its Must fix items.
6. **SHIP**: open a PR with `.github/pull_request_template.md` filled in, wait for CI (once it exists), merge, then rebuild with `docker compose up -d --build` (once compose exists).
