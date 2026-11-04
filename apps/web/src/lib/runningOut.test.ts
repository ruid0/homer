import { describe, expect, it } from "vitest";
import { runningOut } from "./runningOut";

const item = (id: number, name: string, quantity: number, daysRemaining: number | null, runningLow: boolean) => ({
  id,
  name,
  quantity,
  daysRemaining,
  runningLow,
});

describe("runningOut", () => {
  it("keeps only items that are running low or out", () => {
    const rows = runningOut(
      [item(1, "Milk", 1, 2, true), item(2, "Rice", 1, 30, false), item(3, "Salt", 4, null, false)],
      new Set(),
    );
    expect(rows.map((row) => row.item.name)).toEqual(["Milk"]);
  });

  it("includes an item at zero even when it has no estimate, and lists it first", () => {
    const rows = runningOut([item(1, "Milk", 1, 2, true), item(2, "Salt", 0, null, false)], new Set());
    expect(rows.map((row) => row.item.name)).toEqual(["Salt", "Milk"]);
  });

  it("orders by days remaining, then by name", () => {
    const rows = runningOut(
      [item(1, "Coffee", 1, 3, true), item(2, "Milk", 1, 2, true), item(3, "Bread", 1, 3, true)],
      new Set(),
    );
    expect(rows.map((row) => row.item.name)).toEqual(["Milk", "Bread", "Coffee"]);
  });

  it("flags the items that are on the grocery list", () => {
    const rows = runningOut([item(1, "Milk", 1, 2, true), item(2, "Coffee", 1, 3, true)], new Set([2]));
    expect(rows.map((row) => row.onList)).toEqual([false, true]);
  });

  it("is empty when nothing is running out", () => {
    expect(runningOut([], new Set())).toEqual([]);
    expect(runningOut([item(1, "Rice", 1, 30, false)], new Set())).toEqual([]);
  });
});
