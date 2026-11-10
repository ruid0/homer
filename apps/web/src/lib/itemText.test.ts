import { describe, expect, it } from "vitest";
import { describeRunsOut, quantityText, sortByUrgency } from "./itemText";

describe("describeRunsOut", () => {
  it.each([
    [{ quantity: 1, daysRemaining: 2 }, "Runs out in 2 days"],
    [{ quantity: 1, daysRemaining: 1 }, "Runs out in 1 day"],
    [{ quantity: 0.4, daysRemaining: 0 }, "Runs out today"],
    [{ quantity: 3, daysRemaining: null }, "No estimate"],
    [{ quantity: 0, daysRemaining: 0 }, "Ran out"],
    [{ quantity: 0, daysRemaining: null }, "Ran out"],
  ])("%j reads %s", (item, text) => {
    expect(describeRunsOut(item)).toBe(text);
  });
});

describe("sortByUrgency", () => {
  const item = (name: string, quantity: number, daysRemaining: number | null) => ({ name, quantity, daysRemaining });

  it("puts out items first, then fewest days, with no estimate last", () => {
    const sorted = sortByUrgency([
      item("Flour", 2, null),
      item("Rice", 1, 20),
      item("Milk", 1, 2),
      item("Salt", 0, null),
    ]);
    expect(sorted.map((i) => i.name)).toEqual(["Salt", "Milk", "Rice", "Flour"]);
  });

  it("breaks ties by name", () => {
    const sorted = sortByUrgency([item("Tea", 1, 5), item("Coffee", 1, 5)]);
    expect(sorted.map((i) => i.name)).toEqual(["Coffee", "Tea"]);
  });

  it("does not change the input", () => {
    const input = [item("B", 1, 5), item("A", 1, 1)];
    sortByUrgency(input);
    expect(input.map((i) => i.name)).toEqual(["B", "A"]);
  });
});

describe("quantityText", () => {
  it("shows whole numbers as they are and fractions to two decimals", () => {
    expect(quantityText(3)).toBe("3");
    expect(quantityText(1.7)).toBe("1.7");
    expect(quantityText(0.333333)).toBe("0.33");
  });
});
