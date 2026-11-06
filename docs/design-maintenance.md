# Maintenance schedules: things that come round on a long cycle. Definition, technical plan and system design

Status: Ready (agreed with the owner, not started) · Owner: Igor Bondarenko · Last updated: 2026-11-05 · Source: `docs/v2-plan.md` theme B, the PRD §4 ("maintenance reminders: filters, softener salt, cleaning"), and the owner's answers of 2026-11-05. Builds on `docs/design-jobs-and-ntfy.md` and `docs/design-routines.md`.

## 1. Problem

Some jobs come round every few weeks, months or a year: the furnace filter, softener salt, smoke alarm batteries, the dryer vent. Nobody remembers when each was last done, so they are done late or twice. The existing repeating tasks do not fit: they repeat on a fixed calendar from the first due date, but a filter is changed on a day and the next change is counted from that day.

**Who:** everyone in the household (no accounts, same as the rest of the app).

**Done when:**
- Adding "Furnace filter, every 3 months, last done 10 Nov" shows it due on 10 Feb.
- Marking it done on 12 Feb makes it due 12 May, not 10 May.
- An item that is overdue or due within a week shows on Home, in plain words ("Furnace filter, due in 3 days"), with one tap to mark it done.
- A note goes to the household's ntfy topic a week before and on the day, with counts only.
- A done by mistake can be undone.

## 2. Decisions (owner, 2026-11-05)

1. **The cycle counts from the day it was last done**, not from a fixed calendar. A new "maintenance" list, separate from tasks.
2. **Where:** its own page ("Home care") in the navigation, plus a "due soon" part on Home next to "Running out".
3. **Reminders:** an ntfy note a week before and on the day, to the household topic, generic counts only ("Home care: 1 due today, 2 due this week."). One note per item per stage. Off unless notifications are on.
4. **Starting list:** empty, with an "Add a suggestion" picker that offers common items (furnace filter every 3 months, water softener salt every month, smoke alarm batteries every 6 months, dryer vent every 12 months, fridge coils every 12 months). A suggestion is only a prefilled form: the person accepts, edits or ignores it.

Defaults I chose, for the owner to veto: a history of when each item was done is kept (a date, not who); intervals are in weeks, months or years (months and years keep the day of the month, clamped like tasks do); an item with no "last done" counts as due today ("Not done yet"); items are removed softly and keep their history.

## 3. Out of scope

- Assistant tools for maintenance (a later, small PR after this).
- Linking an item to a stock item (softener salt) so that marking it done restocks. Later, with the routine-to-stock link.
- Assigning an item to a person, or notes to a person's own topic.
- Photos, costs, or attachments.

## 4. Data and rules

`maintenance_items`: `id`, `name` (unique, case-insensitive among open items), `every` (integer 1 to 99), `unit` (`weeks`, `months`, `years`), `last_done_on` (local date `YYYY-MM-DD`, null when never done), `notified_soon_for` and `notified_due_for` (the due date a note was already sent for, or null), `created_at`, `removed_at`.

`maintenance_done`: `id`, `item_id`, `done_on` (local date), `created_at`. One row per time it was marked done. `last_done_on` is the latest `done_on`.

Pure functions in `packages/shared/src/maintenance.ts` (no I/O):
- `dueOn(lastDoneOn, every, unit, today)`: `lastDoneOn` plus the interval; today when `lastDoneOn` is null.
- `maintenanceStatus(dueOn, today)`: `overdue` (before today), `due` (today), `soon` (1 to 7 days), `later`. `daysUntil` is negative when overdue.
- `compareMaintenance`: overdue first (most overdue first), then by due date, then name.
- `maintenanceText` lives in the copy file, not here: "Due today", "Due in 3 days", "3 days overdue", "Not done yet".

Property tests: the due date is never before the last done date; marking done on a later date never makes the item due sooner; month and year intervals clamp (31 Jan plus 1 month is 28 or 29 Feb); status flips exactly at 0 and 7 days.

## 5. API

A `maintenance` router (same style as the others, input schemas in `packages/shared/src/schemas.ts`):
- `list`: open items with `dueOn`, `status`, `daysUntil`, `lastDoneOn`, sorted by `compareMaintenance`.
- `add`, `update` (name, interval, last done), `remove` (soft).
- `markDone({ id, doneOn })`: `doneOn` defaults to today and cannot be in the future. Writes a `maintenance_done` row and sets `last_done_on` to the latest `done_on`, in one transaction. If a note had been sent for the old due date, the new due date starts clean.
- `undoDone({ id })`: removes the latest `maintenance_done` row and sets `last_done_on` back to the one before (or null).
- `history({ id })`: the done dates, newest first.

The local date comes from the caller's `today`, like routines, so the household's `TZ` is respected.

## 6. Screens

All text in `copy.ts`. Each screen goes through the `frontend-design` and `homer-ui` pass, has browser tests (`pnpm e2e`), and the `ui-reviewer`, per the UI rules in `CLAUDE.md`.

- **Home care page** (`/home-care`): cards sorted by what is due first. Each card says what and when in words ("Furnace filter · Due in 3 days"), shows "Every 3 months · last done 10 Nov", and has one primary action, "Done". After "Done" a toast offers "Undo". Overdue and due-soon are told in words, with colour only as a second signal. "Add item" opens a dialog (name, every N weeks/months/years, last done date or "Not done yet"); "Add a suggestion" lists the five common ones as prefilled forms. Editing, history and removing are in the item's dialog.
- **Home**: a "Due soon" card next to "Running out" with overdue and next-7-days items and the same "Done" action; nothing there when nothing is due ("Nothing due.").
- States tested: loading, failed to load, empty, overdue, due today, due soon, later, saving, error on done, undo.

## 7. Notes (ntfy)

A daily job (`MAINTENANCE_TIME`, default `08:00`, household time; also run once at start-up so a sleeping Mac catches up). It counts items that reached "soon" (due within 7 days) or "due" (today or overdue) and have no note yet for their current due date. If there are any, one generic note goes to the household topic: "Home care: 1 due today, 2 due this week." Only counts, never names. A failed send is retried by the next run. The note path opens `/home-care`. Notifications off means the job does nothing.

## 8. PRs

Each PR leaves `main` working and goes through VERIFY and REVIEW before the next.

1. **This design doc** (docs only).
2. **Shared domain**: `maintenance.ts`, schemas, property tests.
3. **Database and api**: tables and migration, the router, tests with in-memory databases.
4. **Home care page**: page, dialogs, suggestions, Done and Undo, its browser tests.
5. **Home "Due soon"** card and its browser tests.
6. **The note job**, `.env.example` and README, then this file and `docs/v2-plan.md`, the PRD and `CLAUDE.md` set to Built.

## 9. Risks

- **Dates, not instants.** All maintenance dates are local calendar dates (`YYYY-MM-DD`), never timestamps, so a time zone or daylight-saving change cannot shift a due date.
- **A late "done" and a wrong "done".** Marking done on a past date is allowed (you changed the filter yesterday); the future is not. Undo covers a tap by mistake.
- **Note spam.** Notes are keyed to the item's due date, so each stage is sent once per cycle, and a done resets it.
- **Public repo.** Suggestions are generic household items. Real items, dates and notes stay in the owner's data, never in the repo.
