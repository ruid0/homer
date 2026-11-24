# MCP: using HOMER's tools from a local agent

Status: Built (read, write, due and maintenance tools; a real run from Pi is still to be checked) · Owner: Igor Bondarenko · Last updated: 2026-11-24 · Source: `docs/design-mcp.md` (the plan and the reasons)

HOMER can offer its tools over [MCP](https://modelcontextprotocol.io) to an agent running on the same machine. The agent changes household data only through HOMER's own rules: the same validation, the same journal and the same Undo as the in-app assistant. The repo is public, so tokens and household data never go in docs, tests or logs.

## 1. Turn it on

1. Make a token: `openssl rand -hex 32`. HOMER stays off for a token shorter than 16 characters.
2. Put `HOMER_MCP_TOKEN=<token>` in `.env.local` (Docker) or the api's environment (dev). Optionally set `MCP_PORT` (default 3002).
3. `docker compose up -d --build`. The api log says `mcp listening on ...`.

Where it listens:
- It has its own port, apart from the web page and from the api's 3001. It is never behind the web proxy, so `tailscale serve` can't share it.
- Dev: it binds `127.0.0.1`. Docker: the container binds every interface (`MCP_HOST=0.0.0.0`) and Compose publishes `127.0.0.1:3002` only, so just this machine reaches it.
- Every request needs `Authorization: Bearer <token>`. Without it the answer is 401.

## 2. Connect

The endpoint is `http://127.0.0.1:3002/mcp` (streamable HTTP, stateless).

- Pi: `pi mcp add homer --url http://127.0.0.1:3002/mcp ...` with the Authorization header, then `/mcp` to list the tools.
- A quick check: POST a JSON-RPC `tools/list` to the endpoint with `-H "authorization: Bearer $HOMER_MCP_TOKEN"`, `-H "content-type: application/json"` and `-H "accept: application/json, text/event-stream"`.

## 3. Tools

Reads change nothing. Every write needs `said` and returns an `actionId` when it changed something (`null` when nothing changed).

| Tool | Does | Arguments |
| --- | --- | --- |
| `list_items` | Tracked items with quantity and days remaining | none |
| `list_groceries` | The grocery list | none |
| `list_tasks` | Overdue, dated and undated tasks and events | `from?`, `to?` (dates) |
| `list_due` | What needs doing: maintenance overdue, due or coming up, routine rows still open today for everyone, tasks and events | `days?` (1 to 31, default 7; today is day one) |
| `mark_out` | An item is used up: quantity 0 and onto the grocery list | `name`, `said` |
| `restock_item` | Add stock to an item | `name`, `quantity`, `said` |
| `add_item` | Start tracking an item | `name`, `unit`, `quantity`, `daysPerUnit?`, `said` |
| `add_to_groceries` | Put something on the grocery list | `name`, `quantity?`, `said` |
| `mark_bought` | Mark a list entry bought | `name`, `quantity?`, `said` |
| `add_task` | Add a task | `title`, `dueDate?`, `dueTime?`, `repeat?`, `person?`, `said` |
| `add_event` | Add an event | `title`, `date`, `time?`, `person?`, `said` |
| `complete_task` | Finish a task | `title`, `said` |
| `complete_maintenance` | A maintenance job is done today, or on `doneOn` | `name`, `doneOn?`, `said` |
| `snooze_maintenance` | Hide a job until tomorrow (Not today) | `name`, `said` |
| `add_maintenance` | Start a job that repeats every N weeks, months or years | `name`, `every`, `unit`, `lastDoneOn?`, `said` |
| `undo` | Revert a change by its `actionId` | `actionId` |

Not offered on purpose: removing items, tasks, routines or maintenance jobs. Those stay in the app.

### Answers a write can give

A write returns `structuredContent` with a `status` the agent should read, not guess from the text.

| `status` | Meaning | What the agent does |
| --- | --- | --- |
| `done`, `snoozed`, `added`, and the in-app statuses | It worked; `actionId` is set | Say what changed; keep the id for Undo |
| `not_found` / `not_tracked` | No match; the known names are listed | Ask, or offer to add it |
| `ambiguous` | Several match; they are listed | Ask which one |
| `not_said` | The name was not the one the person said while similar ones exist | Ask the person |
| `error` | A rule refused it (already done today, name taken); `message` says why | Tell the person; nothing changed |
| `invalid` | An argument was wrong | Fix it and retry |

`undo` answers `undone`, `already_undone`, `changed` (the rows were edited since, so it can't be undone) or `missing`.

## 4. Rules for the agent

- Ask the person before every write, then pass their message **word for word** in `said`. HOMER checks the names against it, so a reworded message can make a good write refused.
- Dates are `YYYY-MM-DD`. A time the person said ("at 3pm") is not filled in for the agent: pass `time` yourself.
- "What's due this week?" is `list_due`. Use `list_tasks` only for a date range.
- After a write, tell the person what changed. "Undo that" is `undo` with the last `actionId`.

## 5. Troubleshooting

| Symptom | Cause |
| --- | --- |
| Nothing listens on 3002 | No `HOMER_MCP_TOKEN`, or under 16 characters (the api log says why), or the container wasn't rebuilt |
| 401 | The header is missing or the token is wrong |
| 404 for `/mcp` on the web page or on 3001 | Correct: MCP is only on its own port |
| Port already in use | Set `MCP_PORT` (and the Compose publish) to another port |
| A write comes back `not_said` | The name isn't in `said`; pass the person's exact words |

## 6. For developers

- Code: `apps/api/src/mcp/` (`app.ts` auth and transport, `server.ts` read tools, `writes.ts` writes and undo, `maintenance.ts` due and maintenance, `listen.ts` the listener). No SQL there: everything goes through `runTool`, the tRPC callers and the journal.
- A tool is offered only if it is in an explicit list. Add one on purpose, with a test, and update the table above.
- Shared schemas: `packages/shared/src/tools.ts` and `due.ts`. The pure due logic is property-tested.
- Check before a release: from a tailnet device port 3002 must not answer, and `/mcp` under the web must 404.
