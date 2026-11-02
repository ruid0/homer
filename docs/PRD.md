# H.O.M.E.R. — Product Requirements

Status: draft v0.2 · Owner: Igor Bondarenko · Last updated: 2026-11-02

## 1. Problem

Maintaining a house with 3 people and a cat is a chore on itself, list of things that's needs to be done always slips somewhere or got forgoten. The errands got missed because someone forgets to put them into the calendar. Food runs out in the least expected moment, or you grill in not ready or missing some things like a fire starter or coals when you want to cook something and you have to run to the store. Slpliting responsibilities between family members, who does what for cleaning, maintaning, and other home related things.

H.O.M.E.R. is a hosehold assistant that remebers everything, when you staples runs out, it keeps the list of grocceries or other things. Shows what house maintananse is due, furnce filters, salt in the saftener etc. Reminders/Calendars of upcoming events you usually frget about, but not Homer. Everyone in household can add/update it tapping or by just saying what happened

## 2. Users

Version 1 is built for just one hosehold. Other households may self-host it later, but v1 makes no effort to support them.

- Family check what's needed and what's due, tick things off, and tell the assistant what happened. Mostly on a phone, or a tablet in the kitchen.
- The owner also sets HOMER up, runs it on a home machine, and backs up its single database file.

## 3. Goals and non-goals

**Goals for v1**
1. Nobody is surprised by running out of a tracked essential.
2. The grocery list builds itself from what's running low, and anyone can add to it.
3. Household tasks and dated events live in one place everyone can see.
4. Anything you can do with a form, you can also do by telling the assistant in plain words.
5. No household data leaves the house.

**Goals for v2**
- Maintenance reminders (filters, softener salt, cleaning).
- Receipt or label photos (vision/OCR) and voice input. Planned for later.
- Based on receipts and estimate search flyers for best deals 
- Access from outside the home network?

## 4. MVP scope

### 4.1 Essentials (inventory and groceries)

The household tracks consumables they care about running out of.

- **Item**: name, unit (e.g. "bag", "litre"), current quantity, and how long one unit usually lasts. One unit per item, no unit conversion.
- **Usage is entered, then learned.** The person enters a starting estimate ("one bag lasts about 30 days"). Every restock is recorded, and once there is enough history HOMER updates the estimate from how long stock actually lasted. The item shows which estimate it uses: entered or learned.
- HOMER estimates **days remaining** for each item from quantity and usage, and flags it as **running low** when below a threshold (default: 7 days, adjustable per item).
- Running-low items are added to the **grocery list** automatically. People can also add anything by hand, tracked or not.
- **Bought it** on a grocery item restocks it (asks for quantity, defaulting to the usual amount) and removes it from the list.
- **Out of it** sets an item's quantity to zero and adds it to the list.

**Acceptance criteria**
- Given milk at 1 litre lasting 2 days per litre, the dashboard shows "Milk runs out in 2 days" and it's on the grocery list.
- Marking milk "Bought it" with 4 litres removes it from the list and updates days remaining.
- Days remaining never shows a negative number; an item with no usage set shows "No estimate" instead of a guess.
- Salt entered as "one bag lasts 30 days" but restocked every 20 days over several restocks switches to a learned estimate near 20 days, and says it's learned.

### 4.2 Tasks and schedule

- **Task**: title, optional due date, optional time, optional repeat (daily, weekly, monthly), optional person it's for, done or not.
- **People**: a setup page lists the household's people by name. Tasks can be assigned to one of them. No accounts or logins: a person is a name to assign to, not a user.
- **Event**: title, date, optional time. Something that happens rather than something to do (e.g. "Dentist").
- **Today** view: overdue tasks first, then tasks and events for today.
- **Week** view: tasks and events for the next 7 days.
- Completing a repeating task creates the next one from its due date, not from when it was completed.

**Acceptance criteria**
- A weekly task due Monday and completed on Wednesday comes back due the following Monday.
- Overdue tasks stay at the top of Today until done or rescheduled.
- Today can be filtered to one person's tasks.

### 4.3 Dashboard

One screen readable in about 3 seconds on a kitchen tablet: what's running out, what's overdue, what's today. Follows `.claude/skills/homer-ui`.

### 4.4 Assistant

A chat screen backed by a local model (Ollama, `qwen3.5:9b`) that can read and change everything in 4.1 and 4.2 through tools.

**MVP tools**

| Tool | Does |
|---|---|
| `list_items` | Items with quantity and days remaining |
| `mark_out` | Item is out: quantity 0, add to grocery list |
| `restock_item` | Set or add quantity after buying |
| `add_item` | Start tracking a new item |
| `list_groceries` / `add_to_groceries` / `mark_bought` | Grocery list |
| `list_tasks` | Tasks and events in a date range |
| `add_task` / `add_event` | Create with optional date, time, repeat, person |
| `complete_task` | Mark done (creates next repeat) |

