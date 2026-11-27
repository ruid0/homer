# TV display: a read-only dashboard on the living-room TV. Definition and plan

Status: In progress (approved 2026-11-25 with the proposed Tomorrow list; PR 1, the /tv page, merged; PR 2, the Android app, built and awaiting a run on the real TV) · Owner: Igor Bondarenko · Last updated: 2026-11-26 · Source: the owner's request, `docs/design-slice-4-dashboard.md` (Home already targets a wall screen), `docs/mcp.md` (the Tailscale-only rule for new listeners).

The repo is public. The household's Tailscale address and data never go in this repo, its tests or its logs.

## 1. Definition

**Problem.** Nobody opens HOMER in the living room, so the day's tasks, upkeep and low stock are only visible to whoever looks. A TV that always shows them fixes that.

**Who.** The whole household, from the sofa. Nobody taps the TV.

**Decided by the owner (2026-11-25):**
- The TV is a Hisense running **Google TV**. A **small Android app** on it opens the page.
- It shows: a clock and date, today's tasks and events, upkeep, and running out. **No weather** (it would need an outbound call).
- The TV reaches HOMER over **Tailscale** (the Android TV app), through the same `tailscale serve` address the phones use. Nothing new is exposed on the home network.
- No night mode: the owner turns the TV off at night.

**Out of scope:** phones and tablets (the type scales from the screen width, so a phone shows it tiny), taps or remote-control navigation, editing anything, weather, routines per person (easy to add later), a separate backend, and an app store listing.

**Done means:**
- The TV shows a change made on a phone within a minute.
- It comes back by itself after the TV sleeps or reboots, or the Wi-Fi drops (with the last data and a "last updated" time while the api is out of reach).
- Text is readable from the sofa at 1080p and 4K.
- A browser test covers the loading, empty and failed states of each part, and nothing about the household leaves the house.

## 2. Findings that shape the plan

- **Home already is a wall display.** It follows the clock, refetches every minute, keeps the old day on screen at midnight, and has a 1920px `wall:` breakpoint. `/tv` reuses its data and pure helpers (`timelineRows`, `runningOut`, `needsDoing`, `dateParts`, `useClock`) instead of copying them.
- **Why a separate page, not Home on a big screen.** Home has Done and Snooze buttons, dialogs, toasts and a nav rail, and its type is sized for a tablet. The TV needs none of that, and its CSS viewport is unknown: Android TV WebViews often report 960 by 540 for a 1080p panel.
- **The Mac has no Android toolchain** (no JDK, no `adb`, no Android SDK). Building the app needs OpenJDK 17, the Android command-line tools and Gradle, about 1 GB through Homebrew. A web-app wrapper such as a Trusted Web Activity won't work: it needs a public HTTPS address, and a Tailscale one isn't.
- **The app can't hold the address in the repo.** It is built with the address from an untracked local file, so no household detail is committed. Typing one with a TV remote is not realistic.

## 3. Design pass

`homer-ui` governs; `frontend-design` supplies the typographic craft. What the pass changed:

