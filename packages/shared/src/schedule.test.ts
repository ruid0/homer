import { describe, expect, it } from "vitest";
import fc from "fast-check";
import { addDays, addMonths, compareSchedule, isOverdue, nextDueDate, weekdayOf } from "./schedule";

const monthIndex = (day: string) => Number(day.slice(0, 4)) * 12 + Number(day.slice(5, 7));
const lastDayOfMonth = (day: string) => Number(addDays(addMonths(`${day.slice(0, 7)}-01`, 1), -1).slice(8));

const date = fc
  .date({ min: new Date("2000-01-01"), max: new Date("2100-12-31"), noInvalidDate: true })
  .map((value) => value.toISOString().slice(0, 10));
const repeat = fc.constantFrom("daily" as const, "weekly" as const, "monthly" as const);
const later = (a: string, b: string) => (a > b ? a : b);

describe("addDays", () => {
  it("crosses month and year ends", () => {
    expect(addDays("2026-01-31", 1)).toBe("2026-02-01");
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
    expect(addDays("2026-03-01", -1)).toBe("2026-02-28");
  });

  it("handles leap days", () => {
    expect(addDays("2028-02-28", 1)).toBe("2028-02-29");
    expect(addDays("2027-02-28", 1)).toBe("2027-03-01");
  });

  it("is undone by adding the opposite", () => {
    fc.assert(fc.property(date, fc.integer({ min: -4000, max: 4000 }), (day, n) => {
      expect(addDays(addDays(day, n), -n)).toBe(day);
    }));
  });
});

describe("weekdayOf", () => {
  it("counts from Sunday as 0", () => {
    expect(weekdayOf("2026-11-01")).toBe(0);
    expect(weekdayOf("2026-11-02")).toBe(1);
    expect(weekdayOf("2026-11-07")).toBe(6);
  });
});

describe("addMonths", () => {
  it("keeps the day of the month", () => {
    expect(addMonths("2026-01-15", 1)).toBe("2026-02-15");
    expect(addMonths("2026-11-15", 3)).toBe("2027-02-15");
  });

  it("clamps to the end of a shorter month", () => {
    expect(addMonths("2026-01-31", 1)).toBe("2026-02-28");
    expect(addMonths("2028-01-31", 1)).toBe("2028-02-29");
    expect(addMonths("2026-03-31", 1)).toBe("2026-04-30");
  });

  it("measures each step from the start, so there is no drift", () => {
    expect(addMonths("2026-01-31", 2)).toBe("2026-03-31");
  });

  it("moves the month by exactly n and keeps the day, or the month end when it is shorter", () => {
    fc.assert(fc.property(date, fc.integer({ min: 0, max: 600 }), (day, n) => {
      const moved = addMonths(day, n);
      expect(monthIndex(moved) - monthIndex(day)).toBe(n);
      expect(Number(moved.slice(8))).toBe(Math.min(Number(day.slice(8)), lastDayOfMonth(moved)));
    }));
  });
});

describe("nextDueDate", () => {
  it("brings a weekly task due Monday and completed Wednesday back the following Monday", () => {
    expect(nextDueDate("2026-11-02", "weekly", "2026-11-04")).toBe("2026-11-09");
  });

  it("steps one repeat when completed on time", () => {
    expect(nextDueDate("2026-11-02", "daily", "2026-11-02")).toBe("2026-11-03");
    expect(nextDueDate("2026-11-02", "weekly", "2026-11-02")).toBe("2026-11-09");
    expect(nextDueDate("2026-11-02", "monthly", "2026-11-02")).toBe("2026-12-02");
  });

  it("lands after today when completed late, on the same weekday", () => {
    expect(nextDueDate("2026-11-02", "weekly", "2026-11-23")).toBe("2026-11-30");
    expect(nextDueDate("2026-11-02", "weekly", "2026-11-25")).toBe("2026-11-30");
    expect(nextDueDate("2026-11-02", "daily", "2026-11-05")).toBe("2026-11-06");
  });

  it("steps from the due date when it is still in the future", () => {
    expect(nextDueDate("2026-12-01", "weekly", "2026-11-04")).toBe("2026-12-08");
  });

  it("clamps monthly to the end of a short month", () => {
    expect(nextDueDate("2026-01-31", "monthly", "2026-01-31")).toBe("2026-02-28");
    expect(nextDueDate("2026-01-31", "monthly", "2026-02-28")).toBe("2026-03-31");
  });

  it("does not drift when a monthly task is completed late", () => {
    expect(nextDueDate("2026-01-31", "monthly", "2026-04-05")).toBe("2026-04-30");
    expect(nextDueDate("2026-01-31", "monthly", "2026-05-01")).toBe("2026-05-31");
  });

  it("does not corrupt a date at the end of the allowed years", () => {
    expect(nextDueDate("2999-12-31", "daily", "2999-12-31")).toBe("3000-01-01");
  });

  it("is always after both the due date and today", () => {
    fc.assert(fc.property(date, repeat, date, (due, every, today) => {
      const next = nextDueDate(due, every, today);
      expect(next > due && next > today).toBe(true);
    }));
  });

  it("keeps the weekday for weekly", () => {
    fc.assert(fc.property(date, date, (due, today) => {
      expect(weekdayOf(nextDueDate(due, "weekly", today))).toBe(weekdayOf(due));
    }));
  });

  it("never skips a repeat that is still ahead", () => {
    fc.assert(fc.property(date, date, (due, today) => {
      const bar = later(due, today);
      expect(addDays(nextDueDate(due, "daily", today), -1) <= bar).toBe(true);
      expect(addDays(nextDueDate(due, "weekly", today), -7) <= bar).toBe(true);
    }));
  });

  it("lands monthly on the first repeat after both dates, not later", () => {
    const steps = Array.from({ length: 1300 }, (_, index) => index + 1);
    fc.assert(fc.property(date, date, (due, today) => {
      const next = nextDueDate(due, "monthly", today);
      const step = steps.find((months) => addMonths(due, months) === next);
      expect(step).toBeDefined();
      expect(addMonths(due, (step ?? 1) - 1) <= later(due, today)).toBe(true);
    }));
  });

  it("keeps the day of the month for monthly, or the month end when it is shorter", () => {
    fc.assert(fc.property(date, date, (due, today) => {
      const next = nextDueDate(due, "monthly", today);
      const lastDayOfNextMonth = Number(addDays(addMonths(`${next.slice(0, 7)}-01`, 1), -1).slice(8));
      expect(Number(next.slice(8))).toBe(Math.min(Number(due.slice(8)), lastDayOfNextMonth));
    }));
  });
});

