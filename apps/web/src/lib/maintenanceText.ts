import { copy } from "../copy";

type Words = { lastDoneOn: string | null; status: "overdue" | "due" | "soon" | "later"; daysUntil: number; dueOn: string };

const SHORT_DATE = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", timeZone: "UTC" });
const LONG_DATE = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });

const asDate = (date: string) => new Date(`${date}T00:00:00Z`);

export const shortDate = (date: string): string => SHORT_DATE.format(asDate(date));

export const longDate = (date: string): string => LONG_DATE.format(asDate(date));

// The one-line answer on a row: in words, so colour is never the only signal.
export const dueWords = ({ lastDoneOn, status, daysUntil, dueOn }: Words): string => {
  if (lastDoneOn === null && (status === "due" || status === "overdue")) return copy.maintenance.neverDone;
  if (status === "overdue") return copy.maintenance.overdueDays(-daysUntil);
  if (status === "due") return copy.maintenance.dueToday;
  if (status === "soon") return daysUntil === 1 ? copy.maintenance.dueTomorrow : copy.maintenance.dueInDays(daysUntil);
  return copy.maintenance.dueOn(shortDate(dueOn));
};

export const needsDoing = (status: Words["status"]): boolean => status !== "later";

export const rowDetails = ({ every, unit, lastDoneOn }: { every: number; unit: "weeks" | "months" | "years"; lastDoneOn: string | null }): string[] => [
  copy.maintenance.cycle(every, unit),
  ...(lastDoneOn === null ? [] : [copy.maintenance.lastDone(shortDate(lastDoneOn))]),
];
