import fc from "fast-check";
import { describe, expect, it } from "vitest";
import {
  MAX_REMINDER_MINUTES,
  clockText,
  nextClockTime,
  parseReminderWhen,
  reminderFireAt,
  type ReminderWhen,
} from "./reminders";

const inMinutes = (minutes: number): ReminderWhen => ({ kind: "in", minutes });
const at = (hour: number, minute = 0): ReminderWhen => ({ kind: "at", hour, minute });

describe("parseReminderWhen: relative", () => {
  it.each([
    ["in an hour", 60],
    ["In a hour", 60],
    ["in half an hour", 30],
    ["in 30 minutes", 30],
    ["in 30 min", 30],
    ["45 min", 45],
    ["in 2 hours", 120],
    ["in 1.5 hours", 90],
    ["in 1 hour 30 minutes", 90],
    ["in 1h 15m", 75],
    ["in a minute", 1],
    ["  IN   10   MINUTES ", 10],
  ])("reads %s", (text, minutes) => expect(parseReminderWhen(text)).toEqual(inMinutes(minutes)));

  it.each(["in 0 minutes", "in 25 hours", "in 1441 minutes", "in hours", "in a while", "in -5 minutes"])("rejects %s", (text) => {
    expect(parseReminderWhen(text)).toBeNull();
  });

  it("accepts the full day and nothing beyond", () => {
    expect(parseReminderWhen(`in ${MAX_REMINDER_MINUTES} minutes`)).toEqual(inMinutes(MAX_REMINDER_MINUTES));
    expect(parseReminderWhen(`in ${MAX_REMINDER_MINUTES + 1} minutes`)).toBeNull();
  });
});

describe("parseReminderWhen: clock times", () => {
  it.each([
    ["13:30", at(13, 30)],
    ["at 13:30", at(13, 30)],
    ["09:30", at(9, 30)],
    ["10:30", at(10, 30)],
    ["1:30pm", at(13, 30)],
    ["1:30 PM", at(13, 30)],
    ["at 1pm", at(13)],
    ["12am", at(0)],
    ["12:15 pm", at(12, 15)],
    ["1.30 pm", at(13, 30)],
    ["00:00", at(0)],
    ["23:59", at(23, 59)],
  ])("reads %s", (text, expected) => expect(parseReminderWhen(text)).toEqual(expected));

  it.each(["13", "24:00", "12:60", "0pm", "13pm", "at 25", "sometime", "", "  ", "at", "at 9", "1:30", "9.15"])("rejects %s", (text) => {
    expect(parseReminderWhen(text)).toBeNull();
  });

  it("reads every valid 24-hour time", () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 23 }), fc.integer({ min: 0, max: 59 }), (hour, minute) => {
        expect(parseReminderWhen(clockText(hour, minute))).toEqual(at(hour, minute));
      }),
    );
  });

  it("reads any text it accepts into a valid time", () => {
    fc.assert(
      fc.property(fc.string(), (text) => {
        const when = parseReminderWhen(text);
        if (when?.kind === "in") expect(when.minutes).toBeGreaterThanOrEqual(1);
        if (when?.kind === "in") expect(when.minutes).toBeLessThanOrEqual(MAX_REMINDER_MINUTES);
        if (when?.kind === "at") {
          expect(when.hour).toBeGreaterThanOrEqual(0);
          expect(when.hour).toBeLessThanOrEqual(23);
          expect(when.minute).toBeLessThanOrEqual(59);
        }
      }),
    );
  });

  it("never throws on any text", () => {
    fc.assert(fc.property(fc.string(), (text) => void parseReminderWhen(text)));
  });
});

describe("reminderFireAt", () => {
  const now = new Date(2026, 10, 5, 12, 10, 42);

  it("adds the minutes to the moment of asking, so it is never early", () => {
    expect(reminderFireAt(inMinutes(60), now)).toEqual(new Date(2026, 10, 5, 13, 10, 42));
  });

  it("lands exactly N minutes ahead for any N", () => {
    fc.assert(
      fc.property(fc.integer({ min: 1, max: MAX_REMINDER_MINUTES }), (minutes) => {
        expect(reminderFireAt(inMinutes(minutes), now).getTime() - now.getTime()).toBe(minutes * 60_000);
      }),
    );
  });

  it("uses today for a clock time still ahead and tomorrow for one that has passed", () => {
    expect(reminderFireAt(at(13, 30), now)).toEqual(new Date(2026, 10, 5, 13, 30));
    expect(reminderFireAt(at(9), now)).toEqual(new Date(2026, 10, 6, 9));
  });

  it("treats the minute that is now as passed", () => {
    expect(nextClockTime(12, 10, new Date(2026, 10, 5, 12, 10))).toEqual(new Date(2026, 10, 6, 12, 10));
  });

  it("is always after now and within a day for a clock time", () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 23 }), fc.integer({ min: 0, max: 59 }), (hour, minute) => {
        const fire = reminderFireAt(at(hour, minute), now);
        expect(fire.getTime()).toBeGreaterThan(now.getTime());
        expect(fire.getTime() - now.getTime()).toBeLessThanOrEqual(25 * 3_600_000);
      }),
    );
  });
});
