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

const MINUTE_MS = 60_000;
const SOON_MINUTES = 60;

// What a routine card shows for a reminder. Within the hour it counts down, and that is the one case worth drawing the eye to.
export const reminderChip = (fireAt: string, dailyTime: string | null, now: Date): { text: string; soon: boolean } => {
  const minutes = Math.ceil((new Date(fireAt).getTime() - now.getTime()) / MINUTE_MS);
  if (minutes > SOON_MINUTES) return { text: reminderWhenLabel(fireAt, dailyTime, now), soon: false };
  const wait = minutes <= 0 ? copy.reminders.dueNow : copy.reminders.inMinutes(minutes);
  return { text: dailyTime ? copy.reminders.dailyCountdown(dailyTime, wait) : copy.reminders.countdown(wait), soon: true };
};
