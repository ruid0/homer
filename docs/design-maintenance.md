# Maintenance schedules: things that come round on a long cycle. Definition, technical plan and system design

Status: Draft (shape agreed with the owner; waiting for the owner to approve the plan and the defaults in §2) · Owner: Igor Bondarenko · Last updated: 2026-11-05 · Source: `docs/v2-plan.md` theme B, the PRD §4 ("maintenance reminders: filters, softener salt, cleaning"), and the owner's answers of 2026-11-05. Builds on `docs/design-jobs-and-ntfy.md` and `docs/design-routines.md`.

## 1. Problem

Some jobs come round every few weeks, months or a year: the furnace filter, softener salt, smoke alarm batteries, the dryer vent. Nobody remembers when each was last done, so they are done late or twice. The existing repeating tasks do not fit: they repeat on a fixed calendar from the first due date, but a filter is changed on a day and the next change is counted from that day.

**Who:** everyone in the household (no accounts, same as the rest of the app).

**Done when:**
- Adding "Furnace filter, every 3 months, last done 10 Nov" shows it due on 10 Feb.
- Marking it done on 12 Feb makes it due 12 May, not 10 May.
- An item that is overdue or due within a week shows on Home, in plain words ("Furnace filter · Due in 3 days"), with one tap to mark it done.
- A note goes to the household's ntfy topic a week before and on the day, with counts only.
- A done by mistake can be undone.

## 2. Decisions (owner, 2026-11-05)

1. **The cycle counts from the day it was last done**, not from a fixed calendar. A new "maintenance" list, separate from tasks.
2. **Where:** its own page ("Maintenance", so it is not confused with "Home") in the navigation, plus a "due soon" part on Home next to "Running out".
3. **Reminders:** an ntfy note a week before and on the day, to the household topic, generic counts only ("Maintenance: 1 overdue, 1 due today, 2 due this week."). One note per item per stage and per due date. Off unless notifications are on.
4. **Starting list:** empty, with an "Add a suggestion" picker that offers common items (furnace filter every 3 months, water softener salt every month, smoke alarm batteries every 6 months, dryer vent every 12 months, fridge coils every 12 months). A suggestion is only a prefilled form: the person accepts, edits or ignores it.

Defaults I chose, for the owner to veto: a history of when each item was done is kept (a date, not who); intervals are in weeks, months or years (months and years keep the day of the month, clamped like tasks do); an item with no "last done" is due on the day it was added ("Not done yet"), a fixed date so it is announced once; items are removed softly and keep their history.

## 3. Out of scope

- Assistant tools for maintenance (a later, small PR after this).
- Linking an item to a stock item (softener salt) so that marking it done restocks. Later, with the routine-to-stock link.
- Assigning an item to a person, or notes to a person's own topic.
- Photos, costs, or attachments.

## 4. Data and rules

`maintenance_items`: `id`, `name`, `every` (integer 1 to 99), `unit` (`weeks`, `months`, `years`), `last_done_on` (local date `YYYY-MM-DD`, null when never done), `notified_soon_for` and `notified_due_for` (the due date a note was already sent for, or null), `created_on` (local date it was added), `created_at`, `removed_at`. Names are unique among open items, case-insensitive: a partial unique index on `lower(name)` where `removed_at` is null, like `items_active_name_unique`. `add` and rename return a friendly error on a clash, and the suggestion picker hides suggestions that are already added.

`maintenance_done`: `id`, `item_id`, `done_on` (local date), `created_at`. One row per time it was marked done. `last_done_on` is always the latest `done_on` among the item's rows (null with none). Soft-removed items keep their rows.

The migration is additive: two new tables, nothing seeded, no change to existing data, so the household's data is untouched. The daily backup already copies the database.

