import { describe, expect, it } from "vitest";
import {
  MAX_ROUTINE_COUNT,
  MAX_ROUTINE_TARGET,
  routineItemInputSchema,
  setRoutineCountInputSchema,
  updateRoutineItemInputSchema,
} from "./schemas";

describe("routineItemInputSchema", () => {
  it("defaults the target to one a day and trims the name", () => {
    expect(routineItemInputSchema.parse({ personId: 1, name: "  Row A " })).toEqual({ personId: 1, name: "Row A", targetPerDay: 1 });
  });

  it.each([0, -1, 1.5, MAX_ROUTINE_TARGET + 1])("rejects a target of %s", (targetPerDay) => {
    expect(routineItemInputSchema.safeParse({ personId: 1, name: "Row A", targetPerDay }).success).toBe(false);
  });

  it("rejects an empty or very long name", () => {
    expect(routineItemInputSchema.safeParse({ personId: 1, name: "  " }).success).toBe(false);
    expect(routineItemInputSchema.safeParse({ personId: 1, name: "x".repeat(81) }).success).toBe(false);
  });
});

describe("updateRoutineItemInputSchema", () => {
  it("needs the target, so a rename cannot reset it", () => {
    expect(updateRoutineItemInputSchema.safeParse({ id: 1, name: "Row A" }).success).toBe(false);
    expect(updateRoutineItemInputSchema.safeParse({ id: 1, name: "Row A", targetPerDay: 3 }).success).toBe(true);
  });
});

describe("setRoutineCountInputSchema", () => {
  const input = { itemId: 1, date: "2026-11-04", today: "2026-11-05", count: 2 };

  it("accepts zero up to the maximum", () => {
    expect(setRoutineCountInputSchema.safeParse({ ...input, count: 0 }).success).toBe(true);
    expect(setRoutineCountInputSchema.safeParse({ ...input, count: MAX_ROUTINE_COUNT }).success).toBe(true);
  });

  it.each([-1, 1.5, MAX_ROUTINE_COUNT + 1])("rejects a count of %s", (count) => {
    expect(setRoutineCountInputSchema.safeParse({ ...input, count }).success).toBe(false);
  });

  it("rejects a date that is not a calendar date", () => {
    expect(setRoutineCountInputSchema.safeParse({ ...input, date: "2026-13-40" }).success).toBe(false);
  });
});
