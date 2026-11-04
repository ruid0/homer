import { addDays, weekdayOf } from "./schedule";

export type CalendarDay = { date: string; weekday: number };

// The days from `today` on, so a prompt can show "Friday is 2026-11-06" instead of asking a model to count.
export const calendar = (today: string, days: number): CalendarDay[] =>
  Array.from({ length: days }, (_, index) => {
    const date = addDays(today, index);
    return { date, weekday: weekdayOf(date) };
  });

// The first date after `today` that falls on `weekday` (0 is Sunday). On that weekday itself it is a week ahead.
export const nextWeekday = (today: string, weekday: number): string =>
  addDays(today, ((weekday - weekdayOf(today) + 6) % 7) + 1);
