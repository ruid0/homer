import { describe, expect, it } from "vitest";
import { nextWeekday } from "./calendar";
import { addDays, weekdayOf } from "./schedule";

const WEEK = ["2026-11-01", "2026-11-02", "2026-11-03", "2026-11-04", "2026-11-05", "2026-11-06", "2026-11-07"];

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
