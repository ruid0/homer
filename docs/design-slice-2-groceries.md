# Slice 2: Grocery list. Definition, technical plan and system design

Status: owner questions answered, ready to build · Owner: Igor Bondarenko · Date: 2026-11-02 · Source: PRD §3 goal 2, §4.1, §6, §8 (slice 2). Builds on `docs/design-slice-1-items.md`.

## 1. Definition (DEFINE)

**Problem.** Food and supplies run out at the worst moment. Slice 1 shows which items are running low, but someone still has to remember to write them down. The grocery list should build itself from what's low, and anyone should be able to add anything else.

**For whom.** Everyone in the household, mostly on a phone in the shop or a tablet in the kitchen.

**In scope**
- A grocery list of open entries, visible on its own screen.
- **Auto-add:** an item that is running low or out is put on the list without anyone asking.
- **Manual add:** anyone can add an entry for a tracked item or for free text ("charcoal", "birthday candles").
- **Bought it** on an entry: for a tracked item it asks for the quantity (default: the usual amount), restocks the item and takes the entry off the list. For a free-text entry it just takes it off.
- **Out of it** (already on the Items page) now also puts the item on the list.
- **Remove** an entry that was added by mistake.
- Navigation between Items and Groceries.

**Out of scope**
- People and "added by" names (slice 3). Entries record only `auto` or `manual` for now.
- Dashboard (slice 4), assistant tools `list_groceries`, `add_to_groceries`, `mark_bought` (slice 5; the router built here is what they will call).
- Time-based depletion and the daily job, learned estimates (slice 7), receipts, store sections, prices.
- Undo for "Bought it" (slice 5 adds Undo for assistant actions).

**Done when** (PRD §4.1)
- Milk at 1 litre lasting 2 days per litre is on the grocery list without anyone adding it.
- Marking milk "Bought it" with 4 litres takes it off the list and its days remaining become 10.
- Marking salt "Out of it" puts it on the list, even if salt has no usage estimate.
- A person can add "charcoal" by hand and tick it off later.

### Decisions (owner, 2026-11-02)
1. **Edited out of "low".** An auto-added entry comes off the list when an edit, such as a longer estimate or a bigger quantity, means the item is no longer low. Only auto entries are removed; manual entries stay until bought or removed.
2. **Adding something already listed.** It reuses the existing entry and updates its quantity if one was given. There is no second line.
3. **Staying fresh.** The list refetches when the app regains focus. The proposed 30-second timer was not confirmed, so it is not part of this design: a tablet left open and in focus on this page will not update by itself until someone touches it or reloads. A timer is a one-line addition if wanted later.
4. **Removed rows.** Add a nullable `removed_at` column on `grocery_entries`, and never delete rows (same rule as item history).
5. **Free text that matches an item.** The server links it to the tracked item (case-insensitive name match), so Bought it can restock it.

## 2. System overview

```
 Items page ──► inventory router ──┐                         ┌─► grocery_entries
 (create, edit, restock,           ├─► syncGrocery(tx, item) ┤
  Out of it, remove, restore)      │   (one function,        └─► items / restocks
 Groceries page ─► groceries router┘    runs in the same
 (list, add, Bought it, remove)         transaction)
```

- **One rule, one place.** "Should this item be on the list?" is a pure function in `packages/shared/src/domain.ts`: `needsRestock`. A small server function applies it after every change to an item. Slice 7's learned estimates and the later daily depletion job call the same function.
- **Same transaction.** An item change and its list change commit together or not at all.
- **Computed values stay computed.** The list stores what was decided, never days remaining.

## 3. Data model

New table `grocery_entries` (migration `0001`).

| column | type | notes |
|---|---|---|
| id | integer pk autoincrement | |
| item_id | integer fk → items.id, null, no cascade | null for free text |
| text | text not null | what the list shows; for a tracked item, the item name at the time |
| quantity | real null, > 0 | amount to buy; null when unknown |
| added_by | text not null | `auto` or `manual` (slice 3 may replace this with a person) |
| created_at | text (ISO-8601 UTC) | |
| bought_at | text null | set by Bought it |
| removed_at | text null | set by Remove, or when an auto entry is no longer needed |

An entry is **open** when `bought_at` and `removed_at` are both null.

Index: `grocery_one_open_per_item` is a unique index on `item_id` where `item_id` is not null and the entry is open. It makes "no duplicate open entry per item" a database guarantee, so two tablets adding at once cannot create two lines.

This adds `removed_at` and fixes the values of `added_by` compared with PRD §6. The PRD will be updated when this is built.

## 4. Shared package (`packages/shared/src`)

- `domain.ts`
  - `needsRestock({ quantity, daysRemaining, lowThresholdDays })` is true when `quantity === 0` or `isRunningLow(daysRemaining, lowThresholdDays)`. The `quantity === 0` clause is what puts a no-estimate item on the list when it is out.
  - `groceryAction(item, openEntry)` returns `"add" | "remove" | "keep"`: add when needed and nothing is open, remove when not needed and the open entry is `auto`, otherwise keep. Pure, so the whole decision table is property-tested.
