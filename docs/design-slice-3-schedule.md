# Slice 3: People, tasks and events. Definition, technical plan and system design

Status: built (PRs 0 to 6) · Owner: Igor Bondarenko · Date: 2026-11-03 · Source: PRD §3 goal 3, §4.2, §6, §8 (slice 3). Builds on `docs/design-slice-1-items.md` and `docs/design-slice-2-groceries.md`.

## 1. Definition (DEFINE)

**Problem.** Chores and dated events live in people's heads and slip. Nobody knows what is overdue, what is today, or whose turn it is.

**For whom.** Everyone in the household, mostly on a phone, or a tablet in the kitchen.

**In scope**
- **People:** a setup page lists the household's people by name. A person is a name to assign to, not a login.
- **Tasks:** title, optional due date and time, optional repeat (daily, weekly, monthly), optional person, done or not. Add, edit, reschedule, complete and remove.
- **Events:** title, date, optional time. Something that happens rather than something to do. Add, edit and remove. Events do not repeat in v1.
- **Repeat:** completing a repeating task creates the next one from its due date, not from when it was completed.
- **Today view:** overdue tasks first, then today's tasks and events. Can be filtered to one person.
- **Week view:** tasks and events for the next 7 days, grouped by day.
- A Schedule page with a Today and Week switch, and a People page, reachable from the navigation.

**Out of scope**
- Dashboard (slice 4) and assistant tools `list_tasks`, `add_task`, `add_event`, `complete_task` (slice 5; the routers built here are what they will call).
- Repeating events, birthdays, calendar import, notifications, reminders.
- Maintenance schedules (PRD §9).
- Accounts, logins and "who did it" history.

**Done when** (PRD §4.2)
- A weekly task due Monday and completed on Wednesday comes back due the following Monday.
- Overdue tasks stay at the top of Today until they are done or rescheduled.
- Today can be filtered to one person's tasks.
- `pnpm typecheck` and `pnpm test` pass, and the screens are checked in the running app at phone and tablet width.

### Decisions (owner, 2026-11-03)

1. **Removed rows are kept and hidden.** Tasks and events get a `removed_at` timestamp and are never deleted (same rule as items and grocery entries). Done tasks stay as history. **People are not removed:** this household does not need it, so there is no Remove for people (decision 2026-11-03).
2. **A late repeat lands after today.** Completing a repeating task steps forward from its due date in whole repeats until the date is after today, so the next task is not born overdue. A weekly task due Monday and completed three weeks later comes back on the first Monday after today. It stays on the original weekday.
3. **Navigation:** one Schedule page with a Today and Week switch, plus a People page. The links become Items, Groceries, Schedule, People.
4. **Monthly drift is accepted for v1.** The next date is built from the current due date, so a task due on the 31st goes to 28 Feb, then 28 Mar. Keeping the 31st would need a stored anchor day.
5. **Pull requests go one at a time.** The next PR starts after the previous one is merged.

## 2. System overview

```
 Schedule page ──► tasks / events routers ──┐
 People page   ──► people router ───────────┼─► Drizzle ─► SQLite
 Schedule page ──► schedule.view (read) ────┘
                         │
                         ▼
       @homer/shared: schemas + nextDueDate, isOverdue, ordering (pure)
```

- Dates are plain text, `YYYY-MM-DD` for a date and `HH:MM` for a time, in the household's local time. There are no timestamps for due dates, so there is no timezone arithmetic.
- **"Today" comes from the browser.** Queries and `complete` take the local date from the client (`today: "2026-11-03"`). Tests are deterministic and the server has no timezone bug. The trade-off is that a tablet with a wrong clock shows a wrong "today".
- All date and repeat logic is pure and lives in `packages/shared/src/domain.ts`, so the assistant tools in slice 5 reuse it.

## 3. Data model

Three new tables, each added by the PR that needs it (migrations `0002` to `0004`).

`people`
| column | type | notes |
|---|---|---|
| id | integer pk | |
| name | text not null | unique ignoring case (rows with `archived_at` set are ignored) |
| created_at | text (ISO-8601 UTC) | |
| archived_at | text null | not used: people are not removed |

`tasks`
| column | type | notes |
|---|---|---|
| id | integer pk | |
| title | text not null | |
| due_date | text null | `YYYY-MM-DD` |
| due_time | text null | `HH:MM`; only with a due date |
| repeat | text null | `daily`, `weekly` or `monthly`; only with a due date |
| person_id | integer null fk → people.id | no cascade |
| created_at | text | |
| done_at | text null | set by Complete |
| removed_at | text null | set by Remove |

A task is **open** when `done_at` and `removed_at` are both null.

`events`
| column | type | notes |
|---|---|---|
| id | integer pk | |
| title | text not null | |
| date | text not null | `YYYY-MM-DD` |
| time | text null | `HH:MM` |
| created_at | text | |
| removed_at | text null | set by Remove |

This changes PRD §6: `people` gets `created_at` (and an unused `archived_at`), `tasks` gets `created_at` and `removed_at`, and `events` gets `created_at` and `removed_at`. The PRD is updated by the PR that adds each table.

## 4. Shared package (`packages/shared/src`)

No Node or DOM types.

