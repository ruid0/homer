import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { maintenanceInWindow, routinesOpen, type DueMaintenance } from "./due";

const row = (status: DueMaintenance["status"], daysUntil: number): DueMaintenance => ({
  name: "Filter",
  dueOn: "2026-11-10",
  daysUntil,
  status,
});

describe("maintenanceInWindow", () => {
  it("keeps overdue and due jobs whatever the window", () => {
    expect(maintenanceInWindow([row("overdue", -3), row("due", 0)], 1)).toHaveLength(2);
  });

  it("hides a snoozed job (later, due date not ahead) and one past the window", () => {
    expect(maintenanceInWindow([row("later", -2), row("later", 0), row("later", 9)], 7)).toEqual([]);
  });

  it("counts today as day one: a job on the last day shows, one a day later does not", () => {
    expect(maintenanceInWindow([row("soon", 6), row("soon", 1)], 7)).toHaveLength(2);
    expect(maintenanceInWindow([row("soon", 7)], 7)).toEqual([]);
    expect(maintenanceInWindow([row("soon", 1)], 1)).toEqual([]);
  });

  it("never drops an overdue or due job, and never adds one", () => {
    const rows = fc.array(
      fc.record({
        name: fc.string(),
        dueOn: fc.constant("2026-11-10"),
        daysUntil: fc.integer({ min: -400, max: 400 }),
        status: fc.constantFrom("overdue", "due", "soon", "later" as const),
      }),
    );
    fc.assert(
      fc.property(rows, fc.integer({ min: 1, max: 31 }), (list, days) => {
        const shown = maintenanceInWindow(list, days);
        expect(shown.every((item) => list.includes(item))).toBe(true);
        const urgent = list.filter(({ status }) => status === "overdue" || status === "due");
        expect(urgent.every((item) => shown.includes(item))).toBe(true);
      }),
    );
  });
});

describe("routinesOpen", () => {
  it("lists only rows short of the target, with what is left", () => {
    const result = routinesOpen([
      {
        person: "Ana",
        rows: [
          { name: "Vitamins", targetPerDay: 2, doneToday: 1 },
          { name: "Walk", targetPerDay: 1, doneToday: 1 },
        ],
      },
      { person: "Bo", rows: [{ name: "Walk", targetPerDay: 1, doneToday: 2 }] },
    ]);
    expect(result).toEqual([{ person: "Ana", open: [{ name: "Vitamins", left: 1 }] }]);
  });
});