describe("isOverdue", () => {
  const open = { dueDate: "2026-11-02", doneAt: null, removedAt: null };

  it("is true for an open task due before today", () => {
    expect(isOverdue(open, "2026-11-03")).toBe(true);
  });

  it("is false on the due date itself, even with a time that has passed", () => {
    expect(isOverdue(open, "2026-11-02")).toBe(false);
    expect(isOverdue(open, "2026-11-01")).toBe(false);
  });

  it("is false without a due date, once done, or once removed", () => {
    expect(isOverdue({ ...open, dueDate: null }, "2026-11-03")).toBe(false);
    expect(isOverdue({ ...open, doneAt: "2026-11-02T10:00:00.000Z" }, "2026-11-03")).toBe(false);
    expect(isOverdue({ ...open, removedAt: "2026-11-02T10:00:00.000Z" }, "2026-11-03")).toBe(false);
  });

  it("flips exactly at the date", () => {
    fc.assert(fc.property(date, fc.integer({ min: -400, max: 400 }), (due, offset) => {
      const today = addDays(due, offset);
      expect(isOverdue({ dueDate: due, doneAt: null, removedAt: null }, today)).toBe(offset > 0);
    }));
  });
});

describe("compareSchedule", () => {
  const entry = fc.record({
    date: fc.constantFrom("2026-11-02", "2026-11-03", "2026-11-04"),
    time: fc.option(fc.constantFrom("07:00", "09:30", "18:00", "23:59"), { nil: null }),
    overdue: fc.boolean(),
  });

  it("puts overdue entries first, oldest first", () => {
    const sorted = [
      { date: "2026-11-03", time: null, overdue: false },
      { date: "2026-11-02", time: null, overdue: true },
      { date: "2026-11-01", time: "09:00", overdue: true },
    ].sort(compareSchedule);
    expect(sorted.map((item) => item.date)).toEqual(["2026-11-01", "2026-11-02", "2026-11-03"]);
  });

  it("puts timed entries by time, then entries without a time", () => {
    const day = "2026-11-03";
    const sorted = [
      { date: day, time: null, overdue: false },
      { date: day, time: "18:00", overdue: false },
      { date: day, time: "07:00", overdue: false },
    ].sort(compareSchedule);
    expect(sorted.map((item) => item.time)).toEqual(["07:00", "18:00", null]);
  });

  it("is antisymmetric and transitive", () => {
    fc.assert(fc.property(entry, entry, entry, (a, b, c) => {
      expect(Math.sign(compareSchedule(a, b)) + Math.sign(compareSchedule(b, a))).toBe(0);
      if (compareSchedule(a, b) <= 0 && compareSchedule(b, c) <= 0) expect(compareSchedule(a, c)).toBeLessThanOrEqual(0);
    }));
  });

  it("never puts an entry that is not overdue before an overdue one", () => {
    fc.assert(fc.property(entry, entry, (a, b) => {
      if (a.overdue && !b.overdue) expect(compareSchedule(a, b)).toBeLessThan(0);
    }));
  });
});
