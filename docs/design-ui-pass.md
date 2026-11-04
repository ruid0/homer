# UI pass: foundation, navigation, lists, Schedule controls

Status: in progress (PR 1 built) · Owner: Igor Bondarenko · Date: 2026-11-03 · Source: owner request after slice 3, using the `homer-ui` and `frontend-design` skills (`homer-ui` wins where they disagree).

## 1. Definition (DEFINE)

**Problem.** The app works but looks like a stack of identical boxes. Reviewing every page at phone (390px) and tablet (1024px) width, in light and dark, showed:
1. The navigation wraps on a phone ("People" drops to a second row) and sits at the top, out of thumb reach. Home will make it five links.
2. Every page is the same rounded card in a grid, and each card has its own Edit or Rename button.
3. Groceries is a list to tick off, but it is shown as cards. People is just names with a Rename button.
4. There is no HOMER identity and no type scale: one default font, with headings, card titles and body a step apart.
5. Schedule spends three rows on controls before the first task on a phone.
6. The main device is a kitchen tablet read from a distance, but the body text is 16px and the lower half of the screen is empty.

**Direction (owner, 2026-11-03).** Stay calm and neutral, and spend the personality in one place: the wordmark and the type. Colour only for state. A bottom tab bar on phones. Start with the foundation, then navigation, lists and Schedule controls, and see how it goes. The dashboard (slice 4) is built after this, so it is designed once.

**Out of scope:** new features, api changes, the assistant.

**Done when**, for each PR: typecheck and tests pass, and screenshots at 390px and 1024px, light and dark, show the intended change, readable type, and no console errors.

## 2. PR 1: Foundation (built)

- **Colour tokens** in `apps/web/src/index.css`. Semantic names switch with the system theme, so components never repeat `dark:` pairs. The values are the same stone, amber and red as before: no new hues.

  | token | light | dark | used for |
  |---|---|---|---|
  | `surface` | stone-50 | stone-950 | the page |
  | `card` | white | stone-900 | cards, inputs, dialogs |
  | `ink` / `on-ink` | stone-900 / white | stone-50 / stone-900 | text and the primary button |
  | `muted` | stone-600 | stone-400 | secondary text |
  | `line` / `line-strong` | stone-200 / 300 | stone-800 / 700 | card edges / inputs |
  | `hover` | stone-100 | stone-800 | hover fill |
  | `warn` | amber-700 | amber-400 | running low |
  | `late` | red-700 | red-400 | overdue and errors |
  | `scrim` | black 50% | black 50% | behind dialogs |

- **A guard test** (`rawColors.test.ts`) fails if a component uses a raw palette colour, such as `text-stone-600` or `bg-white`, instead of a token, so the system cannot drift back.
- **Type scale by role:** `page` (1.75rem), `section` (1.25rem), `title` (1.125rem), `answer` (1.25rem, the "Runs out in 6 days" line), and `text-meta` (0.875rem) for small print.
- **Font:** Atkinson Hyperlegible Next (OFL), bundled through `@fontsource-variable/atkinson-hyperlegible-next` so nothing loads from a CDN. It was designed for legibility at a distance. The Latin file is about 34 KB. Its zero is slashed, which is part of that legibility.
- **Kitchen size:** at 1024px and wider the root font size is 112.5%. Everything is in `rem`, so type and the 44px touch targets grow together.
- **Wordmark:** the favicon mark and "HOMER" in the header, linking home.

## 3. PR 2: Navigation (planned)

A bottom tab bar on phones and a side rail on tablets. Five links with no wrapping, and the active page clear. Written in detail when the PR starts.

```
Phone                          Tablet
┌──────────────────┐           ┌────┬─────────────────────┐
│ HOMER            │           │ ⌂  │ Items      [Add]    │
│ Items    [Add]   │           │ ▤  │ ┌────┐ ┌────┐ ┌────┐│
│ ┌──────────────┐ │           │ ☑  │ │    │ │    │ │    ││
│ │              │ │           │ ▦  │ └────┘ └────┘ └────┘│
│ └──────────────┘ │           │ ☺  │                     │
├──────────────────┤           └────┴─────────────────────┘
│ Home Items Shop… │
└──────────────────┘
```

## 4. PR 3: Lists (planned)

Groceries becomes a tick-off checklist with large rows, and People a plain list. Items cards lose their per-card Edit button (editing moves to the name), so "Bought it" is the one primary action.

## 5. PR 4: Schedule controls (planned)

One compact row for Today/Week and Person, with Add event and Add task grouped together.

## 6. Risks

- **The zero.** A slashed zero reads as technical in times like "09:00". If it bothers the household, a different face is a one-line change in `index.css`.
- **Scaling at 1024px and wider** also applies to a laptop browser. That seems fine, and it is one line to change.
- **Wide diff, no behaviour change.** PR 1 touches many files, and the guard test and screenshots are what catch a slip.
