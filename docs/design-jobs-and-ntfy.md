# Jobs and notifications: daily depletion, ntfy, routine reminders. Definition, technical plan and system design

Status: In progress (PRs 1, 2 and 3a built: depletion, the sender and household notes, reminders without a screen) · Owner: Igor Bondarenko · Last updated: 2026-11-05 · Source: `docs/v2-plan.md` theme A, the owner's decisions of 2026-11-05, and the PRD §4.1 and §5. Builds on `docs/design-slice-1-items.md`, `docs/design-slice-2-groceries.md` and `docs/design-routines.md`.

The repo is public. Topics, tokens and the household's real data never go into this repo, its tests or its logs.

## 1. Problem

HOMER is pull-only, and stock never counts down. "Runs out in 30 days" is worked out from the stored quantity, and the quantity changes only when someone restocks, edits or marks an item out. A bag with a 30-day estimate says 30 days today, tomorrow and next month. So an item reaches the grocery list on its own only if someone changes it, and Home's "Running out" never moves with time. The daily depletion job described in the PRD was never built (v1 shipped without it).

Nothing tells anyone anything either: no reminder, no end-of-day summary, no nudge for a routine row.

**Done when:**
1. Every day, each item with a usage estimate loses `1 ÷ days per unit` of its quantity per day that passed. It never goes below zero, and items that become low land on the grocery list.
2. A Mac that slept through the job catches up on the missed days when the api next starts.
3. When turned on, HOMER sends small ntfy notifications: an end-of-day note, a morning note when items were added to the list, and routine reminders. When off, it makes no outbound call.
4. A routine row can have reminders like "in an hour", "at 13:30" or "every day at 13:30", sent only to that person's own topic.

## 2. Decisions (owner, 2026-11-05)

1. **ntfy.sh to start**, with short generic text and a long random topic name. The sender sits behind a small interface so a sturdier channel can replace it.
2. **Recipients:** one household topic, plus one topic per person for their own routine reminders.
3. **End of day:** 20:00, a short count, only when there is something to say.
4. **Morning note** (default, can be dropped): only when the depletion job added something to the grocery list.
5. **Routine reminders:** set per row as "in an hour", "in 30 minutes", "at 13:30" or "every day at 13:30". A row can have several. Nothing is sent if the row is already at its target.

## 3. Out of scope

- Two-way replies from a phone. Nothing listens, so knowing a topic lets someone read notifications, not act.
- Names of items, people or routine rows in any notification text. The lock screen shows only counts and generic words.
- Reminders for tasks and events (the same parser could serve them later).
- Russian phrases for reminders (with the language step, theme F).
- A self-hosted ntfy server. The `NTFY_SERVER` setting allows it later.

## 4. PR 1: daily depletion

### Rule

For a day `D` the job runs, each active item takes `elapsed = D − depleted_on` days. If it has an estimate (`effectiveEstimate`: learned wins over entered):

`quantity = max(0, quantity − elapsed ÷ daysPerUnit)`

and `depleted_on = D`. Items without an estimate only get `depleted_on = D`. Then `syncGrocery` runs for each item whose quantity changed, in the same transaction, so a newly low item is added to the list under the existing rules (hand-added entries are never removed by it). Items the run did not change are not synced, so a run never adds list entries for stock nobody touched.

Restocks, edits and "Out of it" change the quantity and leave `depleted_on` alone. Restoring an archived item resets it to today, because archived items are skipped and would otherwise be charged for every day they were archived. The next run subtracts only the days that have passed, so a restock made on the same day loses nothing extra.

### Data

`items.depleted_on` (text `YYYY-MM-DD`, nullable). The migration stamps every existing item with today's date, so nothing is taken off retroactively. New items get today's local date at creation. A null value (should not occur) is stamped with the run day and nothing is subtracted.

### Code

- `packages/shared/src/domain.ts`: `depleteStock(quantity, daysPerUnit, elapsedDays)`, pure, rounded to six decimals. Property tests: never negative, never above the start, unchanged without an estimate or with zero days, and several days at once match single days.
- `apps/api/src/time.ts`: `localDate` and `parseClockTime`, shared by the jobs and the schema default.
- `apps/api/src/jobs/depletion.ts`: `depleteAll(db, today)` (one transaction) and `startDepletion(db, options)`: runs once at boot (catches up missed days), then daily at `DEPLETION_TIME` (default 05:30, household time zone). Never throws at boot, and logs failures. The database library is synchronous, so the boot run and the schedule cannot overlap.

