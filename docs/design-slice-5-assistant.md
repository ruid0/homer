# Slice 5: Assistant. Definition, technical plan and system design

Status: draft · Owner: Igor Bondarenko · Date: 2026-11-04 · Source: PRD §3, §4.4, §5, §6, §7, §8 (slice 5). Builds on slices 1 to 4.

## 1. Definition (DEFINE)

**Problem.** Changing the house's state takes several taps: marking salt out, adding a task, restocking. People want to say it ("We're out of salt", "Remind me to call the plumber Friday") and ask ("What do we need?"). Everything stays local, using Ollama on the owner's Mac.

**For whom.** Everyone in the household, on a phone or a touchscreen.

**In scope**
- An **Assistant tab** with a chat screen backed by the local model. It reads and changes everything in slices 1 to 3 through tools that call the same code as the app.
- **Tools** (PRD §4.4): `list_items`, `mark_out`, `restock_item`, `add_item`, `list_groceries`, `add_to_groceries`, `mark_bought`, `list_tasks`, `add_task`, `add_event`, `complete_task`.
- **Validation.** Every tool call goes through the existing tRPC procedures, so the same Zod schemas check it. An invalid call is rejected and the model is told why and retried (twice at most). It is never written.
- **A one-line report** after any change ("Marked salt as out and added it to groceries").
- **Undo** on every change, until the person clears the chat or the rows have changed since (see §4).
- **Ask, don't guess.** An ambiguous or unknown name (two matches, or an untracked item) makes the assistant ask. It never invents items, quantities or dates.
- **History.** Messages are stored. After a reload the screen starts clean, with a visible "Earlier messages (N)" control to open the history and a Clear button to delete it. The model sees only the current screen's messages, not the stored history.
- **Works without Ollama.** If it is down or times out, the chat says so in one line and every other screen keeps working.
- An **eval harness** with at least 20 golden prompts, run against the real model, measuring the right tool, the right arguments, and asking when ambiguous. Starting target: 90% on `qwen3.5:9b`. Reply time is measured too.

**Out of scope**
- Voice input, photos and receipts (vision/OCR), learned usage (slice 7), streaming replies, any cloud model, and the ask bar on Home.
- Editing or removing items, tasks and events by chat (only the tools above).

**Done when** (PRD §4.4)
- "We're out of salt" marks salt out. If salt isn't tracked, the assistant asks whether to start tracking it.
- "Remind me to call the plumber Friday" creates a task due the coming Friday.
- "What do we need?" lists the grocery list and changes nothing.
- Undo puts every table back exactly as it was before the change.
- The eval reaches its target and its reply time on the owner's Mac is recorded.
- `pnpm typecheck` and `pnpm test` pass.

### Decisions (owner, 2026-11-04)

1. **Undo is in**, as its own PR after the tools work.
2. **A separate Assistant tab.**
3. **Start with `qwen3.5:9b`**, run the eval, then try a 27b model.
4. **History is kept.** After a reload the screen is clean but shows that history exists, and it can be cleared.

## 2. System overview

```
 Assistant page ──► assistant.send ──► loop ──► Ollama (127.0.0.1:11434, /api/chat with tools)
                                         │
                                         └─► tool ──► createCaller(appRouter) ──► existing procedures ──► SQLite
                                                         │
                          journal: rows before/after ────┴──► assistant_actions (for Undo)
 Assistant page ──► assistant.history / undo / clear / status
```

- The loop sends the system prompt, the current screen's messages and the tool list. If the model answers with tool calls, each runs and its result goes back to the model, until it answers in text (at most 6 rounds).
- Tools **resolve names to ids** (`mark_out({ name: "salt" })`). A name that matches nothing or several items returns a plain result ("not tracked", "matches: oat milk, milk") for the model to ask about. The model never handles ids.
- Dates: the system prompt carries today's date, the weekday, and a 14-day calendar (weekday to date), so "Friday" is a lookup, not arithmetic.
- No new network traffic: the only host the api calls is `OLLAMA_HOST`.

## 3. Data model

- `assistant_actions`: id, tool, args (JSON), result (JSON), changes (JSON, the journal diff), created_at, undone_at.
- `assistant_messages`: id, role (`user` or `assistant`), text, action_ids (JSON, the actions that reply made), created_at, cleared_at. Clear sets `cleared_at`, and rows are never deleted.

Both are new tables with one migration each.

## 4. Undo: a row journal, not per-tool inverses

Writing an inverse per tool (restore the quantity, reopen the grocery entry, remove the next repeat, and so on) is a lot of code that can drift from the app. Instead:

- Around every **write** tool call, in one transaction, the api reads all rows of `items`, `restocks`, `grocery_entries`, `tasks` and `events` before and after. A household has hundreds of rows, so this is cheap.
- The diff (rows added, rows changed with their old values, rows removed) is stored as `changes`.
- **Undo** reverses the diff in one transaction: remove the added rows, put changed rows back, re-insert removed rows.
- **Conflict rule.** Undo checks that every affected row still equals its "after" state. If someone has edited it since, Undo refuses with one line ("Salt changed since, so this can't be undone") and writes nothing.
- Undoing an action that added a restock removes that restock row, so it stops counting toward the learned estimate (slice 7). Rows added by an action are removed on Undo, which is the one place a row is deleted.
- Read tools write nothing and record no action.

