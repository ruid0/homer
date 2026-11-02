import { describe, expect, it } from "vitest";
import fc from "fast-check";
import { daysRemaining, effectiveEstimate, groceryAction, isRunningLow, needsRestock } from "./domain";

const positive = fc.double({ min: 0.01, max: 1000, noNaN: true });
const nonNegative = fc.double({ min: 0, max: 1000, noNaN: true });

describe("daysRemaining", () => {
  it("gives 2 days for 1 litre of milk lasting 2 days per litre", () => {
    expect(daysRemaining(1, 2)).toBe(2);
  });

  it("rounds down", () => {
    expect(daysRemaining(0.5, 2)).toBe(1);
    expect(daysRemaining(1, 2.9)).toBe(2);
  });

  it("is null when there is no estimate", () => {
    expect(daysRemaining(5, null)).toBeNull();
  });

  it("is 0 when nothing is left", () => {
    expect(daysRemaining(0, 30)).toBe(0);
  });

  it("is never negative, even for bad input", () => {
    fc.assert(
      fc.property(fc.double({ noNaN: true }), positive, (quantity, perUnit) => {
        expect(daysRemaining(quantity, perUnit)).toBeGreaterThanOrEqual(0);
      }),
    );
  });

  it("is null exactly when there is no estimate", () => {
    fc.assert(
      fc.property(nonNegative, fc.option(positive, { nil: null }), (quantity, perUnit) => {
        expect(daysRemaining(quantity, perUnit) === null).toBe(perUnit === null);
      }),
    );
  });

  it("never decreases when quantity grows", () => {
    fc.assert(
      fc.property(nonNegative, nonNegative, positive, (a, b, perUnit) => {
        const [low, high] = a <= b ? [a, b] : [b, a];
        expect(daysRemaining(low, perUnit)!).toBeLessThanOrEqual(daysRemaining(high, perUnit)!);
      }),
    );
  });
});

describe("isRunningLow", () => {
  it("is false when there is no estimate", () => {
    expect(isRunningLow(null, 7)).toBe(false);
  });

  it("is true at the threshold and below, false above", () => {
    expect(isRunningLow(7, 7)).toBe(true);
    expect(isRunningLow(0, 7)).toBe(true);
    expect(isRunningLow(8, 7)).toBe(false);
  });

  it("flips exactly at the threshold", () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 365 }), fc.integer({ min: 0, max: 365 }), (days, threshold) => {
        expect(isRunningLow(days, threshold)).toBe(days <= threshold);
      }),
    );
  });
});

describe("needsRestock", () => {
  const stock = (quantity: number, daysRemaining: number | null, lowThresholdDays = 7) => ({
    quantity,
    daysRemaining,
    lowThresholdDays,
  });

  it("is true for milk at 1 litre lasting 2 days per litre", () => {
    expect(needsRestock(stock(1, 2))).toBe(true);
  });

  it("is true when out, even with no estimate", () => {
    expect(needsRestock(stock(0, null))).toBe(true);
  });

  it("is false for stock with no estimate", () => {
    expect(needsRestock(stock(3, null))).toBe(false);
  });

  it("is false when there is plenty left", () => {
    expect(needsRestock(stock(1, 30))).toBe(false);
  });

  it("is always true when out, whatever the estimate or threshold", () => {
    fc.assert(
      fc.property(fc.option(fc.integer({ min: 0, max: 365 }), { nil: null }), fc.integer({ min: 0, max: 365 }), (days, threshold) => {
        expect(needsRestock(stock(0, days, threshold))).toBe(true);
      }),
    );
  });

  it("flips exactly at the threshold when stock remains", () => {
    fc.assert(
      fc.property(positive, fc.integer({ min: 0, max: 365 }), fc.integer({ min: 0, max: 365 }), (quantity, days, threshold) => {
        expect(needsRestock(stock(quantity, days, threshold))).toBe(days <= threshold);
      }),
    );
  });
});

describe("groceryAction", () => {
  const entries = [null, { addedBy: "auto" as const }, { addedBy: "manual" as const }];

  it("adds a needed item that has no open entry", () => {
    expect(groceryAction(true, null)).toBe("add");
  });

  it("keeps an open entry for a needed item", () => {
    expect(groceryAction(true, { addedBy: "auto" })).toBe("keep");
    expect(groceryAction(true, { addedBy: "manual" })).toBe("keep");
  });

  it("removes an auto entry once the item is no longer needed", () => {
    expect(groceryAction(false, { addedBy: "auto" })).toBe("remove");
  });

  it("keeps a manual entry when the item is no longer needed", () => {
    expect(groceryAction(false, { addedBy: "manual" })).toBe("keep");
  });

  it("does nothing when nothing is needed and nothing is open", () => {
    expect(groceryAction(false, null)).toBe("keep");
  });

  it("never removes a manual entry and never adds a second open entry", () => {
    fc.assert(
      fc.property(fc.boolean(), fc.constantFrom(...entries), (needed, entry) => {
        const action = groceryAction(needed, entry);
        if (entry?.addedBy === "manual") expect(action).not.toBe("remove");
        if (entry !== null) expect(action).not.toBe("add");
      }),
    );
  });
});

describe("effectiveEstimate", () => {
  it("is null with no estimate at all", () => {
    expect(effectiveEstimate({ daysPerUnitEntered: null, daysPerUnitLearned: null })).toBeNull();
  });

  it("uses the entered estimate when nothing is learned", () => {
    expect(effectiveEstimate({ daysPerUnitEntered: 30, daysPerUnitLearned: null })).toEqual({
      daysPerUnit: 30,
      source: "entered",
    });
  });

  it("prefers the learned estimate", () => {
    expect(effectiveEstimate({ daysPerUnitEntered: 30, daysPerUnitLearned: 20 })).toEqual({
      daysPerUnit: 20,
      source: "learned",
    });
  });

  it("uses a learned estimate even without an entered one", () => {
    expect(effectiveEstimate({ daysPerUnitEntered: null, daysPerUnitLearned: 20 })).toEqual({
      daysPerUnit: 20,
      source: "learned",
    });
  });
});
