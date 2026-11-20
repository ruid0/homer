# Stock page: Items and Groceries as one page. Definition, plan and design

Status: In progress (the page, the redirects and the nav are built in one PR) · Owner: Igor Bondarenko · Last updated: 2026-11-20 · Source: the owner's question "why don't we connect them?", the approved mock (`scratchpad/stock-mock.html`). Replaces the two pages of `design-slice-1-items.md` and `design-slice-2-groceries.md`; their data and rules are unchanged.

## 1. Definition

**Problem.** Items (what we have) and Groceries (what to buy) were two pages and two tabs for one question: "is salt low, and is it on the list?". A low item appeared twice, and the phone bar had seven tabs sharing the width.

**In scope**
- One page, "Stock" (`/stock`), with two views behind a switch: **To buy** (the grocery list, first) and **Everything** (every tracked item).
- A tracked item that is not on the list gets "Add to list" on its row. One that is on the list says "On the grocery list".
- One tab in the nav instead of two, six in all.
- `/groceries` and `/items` redirect to `/stock` and `/stock?view=everything`, so a home-screen shortcut or an old note still works. The "added to the grocery list" note now opens `/stock`.

**Out of scope**
- Any change to the api, the data or the assistant's tools. "Add to list" is the existing `groceries.add` by name.
- A count on the nav tab for how many things are to buy. Left as an open question.

**Done when**
- The bottom bar shows Stock and no Items or Groceries, and every label fits at 360px.
- Switching views changes the address, and Back returns to the other view.
- A free-text entry ("charcoal") is in To buy only. A tracked item can be added to the list from Everything.
- The old addresses open the right view.

## 2. Design

The view is the `view` query parameter (`everything`, otherwise To buy), so a link or Back lands on the same view. The switch is two joined buttons with `aria-pressed`, 44px tall, with the count in each label once its list has loaded. Each view keeps its own page logic (`StockBuy`, `StockEverything`), moved from the two old pages unchanged apart from the header; the page owns the title and the switch.

Rows in Everything keep Edit and "Bought it" (restocking something that is not on the list, such as a bulk buy, still has to be possible), and a row that is not on the list also gets a quiet "Add to list". A row that is on the list shows an "On the grocery list" chip beside its status, so listed rows stand out when scanning. The pressed button of the switch is the filled primary colour, so the choice is not only a thin border.

UI pass: `homer-ui` (44px targets, `control` edges, tokens only, copy in `copy.ts`, errors as red toasts) and `frontend-design` (nothing new: the page is a list in the existing style, and the aim is fewer places, not a new look).

## 3. Open questions

- The tab name. "Stock" fits the bar; "Pantry" would be warmer but is wrong for soap and filters.
- A count on the tab, like Upkeep's, for how many things are to buy.
