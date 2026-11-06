import { addDays, weekdayOf } from "./schedule";

// The first date after `today` that falls on `weekday` (0 is Sunday). On that weekday itself it is a week ahead.
export const nextWeekday = (today: string, weekday: number): string =>
  addDays(today, ((weekday - weekdayOf(today) + 6) % 7) + 1);

// The seven dates of the week (Monday first) that contains `date`.
export const weekDates = (date: string): string[] => {
  const monday = addDays(date, -((weekdayOf(date) + 6) % 7));
  return Array.from({ length: 7 }, (_, i) => addDays(monday, i));
};
