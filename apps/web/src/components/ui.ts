const base =
  "min-h-11 rounded-lg px-4 text-base font-medium focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink disabled:opacity-50";

export const primaryButton = `${base} bg-primary text-on-primary hover:opacity-85`;

export const secondaryButton = `${base} border border-line-strong hover:bg-hover`;

export const inputClass = "min-h-11 w-full rounded-lg border border-line-strong bg-card px-3 text-base";

export const toggleButton = (selected: boolean) =>
  selected ? `${base} border-2 border-ink bg-hover` : `${base} border border-line-strong hover:bg-hover`;

export const quietButton =
  "min-h-11 rounded-lg px-4 text-base font-medium text-muted hover:bg-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink disabled:opacity-50";
