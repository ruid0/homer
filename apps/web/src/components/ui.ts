const base =
  "min-h-11 rounded-lg px-4 text-base font-medium focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-stone-900 dark:focus-visible:outline-stone-100 disabled:opacity-50";

export const primaryButton = `${base} bg-stone-900 text-white hover:bg-stone-700 dark:bg-stone-100 dark:text-stone-900 dark:hover:bg-stone-300`;

export const secondaryButton = `${base} border border-stone-300 hover:bg-stone-100 dark:border-stone-700 dark:hover:bg-stone-800`;

export const inputClass =
  "min-h-11 w-full rounded-lg border border-stone-300 bg-white px-3 text-base dark:border-stone-700 dark:bg-stone-900";

export const toggleButton = (selected: boolean) =>
  selected
    ? `${base} border-2 border-stone-900 bg-stone-100 dark:border-stone-100 dark:bg-stone-800`
    : `${base} border border-stone-300 hover:bg-stone-100 dark:border-stone-700 dark:hover:bg-stone-800`;