**Behavior**
- Tool arguments are validated with the same Zod schemas as the app. Invalid calls are rejected and retried, never written.
- After any change, the assistant states what it did in one line ("Marked salt as out and added it to groceries") and offers **Undo**. Undo stays available until the person closes it.
- If a request matches more than one item or is unclear, it asks instead of guessing.
- It never invents items, quantities or dates the person didn't give.

**Acceptance criteria**
- "We're out of salt" calls `mark_out` for salt. If salt isn't tracked, it asks whether to start tracking it.
- "Remind me to call the plumber Friday" creates a task due this coming Friday.
- "What do we need?" lists the grocery list without changing anything.

## 5. Non-functional requirements

- **Local only.** No outbound network calls except to Ollama on `127.0.0.1`. No telemetry.
- **One file to back up.** All data in a single SQLite file.
- **Installable.** PWA that can be added to a phone or tablet home screen.
- **Usable on a tablet with busy hands.** 44px touch targets, readable from arm's length, dark mode.
- **Responsive enough.** App screens feel instant on the home network. Assistant replies within a few seconds (target to be set once measured, see 7).
- **Runs on the owner's MacBook (Apple M5, 48 GB).** Ollama runs natively on macOS so it can use the GPU; Docker on macOS can't, so Compose runs only web and api and points them at the host's Ollama. 48 GB leaves room to try a larger chat model than `qwen3.5:9b` if the eval shows it's worth it.
- **Works without the assistant.** If Ollama is down, every screen still works and the chat shows a clear message.

## 6. Data model (first cut)

- `items`: id, name, unit, quantity, days_per_unit_entered, days_per_unit_learned (nullable), low_threshold_days, created_at
- `restocks`: id, item_id, quantity, restocked_at (history the learned estimate comes from)
- `people`: id, name
- `grocery_entries`: id, item_id (nullable), text, quantity, added_by (auto/person), created_at, bought_at
- `tasks`: id, title, due_date, due_time, repeat, person_id (nullable), done_at
- `events`: id, title, date, time
- `assistant_actions`: id, tool, args, result, created_at, undone_at (for Undo and debugging)

Schemas live in `packages/shared/src/schemas.ts`; pure calculations (`daysRemaining`, `nextDueDate`) in `domain.ts` with property-based tests.

## 7. How we'll know it works

- **Household use:** after a month, the family still uses it weekly, and nothing tracked has run out unnoticed.
- **Assistant eval:** a set of at least 20 golden prompts (e.g. "we're out of salt" → `mark_out({ name: "salt" })`), run against the local model on every change to prompts, tools or model. Measures correct tool, correct arguments, and asks-when-ambiguous. Starting target: 90% correct on `qwen3.5:9b`, adjusted after the first baseline run.
- **Latency:** measure assistant reply time on the owner's machine in the first baseline, then set a target.

## 8. Delivery slices

Each slice goes through DEFINE → SHIP (see CLAUDE.md) as its own PR.

1. **Items and days remaining** (built, see `docs/design-slice-1-items.md`): schema, `daysRemaining` with property tests, Items screen with forms. Restocks recorded from the start.
2. **Grocery list**: auto-add when low, manual add, Bought it / Out of it.
3. **People, tasks and events**: People setup page; create, assign, complete, repeat via `nextDueDate`; Today and Week views.
4. **Dashboard**.
5. **Assistant**: tool loop, MVP tools, Undo, eval harness with the first golden set.
6. **PWA and Docker Compose** packaging (web and api; Ollama stays native).
7. **Learned usage**: estimate from restock history, shown as entered or learned.

## 9. Later (not v1)

- Maintenance schedules (filters, softener salt, cleaning), the M in HOMER.
- Receipt and label photos with `qwen3-vl` to restock from a shopping trip.
- Voice input from the kitchen tablet.
- Daily 06:00 job that posts a morning summary.

## 10. Decisions

Answered by the owner on 2026-11-02:

1. **Usage rates:** entered by hand to start, then learned from restock history (4.1, slice 7).
2. **People:** tasks are assigned to named people from a People setup page; no accounts (4.2).
3. **Hardware:** the owner's MacBook, Apple M5 with 48 GB; Ollama native, not in Docker (5).
4. **Units:** one unit per item, no conversion.
5. **Undo window:** Undo stays available until the person closes it (4.4).

## 11. Open questions

1. **Learning threshold:** how many restocks before the learned estimate replaces the entered one, and should it blend the two at first?
2. **Late Undo:** if an item changed after the assistant's action (e.g. someone restocked it by hand), what should Undo do: revert only the assistant's change, or refuse and explain?
3. **Other devices:** phones and the kitchen tablet reach the MacBook over the home network. What happens when the MacBook is asleep or away from home?
