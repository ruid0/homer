import { addDays, addMonths, daysBetween } from "./schedule";

export const maintenanceUnitValues = ["weeks", "months", "years"] as const;

export type MaintenanceUnit = (typeof maintenanceUnitValues)[number];

export const SOON_DAYS = 7;

const MONTHS_PER_YEAR = 12;
const DAYS_PER_WEEK = 7;

type Basis = { lastDoneOn: string | null; createdOn: string };

// The interval is counted from the day it was last done, not from a fixed calendar slot.
// Never done: the day it was added, a fixed date, so it does not move from day to day.
export const dueOn = ({ lastDoneOn, createdOn }: Basis, every: number, unit: MaintenanceUnit): string => {
  if (lastDoneOn === null) return createdOn;
  if (unit === "weeks") return addDays(lastDoneOn, DAYS_PER_WEEK * every);
  return addMonths(lastDoneOn, unit === "months" ? every : MONTHS_PER_YEAR * every);
};

export type MaintenanceStatus = "overdue" | "due" | "soon" | "later";

export const maintenanceStatus = (dueDate: string, today: string): { status: MaintenanceStatus; daysUntil: number } => {
  const daysUntil = daysBetween(today, dueDate);
  if (daysUntil < 0) return { status: "overdue", daysUntil };
  if (daysUntil === 0) return { status: "due", daysUntil };
  return { status: daysUntil <= SOON_DAYS ? "soon" : "later", daysUntil };
};

// Dates sort as text because they are YYYY-MM-DD. Names sort the way people read them, so "apple" is not after "Zinc".
const compareText = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);

// The most overdue first (an earlier due date sorts first), then by name.
export const compareMaintenance = (a: { name: string; dueOn: string }, b: { name: string; dueOn: string }): number =>
  compareText(a.dueOn, b.dueOn) || a.name.localeCompare(b.name);
