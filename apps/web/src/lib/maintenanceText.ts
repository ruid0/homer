import { addDays } from "@homer/shared";
import { copy } from "../copy";

type Words = { lastDoneOn: string | null; status: "overdue" | "due" | "soon" | "later"; daysUntil: number; dueOn: string };

// Past this many days a date is told in months, so "Due 17 Oct" is never mistaken for last month's.
const DATE_UNTIL_DAYS = 60;
const DAYS_PER_MONTH = 30.4375;
const MONTHS_PER_YEAR = 12;

const asDate = (date: string) => new Date(`${date}T00:00:00Z`);

// Month names come from the same copy as the rest of the app, so every screen spells a date the same way.
const monthName = (date: Date) => copy.schedule.months[date.getUTCMonth()] ?? "";

export const shortDate = (date: string): string => `${asDate(date).getUTCDate()} ${monthName(asDate(date))}`;

export const longDate = (date: string): string => `${shortDate(date)} ${asDate(date).getUTCFullYear()}`;

// The year shows only when it is not this year.
const pastDate = (date: string, today: string): string => (date.slice(0, 4) === today.slice(0, 4) ? shortDate(date) : longDate(date));

const laterWords = ({ daysUntil, dueOn }: Pick<Words, "daysUntil" | "dueOn">): string => {
  if (daysUntil <= DATE_UNTIL_DAYS) return copy.maintenance.dueOn(shortDate(dueOn));
  const months = Math.round(daysUntil / DAYS_PER_MONTH);
  return months < MONTHS_PER_YEAR ? copy.maintenance.dueInMonths(months) : copy.maintenance.dueOn(longDate(dueOn));
};

// The one-line answer on a row: in words, so colour is never the only signal.
export const dueWords = ({ lastDoneOn, status, daysUntil, dueOn }: Words): string => {
  if (lastDoneOn === null && (status === "due" || status === "overdue")) return copy.maintenance.neverDone;
  if (status === "overdue") return copy.maintenance.overdueDays(-daysUntil);
  if (status === "due") return copy.maintenance.dueToday;
  if (status === "soon") return daysUntil === 1 ? copy.maintenance.dueTomorrow : copy.maintenance.dueInDays(daysUntil);
  return laterWords({ daysUntil, dueOn });
};

export const needsDoing = (status: Words["status"]): boolean => status !== "later";

type Details = { every: number; unit: "weeks" | "months" | "years"; lastDoneOn: string | null; dueOn: string; daysUntil: number };

export const rowDetails = ({ every, unit, lastDoneOn, dueOn, daysUntil }: Details): string[] => [
  copy.maintenance.cycle(every, unit),
  // Today is not passed in: it is the due date minus the days until it.
  ...(lastDoneOn === null ? [] : [copy.maintenance.lastDone(pastDate(lastDoneOn, addDays(dueOn, -daysUntil)))]),
];
