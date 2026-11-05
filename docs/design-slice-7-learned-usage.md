# Slice 7: Learned usage

Status: built (PRs 1 and 2) · Owner: Igor Bondarenko · Date: 2026-11-05 · Source: PRD §4.1, §9 (open question 1).

## 1. Definition

HOMER starts from the usage the person enters ("one bag lasts 30 days") and learns from the restocks it records. Done when salt entered as 30 days per bag, restocked every 20 days, switches to a learned estimate near 20 days and says it is learned (PRD §4.1).

**Out:** tracking consumption inside the app, receipts and photos.

## 2. Decisions (owner, 2026-11-05)

- **Switch-over:** at least 3 restocks spread over at least 14 days. The learned number replaces the entered one outright, with no blending.
- **Window:** only the 6 most recent restocks count, so a change in habits shows.
- **One trip:** restocks within a day of a trip's first restock are one trip, with their amounts added. A restock a day or more after the trip's start begins a new trip, so a chain of taps cannot stretch one trip. Zero or negative amounts and unreadable dates are skipped.
- **Editing the entered number** clears the learned estimate and learning starts again from that moment (PR 2, one small column).
- **Shown as** "Learned from N restocks" (PR 2).

## 3. The calculation (`packages/shared/src/learn.ts`, pure)

`learnDaysPerUnit(restocks)` takes the latest 6 trips. Days per unit = the days from the first trip to the last, divided by the amount bought on every trip except the last (that stock is not used up yet). It answers `null` with fewer than 3 trips, a span under 14 days, nothing bought before the last trip, or a result over 3650 days. Property tests: it does not depend on input order, it is always positive and finite when it answers, and buying twice as much over the same time halves it.

## 4. Work order

1. **The calculation** in shared, with tests. Built.
2. **Wiring (built):** `inventory.restock` stores the result in `days_per_unit_learned` (and clears it when there is not enough history), Undo of a restock keeps it right (the journal already restores the item row), editing the entered number resets learning, and the Items row shows "Learned from N restocks". Router tests, and a check in the running app.

## 5. How it is wired

- `applyRestock` (used by both the Items "Bought it" and the grocery list's "Bought it") records the restock and then calls `relearn`, which stores the result of `learnDaysPerUnit` in `days_per_unit_learned`, or clears it when there is not enough history.
- Items have a new nullable `learning_since` column (migration 0008). Learning only looks at restocks from that time on. It is set when the entered number is changed by hand, together with clearing the learned estimate. Saving an item without changing that number leaves both alone.
- Undo of a restock goes through the journal, which restores the item row and removes the restock row, so the learned estimate goes back with it (tested).
- `inventory.list` returns `learnedFrom` (the number of trips the estimate rests on). The Items row shows "Learned from N restocks", or "Entered by hand".
- Checked in the running app (scratch copy): salt entered as 30 days with restocks 60, 40 and 20 days ago plus one now shows "Learned from 4 restocks" and 40 days for 2 bags; editing the number to 25 shows "Entered by hand" and 50 days.
