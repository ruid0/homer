import { describe, expect, it } from "vitest";
import {
  MAX_MAINTENANCE_DAYS_BACK,
  MAX_MAINTENANCE_EVERY,
  maintenanceItemInputSchema,
  markMaintenanceDoneInputSchema,
  undoMaintenanceDoneInputSchema,
  updateMaintenanceItemInputSchema,
} from "./schemas";

const today = "2026-11-05";
const base = { name: "  Filter ", every: 3, unit: "months" as const, today };

describe("maintenanceItemInputSchema", () => {
  it("trims the name and defaults last done to never", () => {
    expect(maintenanceItemInputSchema.parse(base)).toEqual({ name: "Filter", every: 3, unit: "months", lastDoneOn: null, today });
  });

  it.each([0, -1, 1.5, MAX_MAINTENANCE_EVERY + 1])("rejects an interval of %s", (every) => {
    expect(maintenanceItemInputSchema.safeParse({ ...base, every }).success).toBe(false);
  });

  it.each(["days", "", "Months"])("rejects the unit %j", (unit) => {
    expect(maintenanceItemInputSchema.safeParse({ ...base, unit }).success).toBe(false);
  });

  it("rejects an empty or very long name", () => {
    expect(maintenanceItemInputSchema.safeParse({ ...base, name: "  " }).success).toBe(false);
    expect(maintenanceItemInputSchema.safeParse({ ...base, name: "x".repeat(81) }).success).toBe(false);
  });

  it("accepts a last done date up to today and no later, or too far back", () => {
    expect(maintenanceItemInputSchema.safeParse({ ...base, lastDoneOn: today }).success).toBe(true);
    expect(maintenanceItemInputSchema.safeParse({ ...base, lastDoneOn: "2026-11-06" }).success).toBe(false);
    expect(maintenanceItemInputSchema.safeParse({ ...base, lastDoneOn: "2026-02-30" }).success).toBe(false);
    expect(maintenanceItemInputSchema.safeParse({ ...base, lastDoneOn: "2025-11-05" }).success).toBe(true);
    expect(maintenanceItemInputSchema.safeParse({ ...base, lastDoneOn: "2025-11-04" }).success).toBe(false);
  });
});

describe("updateMaintenanceItemInputSchema", () => {
  it("needs the id and the interval, so a rename cannot silently reset them", () => {
    expect(updateMaintenanceItemInputSchema.safeParse({ id: 1, name: "Filter" }).success).toBe(false);
    expect(updateMaintenanceItemInputSchema.parse({ id: 1, name: "Filter", every: 6, unit: "months" })).toEqual({
      id: 1,
      name: "Filter",
      every: 6,
      unit: "months",
    });
  });
});

describe("undoMaintenanceDoneInputSchema", () => {
  it("needs the id of one done record", () => {
    expect(undoMaintenanceDoneInputSchema.parse({ doneId: 4 })).toEqual({ doneId: 4 });
    expect(undoMaintenanceDoneInputSchema.safeParse({ doneId: 0 }).success).toBe(false);
    expect(undoMaintenanceDoneInputSchema.safeParse({ id: 4 }).success).toBe(false);
  });
});

describe("markMaintenanceDoneInputSchema", () => {
  it(`takes a date from today back ${MAX_MAINTENANCE_DAYS_BACK} days`, () => {
    expect(markMaintenanceDoneInputSchema.safeParse({ id: 1, doneOn: today, today }).success).toBe(true);
    expect(markMaintenanceDoneInputSchema.safeParse({ id: 1, doneOn: "2025-11-04", today }).success).toBe(false);
    expect(markMaintenanceDoneInputSchema.safeParse({ id: 1, doneOn: "2026-11-06", today }).success).toBe(false);
    expect(markMaintenanceDoneInputSchema.safeParse({ id: 1, doneOn: "nope", today }).success).toBe(false);
  });
});
