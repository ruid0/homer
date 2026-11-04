# Slice 4: Home. Definition, technical plan and system design

Status: draft, revised for the timeline design (direction D in the UI rethink) · Owner: Igor Bondarenko · Date: 2026-11-03 · Source: PRD §3, §4.3, §8 (slice 4). Builds on `docs/design-slice-1-items.md`, `docs/design-slice-2-groceries.md`, `docs/design-slice-3-schedule.md` and `docs/design-ui-pass.md`.

## 1. Definition (DEFINE)

**Problem.** The state of the house is spread over three pages: Items, Groceries and Schedule. Nobody can see at a glance what is running out, what is overdue and what is on today.

**For whom.** Everyone in the household. The main screens are a touchscreen bigger than a tablet (a wall or desk screen) and a phone.

**In scope**
- A Home page at `/` with two cards:
  - **Your day:** a timeline, in this order:
    1. overdue tasks, oldest first, each with how many days late;
    2. a **Now** marker with the current time;
    3. today's events and tasks. Timed events and tasks are in time order (a task has an optional due time), and anything without a time follows as "Any time".
  - **Running out:** items that are running low or out, most urgent first, in plain words ("Milk runs out in 2 days"), with "On the grocery list" when they are on it.
- Both cards **scroll inside themselves**, so the page never grows. A row is cut off at the bottom edge and a soft fade sits over it while more rows remain, which tells you there is more. The Now marker stays in view as you scroll.
- **Done** on an overdue or today task, and **Bought it** on an item, work from Home. Bought it opens the restock sheet prefilled with the usual amount.
- Empty cards stay on screen with a calm line ("Nothing running out.", "Nothing overdue.", "Nothing planned today.").
- The page follows the clock (the Now marker, a new day, a tab coming back into view) and refetches on an interval so a wall display stays current.
- The new app shell: a left rail on tablet and wall widths and a bottom bar on phones, plus a breakpoint for big touchscreens (1920px and wider, root font size 150%).

**Out of scope**
- A person filter (this is a household screen; Schedule has one).
- Undo after Done or Bought it. The toast only confirms.
- Adding or editing task times. Home only shows the due time a task already has.
- The assistant ask bar (direction E), the grocery list, the Week view, editing from Home, charts and notifications.

**Done when**
- Milk at 1 litre lasting 2 days per litre shows "Milk runs out in 2 days" and "On the grocery list" (PRD §4.1).
- An overdue task shows with how many days late, and Done removes it.
- Today's events show in time order, with tasks after them.
- With more rows than fit, both cards scroll and show the cut-off row and fade.
- After midnight, or when the tab comes back into view, the cards show the new day (the same `useToday` the Schedule page uses).
- The screen is readable at phone, tablet and 1920px width, in light and dark, with no console errors.
- `pnpm typecheck` and `pnpm test` pass.

### Decisions (owner, 2026-11-03)

1. **No person filter** on Home.
2. **No row cap.** Both cards scroll, and the position of the rows hints that there is more.
3. **Direction D (Timeline)** from the UI rethink, with a left rail and a bottom bar. Home is `/`, Items moves to `/items`. The links become Home, Items, Groceries, Schedule, People.
4. **"Running out" counts items already on the grocery list.** It describes stock, not whether someone has noted it down.
5. **No Undo for now.**
6. **A breakpoint for big touchscreens** at 1920px, with larger type and touch targets.
7. **"Any time" for items without a time.** The owner chose "Any time for now" believing tasks had no time; they do have an optional `dueTime`, so Home shows it and no new field is built.
8. **Pull requests go one at a time.** The next PR starts after the previous one is merged.

## 2. System overview

```
 Home page ──► inventory.list ───────────┐
           ──► groceries.list            ├─ existing routers, unchanged
           ──► schedule.view(days: 1) ───┤
           ──► tasks.complete   (Done)   │
           ──► inventory.restock (Bought it)
```

No new router, no schema change and no migration. The page reads what the other pages already read.

