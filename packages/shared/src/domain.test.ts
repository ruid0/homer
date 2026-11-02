import { describe, expect, it } from "vitest";
import fc from "fast-check";
import { daysRemaining, effectiveEstimate, isRunningLow } from "./domain";

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
