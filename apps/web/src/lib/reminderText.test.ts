import { describe, expect, it } from "vitest";
import { MAX_REMINDER_MINUTES, parseReminderWhen } from "@homer/shared";
import { durationAsText, isValidDuration, reminderChip, reminderState, reminderWhenLabel } from "./reminderText";

describe("durationAsText", () => {
  it("builds words the api reads back as the same number of minutes", () => {
    expect(parseReminderWhen(durationAsText(1, 30))).toEqual({ kind: "in", minutes: 90 });
    expect(parseReminderWhen(durationAsText(0, 5))).toEqual({ kind: "in", minutes: 5 });
    expect(parseReminderWhen(durationAsText(24, 0))).toEqual({ kind: "in", minutes: MAX_REMINDER_MINUTES });
  });
});

describe("reminderState", () => {
  it("puts notifications first, then setup", () => {
    const known = (data: boolean) => ({ isPending: false, isError: false, data });
    expect(reminderState(known(false), true)).toBe("notificationsOff");
    expect(reminderState(known(false), false)).toBe("notificationsOff");
    expect(reminderState(known(true), false)).toBe("needsSetup");
    expect(reminderState(known(true), true)).toBe("ready");
  });

  it("does not call it off while loading or when the question failed", () => {
    expect(reminderState({ isPending: true, isError: false }, true)).toBe("loading");
    expect(reminderState({ isPending: false, isError: true }, true)).toBe("failed");
  });
});

describe("isValidDuration", () => {
  it("rejects zero and more than a day", () => {
    expect(isValidDuration(0, 0)).toBe(false);
    expect(isValidDuration(24, 1)).toBe(false);
    expect(isValidDuration(0, 1)).toBe(true);
    expect(isValidDuration(24, 0)).toBe(true);
  });
});

describe("reminderWhenLabel", () => {
  const now = new Date(2026, 10, 5, 12, 0);
  it("says today, tomorrow or every day", () => {
    expect(reminderWhenLabel(new Date(2026, 10, 5, 13, 30).toISOString(), null, now)).toBe("Today at 13:30");
    expect(reminderWhenLabel(new Date(2026, 10, 6, 9, 5).toISOString(), null, now)).toBe("Tomorrow at 09:05");
    expect(reminderWhenLabel(new Date(2026, 10, 6, 13, 30).toISOString(), "13:30", now)).toBe("Every day at 13:30");
  });
});

describe("reminderChip", () => {
  const now = new Date(2026, 10, 19, 12, 0, 0);
  const at = (minutes: number, seconds = 0) =>
    new Date(now.getTime() + minutes * 60_000 + seconds * 1000).toISOString();

  it("counts down in whole minutes, rounding up, inside the hour", () => {
    expect(reminderChip(at(12), null, now)).toEqual({ text: "Reminder in 12 min", soon: true });
    expect(reminderChip(at(0, 20), null, now)).toEqual({ text: "Reminder in 1 min", soon: true });
    expect(reminderChip(at(60), null, now)).toEqual({ text: "Reminder in 60 min", soon: true });
  });

  it("says now when the time has come and the note has not gone out yet", () => {
    expect(reminderChip(at(0), null, now)).toEqual({ text: "Reminder now", soon: true });
    expect(reminderChip(at(-2), null, now).soon).toBe(true);
  });

  it("past the hour it is the clock time, and not soon", () => {
    expect(reminderChip(at(61), null, now)).toEqual({ text: "Reminder: Today at 13:01", soon: false });
    expect(reminderChip(at(24 * 60 - 1), null, now).text).toMatch(/^Reminder: Tomorrow at /);
  });

  it("a daily reminder keeps its words and adds the wait only inside the hour", () => {
    expect(reminderChip(at(5), "12:05", now)).toEqual({ text: "Reminder every day at 12:05, in 5 min", soon: true });
    expect(reminderChip(at(300), "17:00", now)).toEqual({ text: "Reminder: Every day at 17:00", soon: false });
  });
});
