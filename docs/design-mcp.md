# MCP server: HOMER's tools for the owner's local agent. Definition, technical plan and system design

Status: In progress (approved 2026-11-23 with the proposed defaults; PR 1 built, PR 2 and 3 next) · Owner: Igor Bondarenko · Last updated: 2026-11-23 · Source: `docs/v2-plan.md` theme E ("MCP is a way of offering HOMER's tools to other apps… could be useful on its own later"), and `~/PetProjects/local-harness/docs/DESIGN.md` (v1.3) §7.1, §7.2 and milestone M2.

The repo is public. Tokens and the household's real data never go into this repo, its tests or its logs.

## 1. Problem

The owner is building **local-harness**: a private agent (Pi CLI + a local Qwen3.8-27B) that acts as one "brain" over HOMER and the Assistant app. It keeps its own memory, and it changes household data only through each app's tools. HOMER should offer its tools over **MCP**, so the owner can say "we're out of softener salt" or "what's due this week?" in the terminal and see the result in HOMER, with HOMER's validation, journal and Undo.

**What exists today:**
- **Tools:** 11 assistant tools in `packages/shared/src/tools.ts`, with Zod schemas (`toolSchemas`). Runs go through `runTool` in `apps/api/src/ai/tools.ts`, journalled in `ai/journal.ts`; `undoAction` exists and is exposed as `assistant.undo`.
- **Guard:** `refuseWrite` (`ai/guard.ts`) blocks a write whose names the person didn't say.
- **Maintenance:** has tRPC procedures (`list`, `add`, `markDone`, `snooze`, `undoDone`, …) but no assistant tools.
- **Networking:**
  - `apps/api/src/index.ts` calls `serve` with no hostname, so the api listens on every interface.
  - In Docker Compose, the api is **not published** (`expose` only).
  - The web container is published on `127.0.0.1:3000` and shared over Tailscale (`tailscale serve`).

**Done means:**
- From Pi on the Mac, `tools/list` shows HOMER's tools with schemas.
- "We're out of salt" puts salt on the grocery list after one confirmation in the agent, and it shows on the Stock page.
- "Undo that" reverts it.
- "What's due this week?" lists maintenance, routines and tasks correctly.
- Nothing about the MCP endpoint is reachable from a phone or tablet on the tailnet.
- The in-app assistant and its `pnpm eval` results are unchanged.

## 2. Decisions (proposed, for the owner)

1. **Same tools, same path.**
   - MCP calls go through `runTool` and the journal, exactly as the in-app assistant does. There's no second write path, and no SQL in the MCP code.
   - Tool inputs reuse `toolSchemas` from `packages/shared`.
2. **MCP-only tools live beside the shared ones.**
   - New tools for the agent (`list_due` and the maintenance tools) go in `packages/shared/src/mcpTools.ts`, built from the existing maintenance, routine and task input schemas.
   - The in-app assistant's 11 tools stay as they are, so its prompt and eval don't change.
   - Moving a tool into the in-app set later is a separate decision, made with `pnpm eval`.
3. **Its own port, local only.**
   - MCP is served by the api process on a **separate port** (`MCP_PORT`, default 3002), not under the web's `/api` proxy. That way `tailscale serve` (which shares the web on 3000) can never expose it.
   - Dev: the MCP listener binds `127.0.0.1`.
   - Docker Compose: publish `"127.0.0.1:3002:3002"` on the api service. That's still this machine only, and the web's ports and the api's 3001 are unchanged.
   - Off unless `HOMER_MCP_TOKEN` is set. Every request needs `Authorization: Bearer <token>`.
   - Inside a container, the caller's address is the Docker gateway rather than loopback, so the local-only guarantee comes from the binding and the host-side publish, plus the token. **Don't rely on a remote-address check alone.**
4. **The "you said it" guard stays on.** Every MCP write tool takes a `said` argument: the person's own words, which the agent passes through unchanged. `refuseWrite` runs against it, as it does for the in-app chat. The agent also asks the person before every write, so a write needs both.
5. **Destructive procedures aren't exposed:** `remove` on items, tasks, routines and maintenance. Those stay in the UI.

## 3. Out of scope
- Changing the in-app assistant, its tool set or its prompt.
- Remote MCP clients, OAuth, or exposure over Tailscale.
- HOMER calling the agent. HOMER only answers; it never calls out (PRD §5 stays true: MCP is an inbound, local-only listener).
- Receipts. These live in the Assistant app; the agent marks items bought in HOMER after a receipt is saved there (v2-plan theme C becomes that flow).

