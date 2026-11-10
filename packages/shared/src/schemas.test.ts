import { describe, expect, it } from "vitest";
import {
  groceryAddInputSchema,
  groceryBoughtInputSchema,
  groceryEntrySchema,
  itemInputSchema,
  restockInputSchema,
} from "./schemas";

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
    ["missing quantity", { quantity: null }],
    ["quantity so large days would overflow", { quantity: 1e308 }],
    ["days per unit so large days would overflow", { daysPerUnit: 1e308 }],
  ])("rejects %s", (_label, patch) => {
    expect(itemInputSchema.safeParse({ ...valid, ...patch }).success).toBe(false);
  });
});

describe("restockInputSchema", () => {
  it("accepts a positive quantity", () => {
    expect(restockInputSchema.parse({ itemId: 1, quantity: 4 })).toEqual({ itemId: 1, quantity: 4 });
  });

  it.each([0, -2, 1e308])("rejects quantity %s", (quantity) => {
    expect(restockInputSchema.safeParse({ itemId: 1, quantity }).success).toBe(false);
  });
});

describe("groceryAddInputSchema", () => {
  it("accepts a tracked item with an optional quantity", () => {
    expect(groceryAddInputSchema.parse({ itemId: 1 })).toEqual({ itemId: 1 });
    expect(groceryAddInputSchema.parse({ itemId: 1, quantity: 2 })).toEqual({ itemId: 1, quantity: 2 });
  });

  it("accepts free text and trims it", () => {
    expect(groceryAddInputSchema.parse({ text: "  charcoal " })).toEqual({ text: "charcoal" });
  });

  it.each([
    ["nothing", {}],
    ["blank text", { text: "   " }],
    ["zero quantity", { text: "salt", quantity: 0 }],
    ["negative quantity", { itemId: 1, quantity: -1 }],
    ["quantity so large it is silly", { text: "salt", quantity: 1e9 }],
  ])("rejects %s", (_label, input) => {
    expect(groceryAddInputSchema.safeParse(input).success).toBe(false);
  });
});

describe("groceryBoughtInputSchema", () => {
  it("accepts an id with or without a quantity", () => {
    expect(groceryBoughtInputSchema.parse({ id: 3 })).toEqual({ id: 3 });
    expect(groceryBoughtInputSchema.parse({ id: 3, quantity: 4 })).toEqual({ id: 3, quantity: 4 });
  });

  it.each([0, -2])("rejects quantity %s", (quantity) => {
    expect(groceryBoughtInputSchema.safeParse({ id: 3, quantity }).success).toBe(false);
  });
});

describe("groceryEntrySchema", () => {
  const entry = {
    id: 1,
    itemId: null,
    text: "charcoal",
    quantity: null,
    addedBy: "manual",
    createdAt: "2026-11-02T10:00:00.000Z",
    boughtAt: null,
    removedAt: null,
  };

  it("accepts a free-text entry", () => {
    expect(groceryEntrySchema.parse(entry)).toEqual(entry);
  });

  it("only allows auto or manual as the source", () => {
    expect(groceryEntrySchema.safeParse({ ...entry, addedBy: "someone" }).success).toBe(false);
  });
});
