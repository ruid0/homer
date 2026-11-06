# Routines: a daily checklist on a person's page. Definition, technical plan and system design

Status: In progress (PR 1 of 4, shared code and data) · Owner: Igor Bondarenko · Last updated: 2026-11-05 · Source: `docs/v2-plan.md` theme B and the owner's decisions of 2026-11-05. Builds on `docs/design-slice-3-schedule.md`.

The repo is public. This document and the tests describe routines in general terms and use made-up rows ("Row A"). The household's real routines never go into the repo.

## 1. Problem

Someone in the household keeps a daily checklist on paper: several things to do or take each day, some more than once a day, on a grid of rows by days. They want it in HOMER, set up by that person, as they want it. HOMER's tasks and events are the wrong shape: a task is done once, and a repeating task disappears from view until it is due.

**Done when:**
- A person has a Routine screen under their page in People, reached by `/people/:id/routine`.
- The screen shows one week (Monday to Sunday) as a grid. Rows are the person's routine items, columns are days.
- The person adds, renames, reorders and removes their own rows, and sets how many times a day each is done (the target).
- Tapping a cell adds one to that day's count, and the cell shows "1 of 2". A control takes one off.
- Earlier weeks can be opened with arrows. A missed day is an empty cell, with no warning or colour.
- Routines do not appear on Home, in the assistant, in the schedule or in notifications.

## 2. Decisions (owner, 2026-11-05)

1. **Open to the household.** HOMER has no accounts, so anyone who can open the app can see and change any routine, as with tasks. The screen says so. There is no PIN: it would only stop casual looking and sits in the same database file and backups.
2. **A count per row per day.** Each row has a target per day (1 or more). Target 1 is a plain tick.
3. **No stock link in the first version.** A row cannot use up an item yet. The tables leave room for it.
4. **A week, with a way back.** The current week, with arrows to earlier weeks and a "This week" button.

## 3. Out of scope

- Using up stock (an item's quantity) from a tick, and learning usage from it.
- Reminders and notifications (theme A).
- Streaks, totals, charts or any judgement of missed days.
- The assistant reading or changing routines. It has no routine tool on purpose, so routines cannot be asked about in chat, and a tick is never in the assistant's journal or Undo.
- Times of day (morning, noon, evening) as separate slots. A row done twice is a target of 2.

## 4. Data model

`routine_items`
| column | type | notes |
|---|---|---|
| id | integer pk autoincrement | |
| person_id | integer not null, fk → people.id | |
| name | text not null | up to 80 characters |
| target_per_day | integer not null default 1 | 1 to 20 |
| position | integer not null | order in the grid, ascending |
| created_at | text (ISO-8601 UTC) | |
| removed_at | text null | a removed row is hidden but keeps its ticks |

`routine_ticks`
| column | type | notes |
|---|---|---|
| id | integer pk autoincrement | |
| routine_item_id | integer not null, fk → routine_items.id | |
| date | text not null, `YYYY-MM-DD` | the person's local day |
| count | integer not null | 0 to 99, can be above the target |

A unique index on (`routine_item_id`, `date`) means one row per routine row per day. A tick is a count, not one record per tap, so setting the same count twice changes nothing. Rows are never deleted for good, as with people, tasks and events.

Migration: `apps/api/drizzle/0009_cloudy_morg.sql`. It only adds the two tables.

## 5. Shared package

- `calendar.ts`: `weekDates(date)` returns the seven dates (Monday first) of the week containing `date`. Property tests: seven consecutive days, Monday first, contains the date, the same week from any day of it.
- `schemas.ts`: `routineItemInputSchema`, `updateRoutineItemInputSchema`, `moveRoutineItemInputSchema`, `routineWeekInputSchema`, `setRoutineCountInputSchema`, `routineItemSchema`, `routineTickSchema`, and the limits `MAX_ROUTINE_TARGET` (20), `MAX_ROUTINE_COUNT` (99) and `MAX_ROUTINE_WEEKS_BACK` (8).
- Like tasks, the client sends `today` so the server never guesses the household's time zone.

## 6. API (PR 2)

A `routines` router:
- `week({ personId, today, weekOf? })`: the person's rows (not removed, in order) with the ticks for the seven days of the week that contains `weekOf`, or today.
- `addItem`, `updateItem` (name and target), `moveItem` (up or down), `removeItem`.
- `setCount({ itemId, date, today, count })`: sets the day's count. Count 0 is stored as 0, not deleted.

Rules, each tested: a date after `today` is refused; a date more than `MAX_ROUTINE_WEEKS_BACK` weeks before the start of this week is refused; an item that does not exist or is removed is refused with a message that says to refresh; a person who does not exist is refused; the new row goes to the end of the list.

## 7. Web (PR 3)

- A "Routine" link on each person on the People page, and a `RoutinePage` at `/people/:id/routine`.
- A grid following `homer-ui`: 44px cells, dark mode, keyboard reachable, an `aria-label` per cell like "Row A, Tuesday, 1 of 2". Today's column is marked.
- On a phone the seven columns do not fit: the grid scrolls sideways, with the row names fixed, and opens on today.
- Row editing in a dialog: name, target, move up and down, remove.
- A line on the screen saying the routine is visible to everyone in the household.
- All text in `copy.ts`.

## 8. Pull requests

1. **Shared and data** (this PR): `weekDates`, schemas, tables and migration, tests. Nothing visible in the app.
2. **API:** the `routines` router and its tests.
3. **Page:** the People link, the Routine page and the grid, checked in the running app at phone and tablet width with scratch data only.
4. **Docs:** this file set to Built, plus the PRD, `docs/v2-plan.md` and `CLAUDE.md`.

## 9. Risks

- The routine is visible to anyone with the link. The screen says so, and nothing about it is sent anywhere else.
- Backups include routines, since they are in the same database file.
- A later stock link needs a nullable `item_id` on `routine_items`, and a decision on what a tick uses up. That is a separate DEFINE.
