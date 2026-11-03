import { describe, expect, it } from "vitest";
import { createDb } from "../db/client";
import { groceryEntries, items } from "../db/schema";
import { createCaller } from "../routers";
import { backfillGrocery } from "./backfill";

const setup = () => {
  const db = createDb(":memory:");
  return { db, api: createCaller({ db }) };
};

const base = { unit: "bag", lowThresholdDays: 7 };

describe("backfillGrocery", () => {
  it("lists low and out items that were never synced, and nothing else", () => {
    const { db } = setup();
    db.insert(items).values([
      { ...base, name: "Milk", quantity: 1, daysPerUnitEntered: 2 },
      { ...base, name: "Rice", quantity: 0 },
      { ...base, name: "Flour", quantity: 5, daysPerUnitEntered: 30 },
      { ...base, name: "Salt", quantity: 4 },
      { ...base, name: "Old", quantity: 0, archivedAt: "2026-01-01T00:00:00.000Z" },
    ]).run();
    expect(backfillGrocery(db)).toBe(true);
    const names = db.select().from(groceryEntries).all().map((entry) => entry.text).sort();
    expect(names).toEqual(["Milk", "Rice"]);
  });

  it("leaves a manual entry alone", async () => {
    const { db, api } = setup();
    const { id } = db.insert(items).values({ ...base, name: "Rice", quantity: 5 }).returning().get();
    await api.groceries.add({ itemId: id });
    backfillGrocery(db);
    expect(await api.groceries.list()).toMatchObject([{ itemId: id, addedBy: "manual" }]);
  });

  it("runs once, so an entry removed afterwards stays removed", async () => {
    const { db, api } = setup();
    db.insert(items).values({ ...base, name: "Rice", quantity: 0 }).run();
    backfillGrocery(db);
    const [entry] = await api.groceries.list();
    await api.groceries.remove({ id: entry!.id });
    expect(backfillGrocery(db)).toBe(false);
    expect(await api.groceries.list()).toEqual([]);
  });

  it("marks a fresh database as done", () => {
    const { db } = setup();
    expect(backfillGrocery(db)).toBe(true);
    expect(backfillGrocery(db)).toBe(false);
  });
});
