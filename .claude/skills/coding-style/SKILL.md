---
name: coding-style
description: The owner's code style for this repo — functional and non-mutating, arrow functions, comments only for the ambiguous, ~600 LOC file ceiling, and UI labels that read like variable names. Use when writing, editing or reviewing any TypeScript, React or UI copy in this project.
---

# Coding

This skill is a reference for the owner's code style. It is not a general TypeScript or React style guide, and it does not cover every case. Use it when writing, editing or reviewing any TypeScript, React or UI copy in this project.

## 1. Functional, not mutating

Pure functions and immutable data. `const` over `let`, spread over assign, `map`/`filter`/`reduce`
over a loop that mutates.

```ts
// avoid
const totals: Record<string, number> = {};
for (const line of lines) totals[line.category] = (totals[line.category] ?? 0) + line.cents;

// prefer
const totals = lines.reduce<Record<string, number>>(
  (acc, line) => ({ ...acc, [line.category]: (acc[line.category] ?? 0) + line.cents }),
  {},
);
```

Local mutation inside a function is fine when it is the honest shape and stays contained. Shared
mutable state is not. When a loop is genuinely clearer, use it and say why in a short comment.

## 2. About 600 lines is the ceiling for a file

A file near or over that is **split by responsibility** into several files, not trimmed to fit. The
limit is only the signal that the split is due. Check with `wc -l` before adding to a large file.

## 3. Functions should be small and focused

Each function should do one thing, and do it well. If a function is long enough to need a comment, it is probably doing too much. Split it into smaller functions with descriptive names. One function should fit on a single screen without scrolling, and ideally be no more than 20-30 lines. If a function is longer than that, consider breaking it down into helper functions.

## 4. Comments only for the ambiguous

If a function needs a comment to be understood, rewrite it: better names, smaller pieces. Keep a
comment only where the ambiguity cannot be removed (a deliberate trade-off, a quirk of the outside
world, the reason for a non-obvious choice) and make it say *why*. A comment that restates the code
is noise.

```ts
// avoid: restates the code
// add the tax to the total
const gross = net + tax;

// keep: the reason is not visible in the code
// Till rounds each line, not the sum, so rounding here would disagree with the receipt.
const gross = lines.reduce((sum, line) => sum + line.cents, 0);
```

## 5. Arrow functions over `function`

`const name = () => {}` is the default. Use a `function` declaration only when it must be: hoisting
a helper used above its definition, a generator, or `this` binding. Say which in a short comment.

## 6. UI names read like variable names

Every label, button, heading and menu item is human-friendly **and** shaped like an identifier:
plain, a noun or verb phrase a person would say, in the domain's own words. No jargon, no
`is_active`, no shouting.

| Avoid               | Prefer          |
| ------------------- | --------------- |
| `IS_RECURRING`      | Repeats monthly |
| `Submit Txn Record` | Save receipt    |
| `Cat. Mgmt.`        | Categories      |

## 7. User-facing text lives in copy files

Every label, heading, button, placeholder, confirm prompt and error message is a named constant in a copy
file (`apps/web/src/copy.ts`, `apps/api/src/messages.ts`, `packages/shared/src/copy.ts`), never an inline
literal in a component, router or schema. A string that includes a value is a small function.

```ts
// avoid
<button>Remove item</button>
throw new TRPCError({ code: "CONFLICT", message: `${name} is already tracked. Edit that item instead.` });

// prefer
<button>{copy.items.removeItem}</button>
throw new TRPCError({ code: "CONFLICT", message: messages.nameTaken(name) });
```
