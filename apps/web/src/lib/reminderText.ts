import { MAX_REMINDER_MINUTES } from "@homer/shared";
import { copy } from "../copy";
import { timeOfDay } from "./clock";
import { localDate } from "./localDate";

export type ReminderState = "loading" | "failed" | "notificationsOff" | "needsSetup" | "ready";

type Known = { isPending: boolean; isError: boolean; data?: boolean };

// Not knowing whether notifications are on is not the same as them being off.
export const reminderState = (notifications: Known, remindersOn: boolean): ReminderState => {
  if (notifications.isPending) return "loading";
  if (notifications.isError || notifications.data === undefined) return "failed";
  return !notifications.data ? "notificationsOff" : remindersOn ? "ready" : "needsSetup";
};

export const durationMinutes = (hours: number, minutes: number): number => hours * 60 + minutes;

export const isValidDuration = (hours: number, minutes: number): boolean => {
  const total = durationMinutes(hours, minutes);
  return Number.isInteger(total) && total >= 1 && total <= MAX_REMINDER_MINUTES;
};

// The words the api reads. The pickers build them, so nobody types a phrase.
export const durationAsText = (hours: number, minutes: number): string => `in ${durationMinutes(hours, minutes)} minutes`;

// A reminder is at most a day ahead, so it falls today or tomorrow.
export const reminderWhenLabel = (fireAt: string, dailyTime: string | null, now: Date): string => {
  if (dailyTime) return copy.reminders.everyDay(dailyTime);
  const at = new Date(fireAt);
  return localDate(at) === localDate(now) ? copy.reminders.todayAt(timeOfDay(at)) : copy.reminders.tomorrowAt(timeOfDay(at));
};
