import { describe, expect, it } from "vitest";
import fc from "fast-check";
import { nextWeekday, weekDates } from "./calendar";
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

describe("weekDates", () => {
  it("runs Monday to Sunday around a Wednesday", () => {
    expect(weekDates("2026-11-04")).toEqual([
      "2026-11-02", "2026-11-03", "2026-11-04", "2026-11-05", "2026-11-06", "2026-11-07", "2026-11-08",
    ]);
  });

  it("starts on the Monday itself and ends on a Sunday", () => {
    expect(weekDates("2026-11-02")[0]).toBe("2026-11-02");
    expect(weekDates("2026-11-08")[0]).toBe("2026-11-02");
  });

  it("crosses a year end", () => {
    expect(weekDates("2027-01-01")).toContain("2026-12-28");
  });

  it("is seven consecutive days, Monday first, and the same for every day of the week", () => {
    fc.assert(
      fc.property(fc.integer({ min: -2000, max: 2000 }), (offset) => {
        const date = addDays("2026-11-04", offset);
        const week = weekDates(date);
        expect(week).toHaveLength(7);
        expect(weekdayOf(week[0]!)).toBe(1);
        expect(week).toContain(date);
        expect(week.every((day, i) => i === 0 || day === addDays(week[i - 1]!, 1))).toBe(true);
        expect(weekDates(week[3]!)).toEqual(week);
      }),
    );
  });
});
