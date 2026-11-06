export const MAX_REMINDER_MINUTES = 24 * 60;

export type ReminderWhen = { kind: "in"; minutes: number } | { kind: "at"; hour: number; minute: number };

const MINUTES_PER_HOUR = 60;

const clean = (text: string) => text.trim().toLowerCase().replace(/\s+/g, " ");

const HOUR_WORDS = "(?:h|hr|hrs|hour|hours)";
const MINUTE_WORDS = "(?:m|min|mins|minute|minutes)";

const withinLimit = (minutes: number): ReminderWhen | null =>
  Number.isFinite(minutes) && minutes >= 1 && minutes <= MAX_REMINDER_MINUTES ? { kind: "in", minutes: Math.round(minutes) } : null;

// "in an hour", "in half an hour", "in 30 minutes", "in 1.5 hours", "in 1 hour 30 minutes", "45 min".
const relative = (text: string): ReminderWhen | null => {
  const body = text.replace(/^in /, "");
  if (/^(?:an?|one) hour$/.test(body)) return withinLimit(MINUTES_PER_HOUR);
  if (/^(?:an?|one) minute$/.test(body)) return withinLimit(1);
  if (/^half an hour$|^half hour$/.test(body)) return withinLimit(MINUTES_PER_HOUR / 2);
  const both = new RegExp(`^(\\d+) ?${HOUR_WORDS} ?(?:and )?(\\d+) ?${MINUTE_WORDS}$`).exec(body);
  if (both) return withinLimit(Number(both[1]) * MINUTES_PER_HOUR + Number(both[2]));
  const hours = new RegExp(`^(\\d+(?:\\.\\d+)?) ?${HOUR_WORDS}$`).exec(body);
  if (hours) return withinLimit(Number(hours[1]) * MINUTES_PER_HOUR);
  const minutes = new RegExp(`^(\\d+) ?${MINUTE_WORDS}$`).exec(body);
  return minutes ? withinLimit(Number(minutes[1])) : null;
};

// "13:30", "09:30", "at 13:30", "1:30pm", "at 1pm", "1.30 pm". A bare number such as "13" is not a time.
// Without am or pm the hour needs two digits ("09:30", "13:30"), because "1:30" could be morning or afternoon.
const clock = (text: string): ReminderWhen | null => {
  const match = /^(?:at )?(\d{1,2})(?:[:.](\d{2}))? ?(am|pm)?$/.exec(text);
  if (!match) return null;
  const [, hourText, minuteText, meridiem] = match;
  const explicit = text.startsWith("at ") || minuteText !== undefined || meridiem !== undefined;
  if (!explicit) return null;
  const minute = minuteText === undefined ? 0 : Number(minuteText);
  const hour = Number(hourText);
  if (minute > 59) return null;
  if (meridiem === undefined) return hourText?.length === 2 && hour <= 23 ? { kind: "at", hour, minute } : null;
  if (hour < 1 || hour > 12) return null;
  return { kind: "at", hour: (hour % 12) + (meridiem === "pm" ? 12 : 0), minute };
};

// Null when the text is not a time we understand. It never guesses.
export const parseReminderWhen = (text: string): ReminderWhen | null => {
  const cleaned = clean(text);
  return cleaned.startsWith("in ") ? relative(cleaned) : (clock(cleaned) ?? relative(cleaned));
};

// The first time after `after` that the clock reads hour:minute, in the process's own time zone.
export const nextClockTime = (hour: number, minute: number, after: Date): Date => {
  const today = new Date(after.getFullYear(), after.getMonth(), after.getDate(), hour, minute);
  return today.getTime() > after.getTime() ? today : new Date(after.getFullYear(), after.getMonth(), after.getDate() + 1, hour, minute);
};

export const reminderFireAt = (when: ReminderWhen, now: Date): Date =>
  when.kind === "in" ? new Date(now.getTime() + when.minutes * 60_000) : nextClockTime(when.hour, when.minute, now);

export const clockText = (hour: number, minute: number): string =>
  `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
