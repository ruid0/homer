import { describe, expect, it } from "vitest";
import { itemInputSchema, restockInputSchema } from "./schemas";

const valid = { name: "Milk", unit: "litre", quantity: 1, daysPerUnit: 2, lowThresholdDays: 7 };

describe("itemInputSchema", () => {
  it("accepts a complete item", () => {
    expect(itemInputSchema.parse(valid)).toEqual(valid);
  });

  it("accepts no usage estimate", () => {
    expect(itemInputSchema.parse({ ...valid, daysPerUnit: null }).daysPerUnit).toBeNull();
  });

  it("defaults the threshold to 7 days", () => {
    const { lowThresholdDays: _, ...rest } = valid;
    expect(itemInputSchema.parse(rest).lowThresholdDays).toBe(7);
  });

  it("trims the name and unit", () => {
    const parsed = itemInputSchema.parse({ ...valid, name: "  Milk ", unit: " litre " });
    expect([parsed.name, parsed.unit]).toEqual(["Milk", "litre"]);
  });

  it.each([
    ["empty name", { name: " " }],
    ["empty unit", { unit: "" }],
    ["negative quantity", { quantity: -1 }],
    ["zero days per unit", { daysPerUnit: 0 }],
    ["negative days per unit", { daysPerUnit: -3 }],
    ["negative threshold", { lowThresholdDays: -1 }],
  ])("rejects %s", (_label, patch) => {
    expect(itemInputSchema.safeParse({ ...valid, ...patch }).success).toBe(false);
  });
});

describe("restockInputSchema", () => {
  it("accepts a positive quantity", () => {
    expect(restockInputSchema.parse({ itemId: 1, quantity: 4 })).toEqual({ itemId: 1, quantity: 4 });
  });

  it.each([0, -2])("rejects quantity %s", (quantity) => {
    expect(restockInputSchema.safeParse({ itemId: 1, quantity }).success).toBe(false);
  });
});