Quantities are now fractions, so the Items screen shows them to two decimals.

## 5. PR 2: the sender and the household notes

- `apps/api/src/notify/ntfy.ts`: `Notifier` (`(note) => Promise<boolean>`, never throws), `ntfyConfig(env)` (null, so off, unless `NTFY_HOUSEHOLD_TOPIC` is set; `NTFY_SERVER` defaults to `https://ntfy.sh`; optional `NTFY_TOKEN` and `HOMER_PUBLIC_URL` for the tap link), `createNtfyNotifier` (JSON POST, 10 s timeout). A sturdier channel can replace it by implementing `Notifier`.
- `notify/summary.ts`: `dayCounts` (tasks due today or overdue that are still open, and items that are low or out) and `endOfDayMessage`, which is null on a quiet day. Text: "Today: 1 task left, 2 items running low." Counts only, no names.
- `jobs/endOfDay.ts`: daily at `END_OF_DAY_TIME` (default 20:00). The day it was last handled is kept in the new `job_state` table (migration 0011), so a Mac that wakes after 20:00 sends it once that day and never twice. A quiet day counts as handled. A failed send is logged as a failure (not as a quiet day) and is not recorded, so the next api start the same day tries again. It is not retried while the api keeps running, so a short outage at 20:00 can lose that day's note.
- Morning note: when a depletion run puts items on the grocery list, "2 items added to the grocery list." goes to the household topic (it also fires if that happens at start-up). The count is the net rise in open list entries during the run. Nothing is sent when the run adds nothing.
- If `NTFY_SERVER` is plain `http://` to a non-local address and a token is set, the api logs a warning at start, because the token and text would cross the network unencrypted.
- Phones subscribe to the household topic in the ntfy app. Setup steps are in the README.

## 6. Later PRs

3. **Routine reminders**, in two PRs.
   - **3a, parser, data, api and job (built).**
     - `parseReminderWhen(text)` in `packages/shared/src/reminders.ts` reads "in an hour", "in half an hour", "in 30 minutes", "in 1 hour 30 minutes", "in 1.5 hours", "45 min", "13:30", "at 13:30", "1:30pm", "at 1pm". Relative times can be up to 24 hours. It returns null for anything else and never guesses. English only for now (Russian comes with theme F).
     - `routine_reminders` (row, next fire time in UTC, optional `HH:MM` for daily, `removed_at`) and `people.notify_topic` (migration 0012).
     - `people.reminderSetup` makes a person's secret topic (`homer-` plus 32 random hex digits) once, and returns it with the ntfy server so they can subscribe on their phone. The topic never appears in the people list, in renames or adds, or in the reminders list. `people.list` shows only `remindersOn`.
     - `routines.addReminder({ itemId, text, repeatDaily })` (needs reminders turned on for that person; "every day" needs a clock time), `routines.reminders({ personId })` and `routines.removeReminder`.
     - A job checks every minute (only when notifications are on). For each person with due reminders it sends one generic note, "Routine: 2 rows not done.", to that person's own topic, only when a row is below its target today. A one-off reminder is finished when it fires, a daily one moves to its next time. A reminder more than 30 minutes late is dropped (the Mac was asleep). A failed send leaves it in place and is retried each minute until it is too late.
   - **3b, the screen.** In the row dialog: the list of reminders, an input ("in an hour", "at 13:30"), quick buttons (In 30 min, In an hour, In 2 hours), an "Every day" box, and remove. On the Routine screen: turning reminders on for the person and the steps to subscribe on their phone, or a note that notifications are off.
4. **Docs.** This file set to Built, plus the PRD, v2 plan and `CLAUDE.md`.

## 7. Risks

- **Behaviour change:** after PR 1 stock counts down and items start appearing on the list. The household copy's data is the owner's, so this is tested on scratch data only.
- **Time zone:** days are the household's local days (`TZ`), the same as the backups.
- **The public relay sees notification text.** Text stays generic and topics stay secret and long. A self-hosted ntfy can replace it.
