# Slice 5: Assistant. Definition, technical plan and system design

Status: Built (PRs 1 to 7, shipped in v1.0.0) · Owner: Igor Bondarenko · Last updated: 2026-11-05 · Source: PRD §3, §4.4, §5, §6, §7, §8 (slice 5). Builds on slices 1 to 4.

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
- Dates: the system prompt carries today's date and the weekday. Days said in words ("today", "tomorrow", a weekday) are resolved in code, see §11.
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
  - `prompt.ts`: the system prompt.
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
  - Day words resolved in code (`resolveToolDates`).
- **The eval** (`pnpm eval`, real model): at least 20 golden prompts, including the three acceptance prompts, ambiguity (two matches), an untracked item, a prompt that must not change anything, and "don't invent a date". The first baseline sets the real latency target.
- The Assistant page is checked in the running app at 390px, 1512px and 1920px.

## 8. Work order (one PR at a time; the next starts after the previous is merged)

1. **This design doc.**
2. **Shared tools:** `tools.ts` with the argument schemas, name resolution and the date-word helper, with tests.
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

## 10. Eval results (PR 6, 2026-11-05)

`pnpm eval -- --model <name> --think true|false --repeat N`: 29 golden cases on the owner's Mac against the real Ollama, run twice (58 runs) unless noted. A case passes when the check for it passes: the right tool with the right arguments and exactly one change, or no change and a question, or a read tool and a reply that mentions what was asked about. "Asks" only checks for a question mark, plus a case-specific word where one is needed. Models are not deterministic, so a figure moves by a few points between runs.

**The first numbers were too kind.** The first checks accepted a right answer with a wrong extra change, and a read case without a read. After tightening them (exactly one change, a required read tool), the same model scored lower. Only the strict-check rows below are comparable.

| Model | Thinking | Prompt | Checks | Passed | Median | p90 |
|---|---|---|---|---|---|---|
| `qwen3.5:9b` | on | first | loose | 23/29 (79%), one pass | 11.5s | 21.3s |
| `qwen3.5:9b` | on | rules added | loose | 54/58 (93%) | 10.5s | 14.9s |
| `qwen3.5:9b` | off | rules added | loose | 47/58 (81%) | 6.6s | 7.8s |
| `qwen3.5:27b` | off | rules added | loose | 54/58 (93%) | 8.1s | 12.2s |
| `qwen3.5:27b` | on | rules added | loose | 27/29 (93%), one pass | 18.8s | 28.3s |
| `qwen3.5:9b` | on | rules added | strict | 49/58 (84%) | 10.8s | 15.7s |
| `qwen3.5:9b` | on | one-week calendar | strict | 51/58 (88%) | 10.2s | 15.9s |
| **`qwen3.5:9b`** | **on** | **final** (today and tomorrow marked) | **strict** | **51/58 (88%)** | **10.6s** | **15.5s** |
| **`qwen3.5:27b`** | **off** | **final** | **strict** | **52/58 (89.7%)** | **8.2s** | **12.4s** |
| `qwen3.5:9b` | on | dates resolved in code | strict | 53/58 (91%) | 10.3s | 21.0s |
| **`qwen3.5:9b`** | **on** | **dates and reply lines in code** | **strict** | **54/58 (93%)** | **9.8s** | **19.1s** |

**The two final rows are not the same kind of result.**
- `qwen3.5:9b` with thinking on fails by not acting: it looks the list up instead of marking salt out, asks a question it should not need, or once picks the wrong item (Oat milk for "milk"). Two of its failures are a wrong date (Sunday written as 2026-11-07).
- `qwen3.5:27b` with thinking off is faster and scores 52/58, which is 89.7%: just under the 90% target and under the runner's own gate. Five of its six failures are replies that say a change was made when no tool was called ("I've added the dentist appointment for Anna", with nothing saved). That is the failure that costs trust, and a person cannot tell it from a real change in the reply text. The Undo button comes from recorded actions only, never from the reply, so a claimed change with no action shows no Undo.

**What the eval changed:** the prompt now says to call tools straight away with the name as said, to take weekday dates from a one-week list with today and tomorrow marked (the first prompt listed 14 days and the model picked the second Friday), never to choose between matches, never to ask for a quantity before trying, to pass only the name, and that it cannot delete. An empty model reply is retried once.

**Not yet met:** the 90% target, by either model (88% and 89.7%). Dates are the main remaining model error on the 9b model, which points at a deterministic fix: let the tools accept "today", "tomorrow" or a weekday name and resolve it in code.

Limits left by the prompt as measured: the one-week calendar cannot express "next Friday", or today's weekday next week; the person has to say the date. The rule "ask when a task has no date when one is needed" was reworded after the last runs, because it contradicted "a task does not need a date", so the final prompt has not been measured exactly. The follow-up PR (code-written confirmations and dates resolved in code) re-measures.

## 11. Dates in code (follow-up, 2026-11-05)

