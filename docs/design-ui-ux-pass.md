# UI and UX pass over Upkeep and Home, and the visual pass over the app

Status: In progress (PR A built, B to F planned) · Owner: Igor Bondarenko · Last updated: 2026-11-05 · Source: three critical `ui-reviewer` passes (UI reassessment, UX ease of use, visual design) run on the merged maintenance work, and the owner's answers of 2026-11-05.

## Decisions (owner, defaults accepted)

- Nav order becomes Home, Groceries, Schedule, Upkeep, Items, People, Assistant, and Upkeep gets a wrench or loop icon.
- Renames: Home "Due soon" becomes "Upkeep", Home "Your day" becomes "Today", Upkeep "Needs doing" becomes "Due now", "Add an item" becomes "Add job", "Out of it" becomes "Ran out" (and moves under Edit).
- Identity: the "Now" line carries through Schedule, a one-line summary sits under the Home date, a big weekday with a muted date, larger tabular time numerals, a small amber accent on the wordmark. No display font and no illustration unless asked.
- Slashed zeros stay on times; checked at 2 metres.
- Not adopted, with reasons: swipe and long-press (not discoverable, no keyboard route, wet hands), bottom sheets, command bars, inline row editing, skeleton loaders, a phone "More" tab, gradients, illustrations, a second font.

## PRs

- **A. Bugs and accessibility (built).** Plain-words input errors from the api (`errorFormatter`), name capped at 80, far dates told in months or with their year, one source for month names, second done on the same day refused in words, rail tightened and scrollable, phone labels at 11px, focus returns to the opener after a dialog and moves to the next Done after a Done, Undo toast waits while held and stays 15 seconds, quiet Dismiss.
- **B. Design foundations.** One status style (18px semibold) on every screen, darker bolder `late` plus a left border on overdue rows, a `--control` border token (about 3.5:1), shared `PageHeader`, one shared Home row, a fixed action grid in `ListRow`, fade `h-8`, two columns from `lg` on Items and Upkeep, "Any time" spelling, shorter Upkeep blurb, no "Chat" heading, lighter dark-mode card.
- **C. Home layout and naming.** Card order (overdue upkeep first), one column below `lg`, cards sized to content, card title link and a due-count badge on the Upkeep nav item, the renames above, shorter toasts, one loading string.
- **D. Upkeep flow.** Last-done chips, tap the row to edit, dialog for name and cycle only with History behind a disclosure (latest few, named remove with confirm), 44px stepper and segmented unit, quieter Done on Later rows, toast with the next due date and "Done earlier?" chips, no autofocus while chips show, chips as the empty state, Later collapsed when long, optimistic Done, Done beside the title on a phone.
- **E. Snooze.** "Not today" by a day, a week or a month (schema change).
- **F. Identity.** The items under "Identity" above.
- **Then** the maintenance note job (PR 6 of `design-maintenance.md`).

Every PR has browser tests for each state it adds, runs `reviewer` and `ui-reviewer`, and records its `frontend-design` pass in the PR body.

## Findings reference

Kept as given by the reviewers: Atkinson Hyperlegible Next and the named type roles, the stone palette with matching dark mode, `rounded-2xl` bordered cards, 44px targets, one primary action per card, the "Now" line, plain-word status, the shared `ListRow` and `ListCard`, one-tap Done with Undo.