- `schemas.ts`
  - `groceryAddInputSchema`: either `{ itemId, quantity? }` or `{ text, quantity? }` (a union). Text is trimmed and non-empty.
  - `groceryBoughtInputSchema`: `{ id, quantity? }`, where quantity is required by the server only for tracked entries.
  - `groceryEntrySchema` for the row.

## 5. API (`apps/api/src`)

- `db/schema.ts`: add `groceryEntries`; generate migration `0001`.
- `groceries/sync.ts`
  - `syncGrocery(tx, itemId)`: loads the item and its open entry, asks `groceryAction`, then inserts (quantity = last restock, or null) or sets `removed_at`.
  - `closeOpenEntry(tx, itemId)`: sets `bought_at` on the item's open entry. Used by restock.
  - `removeOpenEntries(tx, itemId)`: used by archive.
- `routers/inventory.ts` (changed): `create`, `update`, `markOut` and `restore` now run in a transaction that ends with `syncGrocery`. `restock` ends with `closeOpenEntry` and then `syncGrocery`. `archive` calls `removeOpenEntries`. The restock write is extracted into `applyRestock(tx, itemId, quantity)` so the grocery router reuses it.
- `routers/groceries.ts` (new)
  - `list`: open entries, with the item's unit and usual restock for tracked ones, ordered with auto entries first and then oldest first.
  - `add`: for `itemId`, reuses an open entry or inserts; for `text`, links to an active item with that name, otherwise inserts free text.
  - `markBought({ id, quantity? })`: tracked entry runs `applyRestock` and sets `bought_at` in one transaction (quantity required and above 0); free-text entry only sets `bought_at`. Already-closed or unknown entries fail with NOT_FOUND and an actionable message.
  - `remove({ id })`: sets `removed_at`.
- `routers/index.ts`: mount `groceries`.

## 6. Web (`apps/web/src`)

- **Navigation:** a header with "Items" and "Groceries", at least 44px tall, on every page. `App.tsx` gets a second route.
- **Groceries page** (`pages/GroceriesPage.tsx`)
  - Add field at the top: one text input and "Add". It suggests tracked item names as you type.
  - A card per entry: the text, the quantity if known (with the unit), and a small "Added automatically" or "Added by hand" note. One primary action, "Bought it". Secondary: "Remove".
  - "Bought it" on a tracked entry opens the existing `RestockDialog` (default: entry quantity, else usual restock, else 1). On a free-text entry it acts immediately.
  - Empty state: "Nothing to buy. Items that run low show up here."
  - Refetch when the app regains focus (TanStack Query's `refetchOnWindowFocus`).
- **Items page:** a card whose item is on the list shows "On the grocery list".
- Rules: `homer-ui` and `coding-style`; components stay small, files under about 600 lines.

## 7. Testing (red-green-refactor)

- **Domain, with fast-check:** `needsRestock` is true when out regardless of estimate; false for no-estimate stock above 0; flips exactly at the threshold; `groceryAction` never removes a manual entry and never adds a second open entry.
- **Sync and routers, on in-memory SQLite:**
  - milk at 1 litre × 2 days is on the list right after `create`; restocking 4 litres closes the entry and days become 10.
  - `markOut` on a no-estimate item adds it; `markOut` twice leaves one entry.
  - editing an item out of low removes its auto entry but not a manual one.
  - archive removes open entries; restore of an item that is low puts it back.
  - `add` is idempotent for a tracked item and links matching text to the item.
  - `markBought` rolls back completely if the restock fails (no half-bought entry).
  - two open entries for one item are rejected by the database.
- **UI:** checked in the running app with the Playwright MCP: add by hand, auto-add after Out of it, Bought it with the default and a custom quantity, Remove, empty state, phone and tablet width, dark mode, refresh while another tab changes the list.

## 8. Work order (one coherent commit each, on its own branch and PR)

0. *(Optional, separate PR)* Fix issue #3, background scroll while a dialog is open, since the Groceries page opens the same dialogs.
1. Shared: `needsRestock`, `groceryAction`, schemas, with property tests.
2. DB: `grocery_entries` table and migration.
3. Sync function and inventory integration, with tests.
4. Groceries router with tests.
5. Web: navigation, Groceries page, "On the grocery list" note.
6. Docs: update PRD §6 (columns), CLAUDE.md status, and this document.

Then VERIFY, REVIEW (the `reviewer` subagent) and SHIP.

## 9. Decisions and risks

- **Auto entries are decided at change time**, not on a timer, because days remaining only changes when an item is edited. When the daily depletion job arrives it will call `syncGrocery` for each item, with no change to this design.
- **Restocking outside the list** (the "Bought it" button on an Items card) also closes the open entry, so the list never keeps something that was bought.
- **Auto entry quantity** is the last restock quantity, or empty. It is only a default, and the person confirms it in the dialog.
- **Name matching is ASCII-only**, as in slice 1.
- **Risk: two tablets, one tap.** Both tick "Bought it" on the same entry. The second gets "That entry is already off the list. Refresh the list." and the item is restocked once.
- **Risk: stale tablet.** Mitigated only by refetching on focus. A tablet that stays in focus on this page will not update until someone touches it or reloads (see decision 3).
- **No undo for Bought it** in this slice. It is a deliberate gap until slice 5.
