const base =
  "min-h-11 rounded-lg px-4 text-base font-medium transition-transform active:scale-[0.97] disabled:active:scale-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink disabled:opacity-50";

export const primaryButton = `${base} bg-primary text-on-primary hover:opacity-85`;

export const secondaryButton = `${base} border border-control hover:bg-hover`;

export const inputClass = "h-11 w-full min-w-0 max-w-full rounded-lg border border-control bg-card px-3 text-base";

export const toggleButton = (selected: boolean) =>
  selected ? `${base} border-2 border-ink bg-hover` : `${base} border border-control hover:bg-hover`;

export const quietButton =
  "min-h-11 rounded-lg px-4 text-base font-medium text-muted transition-transform hover:bg-hover active:scale-[0.97] disabled:active:scale-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink disabled:opacity-50";

// The one-line answer on a row ("Due tomorrow", "Runs out in 2 days"): the same size everywhere, so urgency reads the same on every screen.
// Late is the heavier and darker of the two, so the two do not differ by hue alone.
export const statusClass = (level: "late" | "warn" | "plain") =>
  ({ late: "text-title font-semibold text-late", warn: "text-title font-medium text-warn", plain: "text-title font-medium" })[level];

// Done and Bought share one size, and a row without one (an event) keeps the space, so Edit lines up down a list.
export const doneSize = "min-w-26 px-6";

// Overdue rows only: a bar in the card's left padding, so late is not told by colour alone and no text moves.
export const lateBar = "relative before:absolute before:-left-3 before:inset-y-3 before:w-1 before:rounded-full before:bg-late";
