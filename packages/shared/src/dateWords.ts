import { nextWeekday } from "./calendar";
import { addDays } from "./schedule";

const weekdayNames = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];

// "fri", "friday", "on friday", "this friday". "next friday" is left out on purpose: people mean two different days by it.
const weekdayOfWord = (word: string): number | null => {
  const name = word.replace(/^((on|this)\s+)+/, "").replace(/[.,!]+$/, "");
  const index = weekdayNames.findIndex((full) => full === name || (name.length >= 3 && full.startsWith(name)));
  return index === -1 ? null : index;
};

// A day said in words becomes its date. Anything else comes back unchanged, so the schema still rejects a bad one.
export const resolveDateWord = (value: string, today: string): string => {
  const word = value.trim().toLowerCase().replace(/[.,!]+$/, "");
  if (word === "today") return today;
  if (word === "tomorrow") return addDays(today, 1);
  const weekday = weekdayOfWord(word);
  return weekday === null ? value : nextWeekday(today, weekday);
};

// Fields that hold a day. Pinned by a test in tools.test.ts, because the list is global to every tool.
export const dateFields: readonly string[] = ["dueDate", "date", "from", "to"];

const readObject = (args: unknown): unknown => {
  if (typeof args !== "string") return args;
  try {
    return JSON.parse(args);
  } catch {
    return args;
  }
};

// Models are unreliable at counting days, so they say "friday" and code works out the date.
export const resolveToolDates = (args: unknown, today: string): unknown => {
  const value = readObject(args);
  if (value === null || typeof value !== "object" || Array.isArray(value)) return value;
  return Object.fromEntries(
    Object.entries(value).map(([key, field]) => [
      key,
      dateFields.includes(key) && typeof field === "string" ? resolveDateWord(field, today) : field,
    ]),
  );
};
