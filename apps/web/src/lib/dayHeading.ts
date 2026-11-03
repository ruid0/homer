import { addDays } from "@homer/shared";
import { copy } from "../copy";

const relativeName = (date: string, today: string): string | null => {
  if (date === today) return copy.schedule.today;
  return date === addDays(today, 1) ? copy.schedule.tomorrow : null;
};

const dateName = (date: string): string => {
  const parsed = new Date(`${date}T00:00:00Z`);
  const weekday = copy.schedule.weekdays[parsed.getUTCDay()] ?? "";
  const month = copy.schedule.months[parsed.getUTCMonth()] ?? "";
  return copy.schedule.dayName(weekday, parsed.getUTCDate(), month);
};

export const dayHeading = (date: string, today: string): string => {
  const relative = relativeName(date, today);
  return relative === null ? dateName(date) : copy.schedule.relativeDay(relative, dateName(date));
};
