import { addDays, weekdayOf } from "./schedule";

// The first date after `today` that falls on `weekday` (0 is Sunday). On that weekday itself it is a week ahead.
export const nextWeekday = (today: string, weekday: number): string =>
  addDays(today, ((weekday - weekdayOf(today) + 6) % 7) + 1);
