import { describe, expect, it } from "vitest";
import { MAX_REMINDER_MINUTES, parseReminderWhen } from "@homer/shared";
import { durationAsText, isValidDuration, reminderWhenLabel } from "./reminderText";

describe("durationAsText", () => {
  it("builds words the api reads back as the same number of minutes", () => {
    expect(parseReminderWhen(durationAsText(1, 30))).toEqual({ kind: "in", minutes: 90 });
    expect(parseReminderWhen(durationAsText(0, 5))).toEqual({ kind: "in", minutes: 5 });
    expect(parseReminderWhen(durationAsText(24, 0))).toEqual({ kind: "in", minutes: MAX_REMINDER_MINUTES });
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