The tools now take "today", "tomorrow" or a weekday name for a date, and `resolveToolDates` (shared, pure) turns it into a date before the arguments are validated. The one-week calendar is gone from the prompt. A weekday always means the coming one, so "Friday" said on a Friday is a week ahead. "Next Friday" is deliberately not resolved: people mean two different days by it, so it is rejected and the model asks.

Result on `qwen3.5:9b`, thinking on, strict checks, two passes: **53/58 (91%)**, median 10.3s, p90 21.0s. No remaining failure is a date. The five failures are all the model acting when it should ask or choosing for the person: it tracked "coffee" at quantity 0 instead of asking how much, completed one of two "bins" tasks on its own, listed milk when asked how much was bought, and once filed a task as an event. These are the next target: reply lines written by code from what changed, and a guard on claimed changes.

The first run after this change scored 78% only because the eval recorded each call's arguments without resolving day words, so a right answer looked empty. The eval now resolves them the same way the loop does.

## 12. Reply lines written by code (follow-up, 2026-11-05)

After a change the reply is a sentence built from what the tool did ("Marked Salt as out and added it to groceries."; "Added the task "Call the plumber" for Friday 2026-11-06."), one line per change, plus the model's closing question if it asked one. The model's own words are used only when nothing changed: an answer, or a question back. This removes the failure that hurt the 27b model, a reply saying "I've added the dentist appointment" with nothing saved, and it makes the reply say the matched name ("Oat milk", not "milk").

- **False claims.** If nothing changed and the reply still says it did ("I've added…", "Added the …", "Got it, marked …"), it is replaced by "I didn't change anything. Try saying it again." The check is first person and past tense only, so honest answers such as "your appointment is scheduled for Thursday" are left alone. It is best effort: a model can word a false claim another way, which is why a change is only ever reported from the recorded result.
- **Mixed turns.** If one call worked and another did not ("out of salt and flour", with flour untracked), both are reported, so the person does not think both went through. A turn that stops early (gave up, too many steps, the model went away) still lists the changes already made.
- **Result.** `qwen3.5:9b`, thinking on, strict checks, two passes: **54/58 (93%)**, median 9.8s, p90 19.1s. The four failures are the model acting when it should ask or refuse: it started tracking "flour" at 0 when asked about flour being out, asked for a quantity instead of marking bread bought, marked milk out when asked to delete it, and left a time off a weekly task. Because the line now says what happened ("Marked Milk as out"), the person can see and undo it.

Next: the 90% target is met on the 9b model. What is left is the model deciding to act without being asked to, which a stricter write path (confirming before an item is created or a task completed when the name was not exact) could address. That is not part of this slice.

## 13. Writes the person did not ask for (follow-up, 2026-11-05)

A fresh run of the same set scored 52/58 (90%). The risky failures were the model choosing one of several matches ("Oat milk" for "milk") and marking an item out when asked to delete it. `guard.ts` now refuses a write in code before it runs:

- **A pick out of several.** `mark_out`, `restock_item` and `mark_bought` are refused when the name was not said in full and another item or list entry shares a word the person did say. "Milk" with oat milk and soy milk on the list is a question, so the reply asks. A single item with a longer name ("Dish soap" for "out of soap"), a typo or another language still goes through, because nothing else competes for it. Plural and single forms match (apple/apples, battery/batteries). What was said earlier on the screen counts, so "3" after "bought milk" works.
- **Delete.** `mark_out` is refused when the message says "delete" and the item is named in the four words after it. "Don't delete anything, we're out of milk" and "mark salt out and delete the old milk entry" still work.
- A refused call counts as skipped. When something else changed in the same turn the reply lists the refusal once. When nothing changed, the model's own words are used, which carry the refusal.

**Result** (same model, two passes): **55/58 (95%)**, median 10.5s, p90 16.5s, up from 52/58. `out-ambiguous` and `out-of-scope` passed on every run and no run marked the wrong item. Remaining failures are not guard cases: the model asked instead of marking milk out when "Milk" and "Oat milk" both exist, an event argument mismatch, and tracking "flour" at 0 when asked about flour being out. A time dropped from a weekly task ("at 18:00") is not fixed here and would be its own change.

## 14. Times said in the message (follow-up, 2026-11-05)

The model sometimes left "at 18:00" off a task or event. `timeWords.ts` (shared, pure) now finds the one time in the person's message ("18:00", "6pm", "6:30 pm") and `addSaidTime` puts it in when the call has a day and no time. It does nothing when:

- there is no time, more than one different time, or a range ("9 to 10pm", "between 5 and 6pm"), because one end would be guessed;
- the model already gave a time (its own wins);
- the call has no day (a time needs a day);
- the turn adds a task and an event together, so it is not clear whose time it is;
- the time was said in an earlier message. Only the current message counts, which is the safe side.

**Result** (same model, two passes): **55/58 (95%)**, median 10.1s, p90 15.9s. `task-repeat-and-time` passed on every run (it failed twice before, and passed 4 of 4 in a targeted run). The remaining failures are the model asking or answering in words where a tool call was expected (`out-exact-beats-longer`, `bought-text`) and one `restock` run that used `mark_bought` instead.