- `schemas.ts`
  - `dateSchema` (`YYYY-MM-DD`, a real calendar date), `timeSchema` (`HH:MM`), `repeatSchema`.
  - `personInputSchema`, `taskInputSchema` (a time or a repeat requires a due date), `eventInputSchema`, and the row schemas.
  - `scheduleViewInputSchema`: `{ today, days, personId? }`, with `days` from 1 to 31.
- `domain.ts` (pure, with fast-check properties)
  - `nextDueDate(due, repeat, today)`: steps forward from `due` by one repeat at a time until the date is after `today`.
    - Always later than `today` and than `due`.
    - Weekly keeps the weekday. Daily steps by one day.
    - Monthly clamps to the end of a short month (31 Jan becomes 28 Feb).
  - `isOverdue(task, today)`: open, with a due date before `today`. A task due today with a past time is not overdue.
  - `compareSchedule`: ordering for a day: overdue first (oldest first), then timed items by time, then untimed items.
  - `addDays(date, n)` and `weekdayOf(date)` as small helpers, so no other code does date arithmetic.

## 5. API (`apps/api/src`)

- `routers/people.ts`: `list`, `add`, `rename`. A name that another person already has is a conflict.
- `routers/tasks.ts`: `add`, `update` (also reschedules), `complete`, `remove`, with `list` for the task list itself.
  - `complete({ id, today })` runs in one transaction. It marks the task done and, for a repeating task, inserts the next one from `nextDueDate`. Completing a task that is already done fails with "That task is already done. Refresh the list.", so two tablets cannot create two next tasks.
- `routers/events.ts`: `add`, `update`, `remove`.
- `routers/schedule.ts`: `view({ today, days, personId? })` returns the overdue open tasks, then each day from `today` for `days` days with its tasks and events in `compareSchedule` order. Today is `days: 1` and Week is `days: 7`. Events are not filtered by person, because they have none.
- Error text goes in `apps/api/src/messages.ts`.

## 6. Web (`apps/web/src`)

- **Navigation:** Items, Groceries, Schedule, People.
- **Schedule page** (`pages/SchedulePage.tsx`)
  - A switch between Today and Week, and a person filter ("Everyone" by default).
  - Today: overdue tasks first, with the days overdue in words ("2 days overdue"), then today's items.
  - Week: a card per day, with the weekday and date as the heading.
  - Each task has one primary action, "Done", and a secondary Edit that holds reschedule and Remove. Events have Edit.
  - Add task and Add event buttons open dialogs. The empty state says "Nothing planned. Add a task or an event."
  - The page refetches when the app regains focus, as on Groceries.
- **People page** (`pages/PeoplePage.tsx`): a list of names with an add field and rename.
- Rules: `homer-ui` and `coding-style`, including §7. Components stay small, and `copy.ts` is split by page when it nears the 600-line ceiling.

## 7. Testing (red-green-refactor)

- **Domain, with fast-check:** `nextDueDate` is always after `today` and after `due`, keeps the weekday for weekly, clamps monthly to the month end, and never skips a repeat that is still in the future. `isOverdue` flips exactly at the date. `compareSchedule` is a total order that puts overdue first.
  - Example: weekly, due Monday 2026-11-02, completed Wednesday 2026-11-04, comes back Monday 2026-11-09.
- **Routers, on in-memory SQLite:**
  - Complete creates the next task for a repeating task and none otherwise. It fails the second time, with one next task only.
  - A late repeat lands after today.
  - A task with a time or repeat and no due date is rejected.
  - Remove hides a task and an event but keeps the row.
  - `schedule.view` puts overdue first, filters by person, and groups by day.
- **UI:** checked in the running app with the Playwright MCP at phone and tablet width and in dark mode: add a person, add tasks with and without date, time, repeat and person, complete a weekly task, overdue ordering, the person filter, Week grouping, and the empty states.

## 8. Work order (one PR at a time; the next starts after the previous is merged)

0. This design doc (docs only).
1. **Shared:** date and task schemas, `nextDueDate`, `isOverdue`, `compareSchedule` and helpers, with property tests. No UI.
2. **People:** `people` table and migration `0002`, router with tests, People page, nav link.
3. **Tasks API:** `tasks` table and migration `0003`, the `tasks` router (add, update, complete, remove) and `schedule.view`, with tests. No UI. Open tasks without a due date are returned as `undated`, so they are not invisible.
4. **Schedule page:** the Today view with add, edit, reschedule, complete, repeat, the person filter, an "Anytime" section for undated tasks, and the nav link.
5. **Events:** `events` table and migration `0004`, router with tests, the event form, events shown in Today.
6. **Week view:** the Week side of the switch, grouped by day.

Each PR runs VERIFY and REVIEW before it is opened. A PR is only merged after the previous one, and each leaves `main` working with nothing half-wired in the app. PRD §6 and `CLAUDE.md` status are updated by the PR that changes them.

## 9. Decisions and risks

- **Monthly drift** (decision 4). A task due on the 31st goes to 28 Feb, then 28 Mar. A stored anchor day would fix it, and that can come later.
- **Client-supplied "today".** A tablet with a wrong clock shows a wrong day. The alternative, the server's clock, would make tests depend on the real date.
- **Overdue with a time.** A task due today at 08:00 is not overdue at 09:00. It becomes overdue the next day. Revisit if people want hour-level reminders.
- **Completed tasks are not shown** on Today or Week. They stay in the database as history, and the assistant can report on them in slice 5.
- **File size.** `copy.ts` grows with each page. It is split by page when it nears 600 lines.
- **Open question:** none.
