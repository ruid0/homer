import type { z } from "zod";
import type { repeatSchema } from "./schemas";

export type Repeat = z.infer<typeof repeatSchema>;

const MS_PER_DAY = 86_400_000;
// Sorts after every real time, so entries without a time come last.
const NO_TIME = "99:99";

const toDate = (date: string) => new Date(`${date}T00:00:00Z`);

const format = (date: Date) => date.toISOString().slice(0, 10);

const daysBetween = (from: string, to: string) =>
  Math.round((toDate(to).getTime() - toDate(from).getTime()) / MS_PER_DAY);

const monthsBetween = (from: string, to: string) => {
  const [a, b] = [toDate(from), toDate(to)];
  return (b.getUTCFullYear() - a.getUTCFullYear()) * 12 + b.getUTCMonth() - a.getUTCMonth();
};

const later = (a: string, b: string) => (a > b ? a : b);

export const addDays = (date: string, days: number): string =>
  format(new Date(toDate(date).getTime() + days * MS_PER_DAY));

export const weekdayOf = (date: string): number => toDate(date).getUTCDay();

// Every step is measured from `date`, not from the previous step, so a clamped month does not drift.
export const addMonths = (date: string, months: number): string => {
  const start = toDate(date);
  const [year, month] = [start.getUTCFullYear(), start.getUTCMonth() + months];
  const lastDay = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  return format(new Date(Date.UTC(year, month, Math.min(start.getUTCDate(), lastDay))));
};

// The first repeat after both the due date and today, so a task completed late is not born overdue.
export const nextDueDate = (due: string, repeat: Repeat, today: string): string => {
  const bar = later(due, today);
  if (repeat === "daily") return addDays(bar, 1);
  if (repeat === "weekly") return addDays(due, 7 * (Math.floor(daysBetween(due, bar) / 7) + 1));
  const from = (months: number): string => {
    const candidate = addMonths(due, months);
    return candidate > bar ? candidate : from(months + 1);
  };
  return from(Math.max(1, monthsBetween(due, bar)));
};

type TaskState = { dueDate: string | null; doneAt: string | null; removedAt: string | null };

export const isOverdue = ({ dueDate, doneAt, removedAt }: TaskState, today: string): boolean =>
  doneAt === null && removedAt === null && dueDate !== null && dueDate < today;

type ScheduleEntry = { date: string; time: string | null; overdue: boolean };

const compareText = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);

export const compareSchedule = (a: ScheduleEntry, b: ScheduleEntry): number => {
  if (a.overdue !== b.overdue) return a.overdue ? -1 : 1;
  return compareText(a.date, b.date) || compareText(a.time ?? NO_TIME, b.time ?? NO_TIME);
};
