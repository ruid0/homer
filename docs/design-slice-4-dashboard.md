# Slice 4: Dashboard. Definition, technical plan and system design

Status: draft · Owner: Igor Bondarenko · Date: 2026-11-03 · Source: PRD §3, §4.3, §8 (slice 4). Builds on `docs/design-slice-1-items.md`, `docs/design-slice-2-groceries.md` and `docs/design-slice-3-schedule.md`.

## 1. Definition (DEFINE)

**Problem.** The state of the house is spread over three pages: Items, Groceries and Schedule. Nobody can see at a glance what is running out, what is overdue and what is on today.

**For whom.** Everyone in the household, mostly a tablet in the kitchen or a phone.

**In scope**
- A Home page at `/`, readable in about 3 seconds, with three blocks in this order:
  - **Running out:** items that are running low or out, most urgent first, in plain words ("Milk runs out in 2 days"), with "On the grocery list" when they are on it.
  - **Overdue:** overdue open tasks, with how many days late.
  - **Today:** today's tasks and events in time order, with the person's name when there is one.
- Each block shows at most 5 rows. When there are more, it ends with a link to the full page. Overdue and Today say "See all N" and link to Schedule, whose Today view lists exactly those rows. Running out says "See all items" with no count and links to Items, because that page lists every item, not only the running-out ones.
- **Done** on an overdue or today task works from the Home page.
- Empty blocks stay on screen with a calm line ("Nothing running out.", "Nothing overdue.", "Nothing planned today.").
- The page follows a new day and a tab coming back into view, as the Schedule page does.

**Out of scope**
- A person filter (this is a household screen; Schedule has one).
- The grocery list, the Week view, editing from the Home page, charts, notifications and the assistant.
- Undated ("Anytime") tasks: they stay on the Schedule page.

**Done when**
- Milk at 1 litre lasting 2 days per litre shows "Milk runs out in 2 days" and "On the grocery list" (PRD §4.1).
- An overdue task shows with how many days late, and Done removes it.
- Today's tasks and events show in time order.
- After midnight, or when the tab comes back into view, the blocks show the new day (the same `useToday` the Schedule page uses).
- The screen is readable at tablet and phone width, in light and dark, with no console errors.
- `pnpm typecheck` and `pnpm test` pass.

### Decisions (owner, 2026-11-03)

1. **No person filter** on the Home page.
2. **Five rows per block** to start. The cap is a single constant, so it can change after seeing it on the tablet.
3. **Home is `/`.** Items moves to `/items`. The links become Home, Items, Groceries, Schedule, People.
4. **"Running out" counts items already on the grocery list.** It describes stock, not whether someone has noted it down. The row carries the "On the grocery list" tag.
5. **Pull requests go one at a time.** The next PR starts after the previous one is merged.

## 2. System overview

```
 Home page ──► inventory.list ───────────┐
           ──► groceries.list            ├─ existing routers, unchanged
           ──► schedule.view(days: 1) ───┘
           ──► tasks.complete   (Done)
```

No new router, no schema change and no migration. The page reads what the other pages already read.

## 3. Shared package

No change. Nothing new is defined outside `packages/shared/src/schemas.ts`: the page uses the types the api already returns.

## 4. Web (`apps/web/src`)

- `lib/dashboardRows.ts`, pure and tested. `DASHBOARD_ROW_LIMIT = 5` lives here.
  - `runningOut(items, listedIds)`: items with `runningLow` or quantity 0, ordered by the existing `sortByUrgency`, each with an `onList` flag. `listedIds` is the set of item ids on the grocery list, built from `groceries.list` the same way `ItemsPage` does it, because `inventory.list` does not return it.
  - `limitRows(rows, max)`: returns the rows to show and how many are hidden.
- **Wording.** Rows reuse `describeRunsOut`, so an item still in stock reads "Runs out in 2 days" and an item at 0 reads "Out of it". Overdue rows reuse `copy.schedule.overdueBy`.
- **Order.**
  - Overdue is the `overdue` list as `schedule.view` returns it, oldest first, so the cap keeps the most overdue.
  - Today reuses `lib/dayItems.ts` (tasks and events merged in `compareSchedule` order), and the cap applies to that merged list.
- `components/DashboardBlock.tsx`: heading, rows, empty line, a calm error line when its query fails, and the link to the full page.
- `pages/DashboardPage.tsx`: the three blocks. On a tablet they sit side by side, and on a phone they stack.
- Rows are compact, not full cards. Urgent text uses the same amber as the Items page. Done is a secondary button, so the screen does not fill with primary buttons, but it keeps a 44px touch target (homer-ui).
- **Done.** It calls `tasks.complete` with today's date, is disabled while the call is pending, shows the "already done, refresh" error inline as the Schedule page does, and invalidates `schedule.view` afterwards, because the next task of a repeating one can appear in a block.
- All strings are in `copy.ts` (coding-style §7).
- `App.tsx` routes `/` to Home and `/items` to Items. The Home `NavLink` takes `end`, so it is not marked active on every page.

## 5. Testing (red-green-refactor)

- Unit tests are written first, for the helpers:
  - `runningOut`: an item with no estimate is left out (not low), an item at quantity 0 comes first and reads "Out of it", an item in stock reads "Runs out in N days", and `onList` follows `listedIds`.
  - `limitRows`: the cap boundary (exactly 5, and 6), and an empty list.
  - PR 3 adds tests for the Overdue and Today selection and the cap on the merged Today list.
- The web app has no component tests, so the page itself is checked in the running app.
- Checked in the running app with Playwright at 390px and 1024px, light and dark: the milk example, an overdue task being completed, an empty block, more than 5 rows.

## 6. Work order (one PR at a time; the next starts after the previous is merged)

1. **Design doc** (this file).
2. **Home page with the Running out block:** the `/items` route move, the navigation link, the helpers with tests, and a page that works by itself.
3. **Overdue and Today blocks,** with Done. Marks slice 4 built in this doc and the PRD §8 list, and updates the `CLAUDE.md` project status and its page list (Home, Items, Groceries, Schedule, People).

Each PR runs VERIFY and REVIEW before it is opened, and leaves `main` working with nothing half-wired.

## 7. Decisions and risks

- **Two queries feed three blocks.** Running out needs `inventory.list` and `groceries.list`, while Overdue and Today share one `schedule.view` call. Those two blocks load together and Running out loads separately, so each block has its own loading line. If a query fails, its block shows a short calm error line (what happened, then refresh), never a blank block.
- **Capped lists hide rows.** "See all N" is the way out, and the cap can be raised.
- **Bookmarks to `/`** that used to open Items now open Home. This is harmless while the PWA is not built.