## 4. PR 1: the MCP listener with the read tools

- **Dependency:** the official MCP TypeScript SDK in `apps/api`. The SDK works with Zod 4 and its web-standard transport runs on Hono (checked in PR 1).
- **Code:**
  - `apps/api/src/mcp/server.ts`: `createMcpServer(db, deps)` registers tools from an explicit allowlist.
  - `apps/api/src/mcp/listen.ts`: a second `serve` on `MCP_PORT`, bound per decision 3, started from `index.ts` only when `HOMER_MCP_TOKEN` is set.
- **Read tools:** `list_items`, `list_groceries`, `list_tasks`. These are the existing tools, annotated `readOnlyHint: true`.
- **Results:**
  - Text is a short summary built from `messages.ts` (no inline strings, per `coding-style`).
  - `structuredContent` carries the rows.
- **Tests:**
  - A missing or wrong token gets 401.
  - The listener doesn't start without a token.
  - `tools/list` returns only allowlisted tools, with JSON schemas generated from Zod.
  - Each read tool's result matches `runTool` for the same call (in-memory DB).

## 5. PR 2: write tools through the journal

- **Tools exposed:** `mark_out`, `restock_item`, `add_item`, `add_to_groceries`, `mark_bought`, `add_task`, `add_event`, `complete_task`. Each schema is its `toolSchemas` entry plus `said: text`.
- **Path:** `refuseWrite(call, { recent: said, now: said }, knownNames)`, then `runTool`, which journals the change. The result includes the `actionId`.
- **`undo({ actionId })`** wraps `undoAction`, with the same copy as the chat's Undo.
- **Annotations:** `destructiveHint: false`, plus `idempotentHint` where true.
- **Tests:**
  - A refused write returns the guard's sentence and changes nothing.
  - An accepted write changes the same rows as the in-app path.
  - Undo reverts it, and a second undo reports "already undone".

## 6. PR 3: "what's due" and maintenance

- **`list_due({ days })`** (read): maintenance due or overdue (the rule the Upkeep page and the maintenance note already use), today's and the coming routine items, and open tasks in the window. Pure assembly in `packages/shared` (property-tested like `domain.ts`); the api only fetches.
- **Maintenance writes:**
  - `complete_maintenance({ name, doneOn?, said })` → `markDone`
  - `snooze_maintenance({ name, said })` → `snooze`
  - `add_maintenance({ … , said })` → `add`
  - Each resolves the name with `resolveName`, reuses the router's input schemas, and is journalled so `undo` works. **[verify]** whether `markDone` and `snooze` are journalled today, or whether `undoDone` is their undo. If they aren't journalled, use the existing per-feature undo rather than adding a second mechanism.
- **Tests:** due-window edge cases (today, overdue, snoozed, done today); name resolution for "softener salt" vs "Salt (softener)"; undo of a completion.

## 7. Risks
- **Exposure through the web proxy or Tailscale.** Avoided by design with a separate port that is never proxied. Check it in VERIFY from a tailnet device: it must not reach 3002, and `/mcp` under the web must 404.
- **Two write paths drifting apart.** Everything goes through `runTool` / the routers, and review blocks any SQL under `apps/api/src/mcp/`.
- **The agent paraphrasing `said`.** The guard would then refuse, or pass words the person never said. The agent's instructions say to pass the message verbatim. The person's confirmation in the agent is the second check.
- **The SQLite writer.** The MCP listener shares the api's `db` (same process), so there's no second writer on `homer.db`.

## 8. Open questions for the owner
1. Is the separate port (3002) with a host publish on `127.0.0.1` the right shape for the household copy, or should MCP run only in dev until the agent is in daily use?
2. Keep the `said` guard for MCP writes (proposed), or trust the agent's own confirmation step?
3. Should `list_due` include people's routines for everyone, or only the owner's?
4. Should `add_maintenance` be in v1, or only `complete` and `snooze`?

## 9. VERIFY (per PR)
- `pnpm typecheck` and `pnpm test`. The `check.sh` hook runs related tests after each edit.
- PR 1 onward:
  - `curl` to `127.0.0.1:3002` with and without the token.
  - From a phone on the tailnet: 3002 isn't reachable, and `/mcp` through the web returns 404.
  - Connect from Pi: `pi mcp add homer --url http://127.0.0.1:3002/mcp …`, then `/mcp`.
- PR 2–3: one real write from Pi, seen on the Stock or Upkeep page, then undone. `pnpm eval` is unchanged.
- REVIEW: the `reviewer` subagent. No `ui-reviewer` (no `apps/web` changes).
