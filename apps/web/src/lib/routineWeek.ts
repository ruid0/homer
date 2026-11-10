import { MAX_ROUTINE_WEEKS_BACK, addDays, weekDates } from "@homer/shared";
import { copy } from "../copy";

export const mondayOf = (date: string): string => weekDates(date)[0]!;

// The oldest week whose days can still be changed (the api refuses earlier days).
export const oldestWeek = (today: string): string => addDays(mondayOf(today), -7 * MAX_ROUTINE_WEEKS_BACK);

export const canGoEarlier = (weekStart: string, today: string): boolean => weekStart > oldestWeek(today);

export const canGoLater = (weekStart: string, today: string): boolean => weekStart < mondayOf(today);

export const isFuture = (day: string, today: string): boolean => day > today;

export const weekdayShort = (day: string): string => copy.routine.weekdaysShort[(new Date(`${day}T00:00:00Z`).getUTCDay() + 6) % 7] ?? "";

export const dayOfMonth = (day: string): number => Number(day.slice(8));

const rangeName = (day: string): string => {
  const parsed = new Date(`${day}T00:00:00Z`);
  return `${parsed.getUTCDate()} ${copy.schedule.months[parsed.getUTCMonth()] ?? ""}`;
};

export const weekRange = (days: string[]): string => copy.routine.week(rangeName(days[0]!), rangeName(days[6]!));

export const dayLabel = (day: string): string => `${weekdayShort(day)} ${dayOfMonth(day)}`;

// A tap fills the cell up to its target. On a target of one it also clears a done cell; on a larger target "−" takes one off.
export const tapCount = (done: number, target: number): number => {
  if (done < target) return done + 1;
  return target === 1 ? 0 : done;
};

export const takeOneOff = (done: number): number => Math.max(0, done - 1);
