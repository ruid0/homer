import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { learnDaysPerUnit, LEARN_WINDOW } from "./learn";

const DAY = 86_400_000;
const start = Date.parse("2026-01-01T09:00:00.000Z");
const at = (days: number) => new Date(start + days * DAY).toISOString();
const restock = (days: number, quantity = 1) => ({ quantity, restockedAt: at(days) });
// One restock every `every` days, `count` of them.
const regular = (count: number, every: number, quantity = 1) => Array.from({ length: count }, (_, index) => restock(index * every, quantity));

describe("learnDaysPerUnit", () => {
  it("learns 20 days per bag from a bag every 20 days", () => {
    expect(learnDaysPerUnit(regular(4, 20))).toEqual({ daysPerUnit: 20, restocks: 4 });
  });

  it("uses the amount bought, not the number of trips", () => {
    expect(learnDaysPerUnit(regular(4, 20, 2))).toEqual({ daysPerUnit: 10, restocks: 4 });
  });

  it("needs at least three restocks", () => {
    expect(learnDaysPerUnit(regular(2, 30))).toBeNull();
    expect(learnDaysPerUnit([])).toBeNull();
  });

  it("needs the restocks to span two weeks", () => {
    expect(learnDaysPerUnit([restock(0), restock(3), restock(6)])).toBeNull();
    expect(learnDaysPerUnit([restock(0), restock(7), restock(14)])).not.toBeNull();
  });

  it("counts two restocks less than a day apart as one trip, with both amounts added", () => {
    const sameTrip = [restock(0), restock(20), { quantity: 1, restockedAt: at(20.2) }, restock(40)];
    // 40 days over the 1 + 2 bought before the last trip.
    expect(learnDaysPerUnit(sameTrip)).toEqual({ daysPerUnit: 13.33, restocks: 3 });
  });

  it("looks only at the most recent restocks, so a change in habits shows", () => {
    const old = regular(5, 40);
    const recent = Array.from({ length: LEARN_WINDOW }, (_, index) => restock(200 + index * 10));
    expect(learnDaysPerUnit([...old, ...recent])).toEqual({ daysPerUnit: 10, restocks: LEARN_WINDOW });
  });

  it("gives nothing for a quantity that cannot be divided by", () => {
    expect(learnDaysPerUnit([restock(0, 0), restock(20, 0), restock(40, 1)])).toBeNull();
  });

  it("ends a trip a day after its first restock, so a chain of taps does not stretch one trip", () => {
    const hours = (count: number) => ({ quantity: 1, restockedAt: new Date(start + count * 3_600_000).toISOString() });
    // 0h and 20h are one trip, 40h starts another: with 20 days either side that is 3 trips.
    const rows = [hours(0), hours(20), hours(40), restock(20), restock(40)];
    expect(learnDaysPerUnit(rows)?.restocks).toBe(4);
    expect(learnDaysPerUnit([hours(0), hours(24), restock(20), restock(40)])?.restocks).toBe(4);
    expect(learnDaysPerUnit([hours(0), hours(23.9), restock(20), restock(40)])?.restocks).toBe(3);
  });

  it("merges restocks with the same time", () => {
    expect(learnDaysPerUnit([restock(0), restock(0), restock(20), restock(40)])?.restocks).toBe(3);
  });

  it("applies the window to trips, not to raw restocks", () => {
    const taps = Array.from({ length: 8 }, (_, index) => ({ quantity: 1, restockedAt: new Date(start + index * 3_600_000).toISOString() }));
    // Eight taps in one morning are one trip, so the older trips are still inside the window of six.
    expect(learnDaysPerUnit([restock(-100), restock(-60), restock(-20), ...taps])?.restocks).toBe(4);
  });

  it("skips rows it cannot use and still learns from the rest", () => {
    const rows = [
      ...regular(4, 20),
      { quantity: 1, restockedAt: "not a date" },
      { quantity: -5, restockedAt: at(30) },
      { quantity: 0, restockedAt: at(35) },
    ];
    expect(learnDaysPerUnit(rows)).toEqual({ daysPerUnit: 20, restocks: 4 });
  });

  it("gives nothing for a result no item could have, or one that rounds to nothing", () => {
    expect(learnDaysPerUnit([restock(0, 1), restock(4000, 1), restock(8000, 1)])).toBeNull();
    expect(learnDaysPerUnit([restock(0, 3000), restock(7, 3000), restock(14, 3000)])).toBeNull();
  });

  it("always answers with a positive, finite number when there is enough history", () => {
    const history = fc
      .tuple(fc.uniqueArray(fc.integer({ min: 2, max: 400 }), { minLength: 2, maxLength: 10 }), fc.double({ min: 0.5, max: 20, noNaN: true }))
      .map(([days, quantity]) => [0, ...days].map((day) => restock(day, quantity)));
    fc.assert(
      fc.property(history, (rows) => {
        const span = Math.max(...rows.map(({ restockedAt }) => Date.parse(restockedAt))) - start;
        const learned = learnDaysPerUnit(rows);
        // Recent trips can still be too few days apart to learn from; when it does answer it is a real number.
        if (learned === null) return span < 0 || rows.length >= 3;
        expect(learned.daysPerUnit).toBeGreaterThan(0);
        expect(Number.isFinite(learned.daysPerUnit)).toBe(true);
      }),
    );
  });

  it("does not depend on the order the restocks come in", () => {
    const rows = fc.array(
      fc.record({ day: fc.integer({ min: 0, max: 300 }), quantity: fc.double({ min: 0, max: 10, noNaN: true }) }),
      { maxLength: 10 },
    );
    fc.assert(
      fc.property(rows, (generated) => {
        const history = generated.map(({ day, quantity }) => restock(day, quantity));
        expect(learnDaysPerUnit([...history].reverse())).toEqual(learnDaysPerUnit(history));
        expect(learnDaysPerUnit([...history].sort((a, b) => a.quantity - b.quantity))).toEqual(learnDaysPerUnit(history));
      }),
    );
  });

  it("halves the days when twice as much is bought over the same time", () => {
    fc.assert(
      fc.property(fc.integer({ min: 15, max: 60 }), fc.integer({ min: 1, max: 5 }), (every, quantity) => {
        const single = learnDaysPerUnit(regular(4, every, quantity))!;
        const double = learnDaysPerUnit(regular(4, every, quantity * 2))!;
        expect(double.daysPerUnit).toBeCloseTo(single.daysPerUnit / 2, 1);
      }),
    );
  });
});
