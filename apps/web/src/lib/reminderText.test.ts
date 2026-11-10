import { describe, expect, it } from "vitest";
import { MAX_REMINDER_MINUTES, parseReminderWhen } from "@homer/shared";
import { durationAsText, isValidDuration, reminderState, reminderWhenLabel } from "./reminderText";

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