## 3. Shared package

No change. Nothing new is defined outside `packages/shared/src/schemas.ts`: the page uses the types the api already returns.

## 4. Web (`apps/web/src`)

- **Shell (PR 1).** `components/Nav.tsx` has the rail (from `md` up, sticky, icon above label) and the bottom bar (below `md`, fixed, safe-area aware). `App.tsx` lays them out. `index.css` adds `--breakpoint-wall: 100rem` and a 150% root font size at that width, so everything in rem grows together. Until Home exists, `/` redirects to `/items` and the nav has four links.
- `lib/timeline.ts`, pure and tested (PR 2):
  - `timelineRows(overdue, dayItems, now)`: overdue rows, then today's rows, split at the Now marker so past timed events sit above it. Reuses `lib/dayItems.ts` and its `compareSchedule` order.
  - `runningOut(items, listedIds)`: items with `runningLow` or quantity 0, ordered by the existing `sortByUrgency`, each with an `onList` flag. `listedIds` is built from `groceries.list` the same way `ItemsPage` does it, because `inventory.list` does not return it.
- `components/ScrollCard.tsx` (PR 4): a card whose body scrolls, with a bottom fade that shows only while more rows remain below.
- `pages/HomePage.tsx` (PR 4): the two cards. Side by side on tablet and wall, stacked on a phone.
- **Wording.** Rows reuse `describeRunsOut`, so an item still in stock reads "Runs out in 2 days" and an item at 0 reads "Out of it". Overdue rows reuse `copy.schedule.overdueBy`.
- **Done and Bought it.** Done calls `tasks.complete` with today's date, is disabled while the call is pending, shows the "already done, refresh" error inline as the Schedule page does, and invalidates `schedule.view`, because the next task of a repeating one can appear. Bought it reuses `RestockDialog`.
- All strings are in `copy.ts` (coding-style §7).

## 5. Testing (red-green-refactor)

- Unit tests are written first, for the helpers:
  - `runningOut`: an item with no estimate is left out (not low), an item at quantity 0 comes first and reads "Out of it", an item in stock reads "Runs out in N days", and `onList` follows `listedIds`.
  - `timelineRows`: overdue first, oldest first; timed events split around `now`; tasks last; empty inputs.
- The web app has no component tests, so the shell and the page are checked in the running app with Playwright at 390px, 1024px and 1920px, light and dark: the milk example, an overdue task being completed, an empty card, more rows than fit.

## 6. Work order (one PR at a time; the next starts after the previous is merged)

Until PR 4 lands, `/` redirects to Items and the nav has four links; the Home lines above describe the finished slice. The 1920px breakpoint is `120rem`, which is 1920px at the default 16px root.

1. **Design doc** (merged earlier).
2. **App shell:** rail, bottom bar, `/items` route move, the 1920px breakpoint, and this doc revised for the timeline.
3. **Shared logic:** `timelineRows` and `runningOut`, with tests.
4. **Home page:** the scrolling timeline with the Now marker, Running out, Bought it and Done with a confirming toast, and the Home nav link and route. Marks slice 4 built in this doc and the PRD §8 list, and updates the `CLAUDE.md` project status and its page list (Home, Items, Groceries, Schedule, People).
5. **Restyle the other pages** to the new shell and touch sizes (may be two PRs).

Each PR runs VERIFY and REVIEW before it is opened, and leaves `main` working with nothing half-wired.

## 7. Decisions and risks

- **Two queries feed two cards.** Running out needs `inventory.list` and `groceries.list`, while the timeline needs one `schedule.view` call. Each card loads on its own and, if its query fails, shows a short calm error line (what happened, then refresh), never a blank card.
- **The timeline can be sparse.** Tasks with no due time all read "Any time" and sit after the timed rows.
- **Wall display refetch.** A fixed interval is simple and enough for one household. A push channel is not worth it.
- **Bookmarks to `/`** that used to open Items now open Home. This is harmless while the PWA is not built.