This is covered by a property test: for random sequences of tool calls, Undo of the latest action gives back exactly the tables from before it.

## 5. Shared package and api layout

- `packages/shared/src/tools.ts`: tool names, descriptions, argument Zod schemas (turned into JSON Schema for Ollama), and the result types. Pure, no I/O.
- `apps/api/src/ai/`:
  - `ollama.ts`: the client, with a timeout, the `think` flag, and a typed "unreachable" error. It sits behind a small interface so tests use a scripted fake.
  - `loop.ts`: the tool-call loop and the retry on invalid arguments.
  - `tools.ts`: each tool, built on `createCaller`.
  - `journal.ts`: snapshot, diff, undo.
  - `prompt.ts`: the system prompt and the calendar table.
- `apps/api/src/routers/assistant.ts`: `send`, `history`, `undo`, `clear`, `status`.
- `apps/api/src/ai/eval/`: `golden.ts` (20 or more prompts, each with seeded data and the expected tool and arguments) and a runner behind `pnpm eval`. It needs Ollama, so it is not part of `pnpm test`.

## 6. Web (`apps/web/src`)

- A sixth nav item, **Assistant** (rail and bottom bar). The label's width on a 390px bottom bar is checked in the PR.
- `pages/AssistantPage.tsx`: the message list scrolls, the input and Send sit at the bottom (a 44px target at least), and a "Thinking…" line shows while a reply is pending. After a change the reply shows its one-line report and an **Undo** button, which turns into "Undone" or a conflict line.
- An empty chat shows example prompts as buttons ("What do we need?", "We're out of salt"), which send the prompt.
- "Earlier messages (N)" opens the stored history, and Clear empties it after a confirm.
- When `assistant.status` says Ollama is unreachable, the page shows one line and disables Send.
- All strings are in `copy.ts`.

## 7. Testing (red-green-refactor)

- **Pure and fake-model tests (in `pnpm test`):**
  - Tool arguments: valid and invalid, name resolution (none, one, several).
  - The loop with a scripted fake client: a text-only reply; one tool call then a reply; an invalid call that is retried and then given up; the round limit; Ollama unreachable.
  - Write tools record an action; read tools do not.
  - The journal: diff, Undo, the conflict refusal, and the property test above.
  - The "Friday" calendar table for every weekday.
- **The eval** (`pnpm eval`, real model): at least 20 golden prompts, including the three acceptance prompts, ambiguity (two matches), an untracked item, a prompt that must not change anything, and "don't invent a date". The first baseline sets the real latency target.
- The Assistant page is checked in the running app at 390px, 1512px and 1920px.

## 8. Work order (one PR at a time; the next starts after the previous is merged)

1. **This design doc.**
2. **Shared tools:** `tools.ts` with the argument schemas, name resolution and the calendar helper, with tests.
3. **Journal and Undo:** the `assistant_actions` table and migration, snapshot, diff and Undo, with the property test. No model yet.
4. **Tools over the app code:** the eleven tools on `createCaller`, wrapped in the journal, with tests. No model yet.
5. **Model and router:** the Ollama client, the loop, the prompt, `assistant_messages` and migration, and the `assistant` router, all tested with the fake client.
6. **Eval harness and the first baseline:** the golden set, `pnpm eval`, a run on `qwen3.5:9b`, prompt fixes, and a run on a 27b model. The numbers go in this doc and decide the default model.
7. **Assistant page:** the tab, chat, Undo, history, example prompts and the Ollama-down line. Marks slice 5 built here, in the PRD §8 and in `CLAUDE.md`.

Each PR runs VERIFY and REVIEW before it is opened, and leaves `main` working with nothing half-wired. The tab appears only in PR 7.

## 9. Decisions and risks

- **A 9b model will sometimes pick the wrong tool or argument.** That is what the eval measures. The write path never trusts the model: schemas validate, names resolve against real rows, and Undo is always available.
- **Reply time.** A local model with tools can take several seconds, longer with thinking on. The eval records it, and `LOCAL_LLM_THINK` is a setting, so we can turn thinking off if the numbers say so.
- **Undo reads whole tables.** Fine at household size. If the data ever grows large, the journal can be limited to the rows a tool touched.
- **History is not memory.** The model sees only the current screen, so a cleared screen starts a fresh conversation. Stored history is for people to read.
- **Prompt injection.** Item and task names come from the household, but they are put in tool results the model reads. The tools can only do what the app can do, and every change can be undone, which bounds the harm.
- **Model names.** `.env.example` lists `qwen3.5:9b`, which is installed. Larger tool-capable models (`qwen3.5:27b`, `qwen3.8:27b-mlx`, `qwen3:14b`) are available for the 27b comparison.
