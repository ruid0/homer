---
name: homer-ui
description: HOMER's visual and interaction rules. Use when building or changing any page or component in apps/web.
---
# HOMER UI

HOMER is glanced at in a kitchen, often on a tablet, by people who are busy.
Design for a quick read, not exploration.

## Principles
- Urgency first. Things running out or overdue sit at the top, in plain words
  ("Salt runs out in 3 days" -> Check if true, confirm), not as colors or icons alone.
- Big touch targets (44px minimum). Assume wet or messy hands.
- One primary action per card: "Bought it", "Done", "Snooze a week".
- Calm by default. Color only for state: overdue, due soon, fine.
- Responsive and mobile and tablet first. Use a single column on small screens, and a grid on larger ones.

## Copy
Follow the UI naming and copy-file rules (§6, §7) in the coding-style skill. Errors say what happened and
what to do; no apologies.

## Stack
Tailwind only, no component library. Respect prefers-reduced-motion and
dark mode. Every interactive element is keyboard reachable.
