import { describe, expect, it } from "vitest";
import { calendar, nextWeekday } from "./calendar";
import { addDays, weekdayOf } from "./schedule";

const WEEK = ["2026-11-01", "2026-11-02", "2026-11-03", "2026-11-04", "2026-11-05", "2026-11-06", "2026-11-07"];

describe("calendar", () => {
  it("starts today and lists consecutive days with the right weekday", () => {
    const days = calendar("2026-11-03", 14);
    expect(days).toHaveLength(14);
    expect(days[0]).toEqual({ date: "2026-11-03", weekday: 2 });
    days.forEach((day, index) => {
      expect(day.date).toBe(addDays("2026-11-03", index));
      expect(day.weekday).toBe(weekdayOf(day.date));
    });
  });
});

describe("nextWeekday", () => {
  it("finds the coming Friday from a Tuesday", () => {
    expect(nextWeekday("2026-11-03", 5)).toBe("2026-11-06");
  });

  it("goes to next week when today is that weekday", () => {
    expect(nextWeekday("2026-11-06", 5)).toBe("2026-11-13");
  });

  it.each(WEEK)("is 1 to 7 days ahead, on the right weekday, from %s", (today) => {
    for (let weekday = 0; weekday < 7; weekday++) {
      const date = nextWeekday(today, weekday);
      expect(weekdayOf(date)).toBe(weekday);
      const ahead = (Date.parse(date) - Date.parse(today)) / 86_400_000;
      expect(ahead).toBeGreaterThanOrEqual(1);
      expect(ahead).toBeLessThanOrEqual(7);
    }
  });
});
