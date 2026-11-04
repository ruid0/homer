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

- **Colour tokens** in `apps/web/src/index.css`. Semantic names switch with the system theme, so components never repeat `dark:` pairs. Light uses the Tailwind stone, amber and red palette. Dark is **Charcoal**, chosen by the owner (2026-11-03) from three options because the first dark palette was too black, too white and cold: a soft warm grey, off-white text, and a calmer sand-grey primary button.

  | token | light | dark (Charcoal) | used for |
  |---|---|---|---|
  | `surface` | stone-50 | `#1f1d1b` | the page |
  | `card` | white | `#2a2725` | cards, inputs, dialogs |
  | `ink` | stone-900 | `#e9e5e0` | text |
  | `primary` / `on-primary` | stone-900 / white | `#d8d2ca` / `#1f1d1b` | the primary button and the active nav link |
  | `muted` | stone-600 | `#aaa59d` | secondary text |
  | `line` / `line-strong` | stone-200 / 300 | `#3a3633` / `#4f4a45` | card edges / inputs |
  | `hover` | stone-100 | `#332f2c` | hover fill |
  | `warn` | amber-700 | `#e6b04f` | running low |
  | `late` | red-700 | `#ef8c80` | overdue and errors |
  | `scrim` | black 50% | black 50% | behind dialogs |

  Contrast on the dark card: text 11.8, secondary text 6.1, running low 7.6, overdue 6.2, and the button label on the button 11.2 (4.5 is the minimum for text). Input edges are subtle in both themes, as before.

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

## 6. What replaced PRs 2 to 4

The timeline rethink (`docs/design-slice-4-dashboard.md`) superseded the planned navigation, lists and Schedule controls PRs. What shipped instead: a left rail and a bottom bar, a 1920px breakpoint, the Home page, and compact rows in one card on Schedule, Groceries, Items and People (shared `ListRow` and `ListCard`). In those rows every button is secondary or quiet, and the page-level Add button is the one primary action. This replaces the earlier "Bought it is the primary action" idea, because a list of rows with a black button each is too heavy. Names are plain text rather than headings, so heading navigation is not offered on those pages.

## 7. Risks

- **The zero.** A slashed zero reads as technical in times like "09:00". If it bothers the household, a different face is a one-line change in `index.css`.
- **Scaling at 1024px and wider** also applies to a laptop browser. That seems fine, and it is one line to change.
- **Wide diff, no behaviour change.** PR 1 touches many files, and the guard test and screenshots are what catch a slip.
