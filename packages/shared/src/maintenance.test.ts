import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { addDays, daysBetween } from "./schedule";
import { compareMaintenance, dueOn, maintenanceStatus, SOON_DAYS, type MaintenanceUnit } from "./maintenance";

const units: MaintenanceUnit[] = ["weeks", "months", "years"];

const dateArb = fc.integer({ min: 0, max: 20_000 }).map((days) => addDays("2000-01-01", days));
const everyArb = fc.integer({ min: 1, max: 99 });
const unitArb = fc.constantFrom(...units);

const due = (lastDoneOn: string | null, every: number, unit: MaintenanceUnit, createdOn = "2026-01-01") =>
  dueOn({ lastDoneOn, createdOn }, every, unit);

describe("dueOn", () => {
  it("counts the interval from the day it was last done", () => {
    expect(due("2026-11-10", 3, "months")).toBe("2027-02-10");
    expect(due("2026-11-10", 2, "weeks")).toBe("2026-11-24");
    expect(due("2026-11-10", 1, "years")).toBe("2027-11-10");
  });

  it("counts from a late done date, not the original slot", () => {
    expect(due("2027-02-12", 3, "months")).toBe("2027-05-12");
  });

  it("clamps to the last day of a shorter month and a non-leap year", () => {
    expect(due("2027-01-31", 1, "months")).toBe("2027-02-28");
    expect(due("2028-01-31", 1, "months")).toBe("2028-02-29");
    expect(due("2028-02-29", 1, "years")).toBe("2029-02-28");
  });

  it("is due on the day it was added when it has never been done, whatever the interval", () => {
    expect(due(null, 3, "months", "2026-11-05")).toBe("2026-11-05");
    fc.assert(
      fc.property(dateArb, everyArb, unitArb, (createdOn, every, unit) => {
        expect(due(null, every, unit, createdOn)).toBe(createdOn);
      }),
    );
  });

  it("keeps the day of the month, or the last day of a shorter month", () => {
    fc.assert(
      fc.property(dateArb, everyArb, fc.constantFrom<MaintenanceUnit>("months", "years"), (last, every, unit) => {
        const result = due(last, every, unit);
        const [lastDay, resultDay] = [Number(last.slice(8)), Number(result.slice(8))];
        expect(resultDay).toBeLessThanOrEqual(lastDay);
        const shorter = resultDay < lastDay;
        // A shorter month ends on its own last day: the next day is the 1st.
        expect(shorter ? addDays(result, 1).endsWith("-01") : resultDay === lastDay).toBe(true);
      }),
    );
  });

  it("is never before the last done date", () => {
    fc.assert(
      fc.property(dateArb, everyArb, unitArb, (last, every, unit) => {
        expect(due(last, every, unit) > last).toBe(true);
      }),
    );
  });

  it("a later done date never makes it due sooner", () => {
    fc.assert(
      fc.property(dateArb, fc.integer({ min: 0, max: 400 }), everyArb, unitArb, (first, gap, every, unit) => {
        expect(due(addDays(first, gap), every, unit) >= due(first, every, unit)).toBe(true);
      }),
    );
  });

  it("a longer interval is never due sooner", () => {
    fc.assert(
      fc.property(dateArb, fc.integer({ min: 1, max: 98 }), unitArb, (last, every, unit) => {
        expect(due(last, every + 1, unit) >= due(last, every, unit)).toBe(true);
      }),
    );
  });

  it("weeks are exactly seven days each", () => {
    fc.assert(
      fc.property(dateArb, everyArb, (last, every) => {
        expect(daysBetween(last, due(last, every, "weeks"))).toBe(7 * every);
      }),
    );
  });
});

describe("maintenanceStatus", () => {
  const today = "2026-11-05";

  it.each([
    ["2026-11-03", "overdue", -2],
    ["2026-11-04", "overdue", -1],
    ["2026-11-05", "due", 0],
    ["2026-11-06", "soon", 1],
    ["2026-11-12", "soon", SOON_DAYS],
    ["2026-11-13", "later", SOON_DAYS + 1],
  ])("%s is %s", (dueDate, status, daysUntil) => {
    expect(maintenanceStatus(dueDate, today)).toEqual({ status, daysUntil });
  });

  it("flips exactly at zero and at the soon limit", () => {
    fc.assert(
      fc.property(dateArb, fc.integer({ min: -400, max: 400 }), (day, offset) => {
        const { status, daysUntil } = maintenanceStatus(addDays(day, offset), day);
        expect(daysUntil).toBe(offset);
        expect(status).toBe(offset < 0 ? "overdue" : offset === 0 ? "due" : offset <= SOON_DAYS ? "soon" : "later");
      }),
    );
  });
});

describe("compareMaintenance", () => {
  const item = (name: string, dueDate: string) => ({ name, dueOn: dueDate });

  it("puts the most overdue first, then by due date, then by name", () => {
    const sorted = [item("B", "2026-11-09"), item("A", "2026-11-09"), item("C", "2026-11-01"), item("D", "2026-11-03")].sort(compareMaintenance);
    expect(sorted.map((entry) => entry.name)).toEqual(["C", "D", "A", "B"]);
  });

  it("sorts any list into non-decreasing (due date, name) order, with overdue ahead of what is not", () => {
    fc.assert(
      fc.property(fc.array(fc.record({ name: fc.string(), dueOn: dateArb })), (items) => {
        const sorted = [...items].sort(compareMaintenance);
        sorted.slice(1).forEach((entry, index) => {
          const before = sorted[index]!;
          expect(compareMaintenance(before, entry)).toBeLessThanOrEqual(0);
        });
        const today = "2010-01-01";
        const firstNotOverdue = sorted.findIndex((entry) => entry.dueOn >= today);
        if (firstNotOverdue >= 0) expect(sorted.slice(firstNotOverdue).every((entry) => entry.dueOn >= today)).toBe(true);
      }),
    );
  });

  it("is a consistent order for any two items", () => {
    fc.assert(
      fc.property(fc.string(), dateArb, fc.string(), dateArb, (nameA, dueA, nameB, dueB) => {
        const [a, b] = [item(nameA, dueA), item(nameB, dueB)];
        expect(Math.sign(compareMaintenance(a, b))).toBe(-Math.sign(compareMaintenance(b, a)));
      }),
    );
  });
});
