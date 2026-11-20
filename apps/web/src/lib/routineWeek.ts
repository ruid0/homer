import { MAX_ROUTINE_WEEKS_BACK, addDays, weekDates } from "@homer/shared";
import { copy } from "../copy";

export const mondayOf = (date: string): string => weekDates(date)[0]!;

// The oldest week whose days can still be changed (the api refuses earlier days).
export const oldestWeek = (today: string): string => addDays(mondayOf(today), -7 * MAX_ROUTINE_WEEKS_BACK);

export const canGoEarlier = (weekStart: string, today: string): boolean => weekStart > oldestWeek(today);

export const canGoLater = (weekStart: string, today: string): boolean => weekStart < mondayOf(today);

export const isFuture = (day: string, today: string): boolean => day > today;

export const weekdayShort = (day: string): string =>
  copy.routine.weekdaysShort[(new Date(`${day}T00:00:00Z`).getUTCDay() + 6) % 7] ?? "";

export const dayOfMonth = (day: string): number => Number(day.slice(8));

const rangeName = (day: string): string => {
  const parsed = new Date(`${day}T00:00:00Z`);
  return `${parsed.getUTCDate()} ${copy.schedule.months[parsed.getUTCMonth()] ?? ""}`;
};

export const weekRange = (days: string[]): string => copy.routine.week(rangeName(days[0]!), rangeName(days[6]!));

export const dayLabel = (day: string): string => `${weekdayShort(day)} ${dayOfMonth(day)}`;

// A tap on a day in the strip adds one, and from done goes back to none, so one control covers every target.
export const cycleCount = (done: number, target: number): number => (done >= target ? 0 : done + 1);

// A tap on the nth of today's circles: on a ticked one it takes that tick and every later one away, on an empty one it
// ticks up to it.
export const tickCount = (done: number, position: number): number => (position < done ? position : position + 1);

export type DayState = "done" | "partial" | "none";

export const dayState = (done: number, target: number): DayState =>
  done >= target ? "done" : done > 0 ? "partial" : "none";

export const weekdayInitial = (day: string): string => weekdayShort(day).slice(0, 1);