- **Type and scale:** keep Atkinson Hyperlegible Next, since legibility at a distance is its design purpose and it matches the rest of HOMER. The base size is set from the viewport width (a `vw` unit on the page's root), so 960 or 1920 CSS pixels look the same. Four sizes: the clock, the weekday, the section titles, and everything else (rows, "Updated" and "+N more") at one readable size. Nothing is smaller than a row, because the stale warning is the most important text when something is wrong.
- **Colour:** the dark charcoal palette, always, whatever the TV reports (a bright room with a white page glares). Same tokens as the app (`surface`, `ink`, `muted`, `warn`, `late`), forced dark by one class. Colour still means state only, and each state also has words ("Overdue", "Due today"), as `homer-ui` requires.
- **Layout:** left-aligned, safe margins of 5% for TV overscan, and no card boxes. Space and one hairline separate the two columns, because a row of identical rounded cards is the default look this pass avoids.
- **The one memorable thing:** the time, set very large, with the weekday beside it. Everything else stays quiet.
- **Nothing to tap:** no buttons, links or focus rings, so the keyboard-reach rule has nothing to apply to. No motion except the clock updating.

```
+--------------------------------------------------------------+
|  Wednesday                                                   |
|  18:42        25 Nov                      Updated 18:42      |
|                                                              |
|  Today                           | Upkeep                    |
|  Overdue  Call the plumber       |  Overdue  Furnace filter  |
|  17:00    Dentist        Ana     |  Due      Softener salt   |
|  18:30  - now -                  |                           |
|  19:00    Dinner at Bo's         | Running out               |
|                                  |  Salt          in 3 days  |
|  Tomorrow                        |  Dish soap     in 5 days  |
|  09:00    School run             |  4 on the grocery list    |
+--------------------------------------------------------------+
```

Reviewed against the brief: the first plan used a big stat tile per card, which is the default dashboard look. It was replaced by the plain two-column text layout above, with the clock as the only large element.

## 4. Plan and PR boundaries

**PR 1: the `/tv` page** (`apps/web`; no api change)
- A `/tv` route outside the app shell (no rail or bottom bar), with `pages/TvPage.tsx` and small components in `components/tv/`. It uses the existing queries on a 60-second refetch, keeping the previous data on a failed refetch.
- "Updated 18:42" shows when the last fetch worked, and the words "Can't reach HOMER. Showing the last update." appear when it fails.
- Copy in `copy.ts`. Pure helpers (which rows show, how many fit) in `lib/` with tests.
- Tests: Playwright `tv.on.spec.ts` for the happy path, loading, empty per section, a failed refetch (stale data and message), and a midnight rollover; `copy.test.ts` and `rawColors.test.ts` stay green. Looked at in the browser at 960 by 540 and 1920 by 1080, and with the Playwright MCP.
- Review: `reviewer` and `ui-reviewer`.

**PR 2: the Android app** (new `apps/tv-android`, outside the pnpm workspace)
- A tiny Kotlin app: one full-screen WebView, the Android TV launcher entry (so it shows on the Google TV home screen), the screen kept on, no address bar, reload on a failed load with a retry every 30 seconds, and an auto start after boot if the TV allows it.
- The address comes from `apps/tv-android/local.properties` (gitignored); the repo holds only an example file.
- A README: install the toolchain, build, enable developer options on the TV, `adb connect` and install, install Tailscale on the TV and sign in, make it always-on.
- Checks: it builds and installs; a unit test for the load and retry logic; the real check is yours: on the TV after a reboot and after the Wi-Fi drops.
- Review: `reviewer`. No `ui-reviewer` (no `apps/web` change).

**PR 3: docs.** `CLAUDE.md`, README, and the PRD (a read-only display is not a new data path) are each updated in PR 1 and 2; the Status line goes to Built after PR 2.

## 5. Risks
- **The WebView on the TV may be old.** The page should load on a WebView from the last few years; the build will name a minimum version, and the first run on the real TV is the test.
- **Sleep and reboot.** Google TV may kill the app. The retry loop and the boot start cover it, but only the real TV proves it.
- **The api being unreachable.** Covered by the stale-data rule above.
- **Tailscale on the TV** drops if the TV is set to sleep the VPN. The README says to turn on always-on.

## 6. Decisions (owner, 2026-11-25)
1. A small "Tomorrow" list under Today: yes.
2. Install OpenJDK 17, the Android command-line tools and Gradle through Homebrew when PR 2 starts: yes.
3. Build the page first, and try it in a browser before the app exists: yes.

## 7. As built (PR 1)
- `/tv` is outside the app shell (`App.tsx`). `pages/TvPage.tsx` with `components/tv/`, the helpers in `lib/tv.ts` (`leftToday`, `fit`) and `lib/useTvScreen.ts` (the dark palette and the `1.1vw` root size).
- It refetches every 60 seconds, and every 10 seconds after a failure. The last answer stays on screen, with "Can't reach HOMER. Showing the last update."
- Today keeps open tasks whose time has passed (a task is not done until someone does it) and drops past events. The lists for a day are not kept across midnight, so they read "Loading." until the new day answers rather than show yesterday's rows. Refetching continues even if the TV browser reports the page as hidden.
- Every row is one line: a long title is cut with an ellipsis and the person's name sits after it, so a list's height is known. Lists are cut to fit (5, 3, 4 and 4 rows) because the screen cannot scroll. "+N more" shows whenever any are left out.
- There is no Now marker: the clock says it.
- The page is exactly one screen tall and clips rather than scrolls. A test fills every list with long titles and checks each section ends inside the 5% safe margin at 1920 by 1080 and 960 by 540. Only the real TV settles the rest.
- Test: `apps/e2e/tests/tv.tv.spec.ts`, on its own scratch copy (the lists are cut, so other specs' rows would hide its own).

## 8. As built (PR 2)
- `apps/tv-android`: a Kotlin app with no AndroidX and no runtime dependencies (`minSdk` 24). One full-screen WebView on the TV launcher, the screen kept on, the system bars hidden, and a dark window so nothing flashes white.
- The address comes from `local.properties` (git ignores it) as `homer.url`; the build stops with a message when it is missing. A new address needs a new build.
- A page that can't be loaded shows "Can't reach HOMER. Trying again." and is tried again after 5, 10 and 20 seconds, then every 30. The page is also loaded from scratch every 6 hours. The timing is `LoadPolicy.kt` and the rules for what counts as a failure or a success are `LoadTracker.kt`, both pure and tested. A retry that was waiting when the screen paused is made when it comes back, and a link off HOMER's own address is ignored.
- A boot receiver asks Android to open the app at start-up. Android may refuse that from the background, so the README says to open it once from the home screen.
- Checked here: unit tests (10), a debug build, and Android lint with no warnings; the manifest has the leanback launcher entry and the banner. **Not checked: a run on a TV or an emulator.** The owner's check is the real one: after a reboot, after the Wi-Fi drops, and after the Mac sleeps.

## 9. The richer screen (2026-11-26)
After a week on the TV the owner asked for two things: the greys looked washed out, and more should be shown now the real screen is seen.
- **Colour.** The TV palette is its own, not the app's dark one: a television is an LCD that lifts a charcoal into grey in a bright room. The background is `#0a0908` (nearly black), text `#f6f3ee`, secondary text `#cbc5bc` (was `#aaa59d`), the divider is lighter, and the warn and late colours are a little brighter. They keep their meaning, and each still comes with words.
- **Type.** The base size is `1.25vw` (was `1.1vw`): 24px at 1080p. Rows are tighter (`0.375rem` above and below) so more fit.
- **Two new sections.** **Upcoming**: what is planned in the five days after tomorrow, each row led by its day ("Sat 28") with the time after the title. **Any time**: tasks with no date, which the Schedule page already shows. The query asks for seven days. A recurring task now shows on each day it falls on, in Today, Tomorrow and Upcoming, as on the Schedule page.
- **Layout.** Left: Today, Tomorrow, Upcoming. Right: Upkeep, Any time, Running out.
- **Rows by room, not by count.** Fixed row caps either wasted the space or overflowed it, so the page measures its grid (`useRemHeight`) and `allocateRows` (`lib/tv.ts`) shares the rows out: every section first gets two, then the sections fill in order, so Today is complete before Upcoming grows. A section's costs in rem (row, heading, "+N more", empty message) are constants beside it, and the browser test that fills every section at 1920 by 1080 and 960 by 540 fails if they drift from the CSS. A screen that is not 16 by 9 gets the rows its own height allows.
- **Tests.** `lib/tv.test.ts` (the allocator, `upcomingRows`, `shortDay`) and `tv.tv.spec.ts` (the new palette values, Upcoming and Any time shown, their empty states, and the full-lists margin test for all six sections).

## 10. Three columns and the groceries (2026-11-26)
The owner's photo of the real screen showed three problems: a blank gutter on every Today row (the status sat at the far right, away from the title), Upcoming starved to one row while the bottom left was empty, and a header that took a quarter of the height. Several layouts were drawn on a design canvas and the owner picked the third, "three columns with groceries".
- **Layout.** Left: Today, Tomorrow, Upcoming. Middle: Running out, Groceries. Right: Upkeep, Any time. The clock is smaller (4.5rem) and the header gap tighter, so the lists get the height.
- **First column.** Every row has a fixed first column: the time, a state in words ("5 days overdue" in the late colour, "Due today", "Any time", "All day"), or, in Upcoming, the day, named once on the first row of that day (the time follows the title). The status is no longer at the far right.
- **Groceries.** The open grocery list: the name, and the amount (with its unit) after it, with "N to buy" beside the heading. Running out holds only the low items that are not on the list yet, so the two never repeat a row.
- **What gives way.** A section hides rows only when there is no room, and the cut starts at the bottom of the first column: Today and Tomorrow take their rows first (`planDays`), and Upcoming gets what is left. When its rows do not all fit it shows a line a day (the day's first item and "+N more"), so a busy week still reaches every day; with less room, only its heading with the count; with none, nothing. In the other two columns the sections fill in order and each keeps one row (`allocateRows`; the first column's floor for Upcoming is zero).
- **Tests.** `lib/tv.test.ts` (the allocator's floor, `dayLines`, `planDays` including that Tomorrow is whole before Upcoming gets anything) and `tv.tv.spec.ts` (groceries, the day named once, Upcoming as lines, as a heading with a count, and gone when the first column is full; the safe-margin test covers all seven sections).