Pure functions in `packages/shared/src/maintenance.ts` (no I/O):
- `dueOn({ lastDoneOn, createdOn }, every, unit)`: with a last done date, that date plus the interval (weeks as `addDays(7 * n)`, months as `addMonths(n)`, years as `addMonths(12 * n)`, always counted from `lastDoneOn` itself so nothing drifts, and clamped to the month's last day). Never done: `createdOn`, a fixed date, so it is due from the day it was added and its due date does not move.
- `maintenanceStatus(dueOn, today)`: `overdue` (before today), `due` (today), `soon` (1 to 7 days), `later`. `daysUntil` is negative when overdue.
- `compareMaintenance`: overdue first (most overdue first), then by due date, then name.
- Wording ("Due today", "Due in 3 days", "3 days overdue", "Not done yet") lives in the copy file, not here.

Property tests: the due date is never before the last done date; a later done date never makes the item due sooner; month and year intervals clamp (31 Jan plus 1 month is 28 or 29 Feb, 29 Feb plus 1 year is 28 Feb); status flips exactly at 0 and 7 days; a never-done item's due date does not change from day to day.

## 5. API

A `maintenance` router (same style as the others, input schemas in `packages/shared/src/schemas.ts`):
- `list`: open items with `dueOn`, `status`, `daysUntil`, `lastDoneOn`, sorted by `compareMaintenance`.
- `add`, `update` (name, interval, last done), `remove` (soft).
- `markDone({ id, doneOn, today })`: writes a `maintenance_done` row and returns its id. `doneOn` is a valid `YYYY-MM-DD`, not after `today` and not more than a year before it (the same kind of bound as routines' `requireDayAllowed`). A date earlier than the latest one is allowed and is only recorded in the history; `last_done_on` is the latest of all. One transaction.
- `undoDone({ doneId })`: removes that exact row (so a double tap or a second device never removes the wrong one) and sets `last_done_on` to the latest remaining `done_on`, or null.
- `history({ id })`: the done dates with their ids, newest first.

Notes never need clearing: they are keyed to the due date (see §7). Marking done, undoing, and editing the interval or last done date all change the due date, so the item becomes eligible for a new note by itself and an old note is never repeated.

The local date comes from the caller's `today`, like routines, so the household's `TZ` is respected.

## 6. Screens

All text in `copy.ts`. Each screen goes through the `frontend-design` and `homer-ui` pass, has browser tests (`pnpm e2e`), and the `ui-reviewer`, per the UI rules in `CLAUDE.md`.

- **Maintenance page** (`/maintenance`): cards sorted by what is due first. Each card says what and when in words ("Furnace filter · Due in 3 days"), shows "Every 3 months · last done 10 Nov", and has one primary action, "Done". After "Done" a toast (the existing `Toast`) offers "Undo"; undo is also in the item's history in its dialog, where each done date can be removed, so it is still possible after the toast is gone. Overdue and due-soon are told in words, with colour only as a second signal. "Add item" opens a dialog (name, every N weeks/months/years, last done date or "Not done yet"); "Add a suggestion" lists the five common ones as prefilled forms. Editing, history and removing are in the item's dialog.
- **Home**: a "Due soon" card next to "Running out" with overdue and next-7-days items and the same "Done" action; nothing there when nothing is due ("Nothing due.").
- States tested: loading, failed to load, empty, suggestions (all added, none left), overdue, due today, due soon, later, "Not done yet", saving, error on done, undo, name already used.

## 7. Notes (ntfy)

A daily job in `apps/api/src/jobs`, wired in `index.ts` with the household topic and notifier like the end-of-day note. It reuses that job's pattern: it runs at `MAINTENANCE_TIME` (default `08:00`, household time) and once at start-up, but only sends when the time has passed and it has not already run for the day (`readState` and `writeState`), so a start-up at 03:00 waits for 08:00 and a Mac that slept still catches up later that day. It has a `running` guard.

It looks at each open item's due date and status. An item newly in **overdue or due today** with `notified_due_for` not equal to its due date, or newly **soon** (1 to 7 days) with `notified_soon_for` not equal to its due date, is counted once. If anything was counted, one generic note goes to the household topic, for example "Maintenance: 1 overdue, 1 due today, 2 due this week." The note is a delta (only what is new since the last note), counts only, never names. The flags are written only after a successful send, so a failed send is simply tried again at the next run. Notes off means the job does nothing. The note path opens `/maintenance`. The text is in `apps/api/src/messages.ts` (`notifyText`), not the web `copy.ts`.

Because the key is the due date, a never-done item (fixed due date) is announced once, not every morning, and an item that stays overdue is not announced again until its due date changes.

## 8. PRs

Each PR leaves `main` working and goes through VERIFY and REVIEW before the next.

1. **This design doc** (docs only).
2. **Shared domain**: `maintenance.ts`, schemas, property tests.
3. **Database and api**: tables and migration, the router, tests with in-memory databases (including the name clash, backdated done, and undo of an exact row).
4. **Maintenance page**: page, dialogs, suggestions, Done and Undo, its browser tests.
5. **Home "Due soon"** card and its browser tests.
6. **The note job**, with tests for dedup by due date, the `MAINTENANCE_TIME` gate, a failed send and the never-done item, then `.env.example` and README, then this file and `docs/v2-plan.md`, the PRD and `CLAUDE.md` set to Built.

## 9. Risks

- **Dates, not instants.** All maintenance dates are local calendar dates (`YYYY-MM-DD`), never timestamps, so a time zone or daylight-saving change cannot shift a due date.
- **A late "done" and a wrong "done".** Marking done on a past date is allowed (you changed the filter yesterday); the future is not. Undo covers a tap by mistake.
- **Note spam.** Notes are keyed to the item's due date (§7), so each stage is sent once per due date, a never-done item has a fixed due date, and undo or an edit cannot cause a repeat.
- **Public repo.** Suggestions are generic household items. Real items, dates and notes stay in the owner's data, never in the repo.
