// Joins class names, dropping the ones that are off, so a long list can sit on several lines.
export const cx = (...parts: (string | false | null | undefined)[]) => parts.filter(Boolean).join(" ");

const base = cx(
  "min-h-11 rounded-lg px-4 text-base font-medium transition-transform active:scale-[0.97]",
  "disabled:active:scale-100 focus-visible:outline-2 focus-visible:outline-offset-2",
  "focus-visible:outline-ink disabled:opacity-50",
);

export const primaryButton = `${base} bg-primary text-on-primary hover:opacity-85`;

export const secondaryButton = `${base} border border-control hover:bg-hover`;

export const inputClass = "h-11 w-full min-w-0 max-w-full rounded-lg border border-control bg-card px-3 text-base";

export const toggleButton = (selected: boolean) =>
  selected ? `${base} border-2 border-ink bg-hover` : `${base} border border-control hover:bg-hover`;

export const quietButton = cx(
  "min-h-11 rounded-lg px-4 text-base font-medium text-muted transition-transform",
  "hover:bg-hover active:scale-[0.97] disabled:active:scale-100 focus-visible:outline-2",
  "focus-visible:outline-offset-2 focus-visible:outline-ink disabled:opacity-50",
);

// The same answer inside a compact Row, where it shares the muted line with the details: colour and weight, no size.
export const rowStatus = (level: "late" | "warn") =>
  ({ late: "font-semibold text-late", warn: "font-medium text-warn" })[level];

// The action in a compact Row: one word in the right-hand column, narrow enough to leave the title room on a phone.
export const rowAction = "min-w-20 px-4";

// Overdue rows only: a bar in the card's left padding, so late is not told by colour alone and no text moves.
export const lateBar =
  "relative before:absolute before:-left-3 before:inset-y-3 before:w-1 before:rounded-full before:bg-late";
