import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { createDb } from "./client";
import { groceryEntries, items, people, restocks, routineItems, routineTicks } from "./schema";

const salt = { name: "Salt", unit: "bag", quantity: 1 };

describe("database schema", () => {
  it("applies migrations and applies defaults", () => {
    const db = createDb(":memory:");
    const [row] = db.insert(items).values(salt).returning().all();
    expect(row).toMatchObject({ lowThresholdDays: 7, archivedAt: null, daysPerUnitLearned: null });
    expect(row?.createdAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it("rejects an active item whose name differs only by case", () => {
    const db = createDb(":memory:");
    db.insert(items).values(salt).run();
    expect(() => db.insert(items).values({ ...salt, name: "salt" }).run()).toThrow();
  });

  it("allows reusing the name of an archived item", () => {
    const db = createDb(":memory:");
    const [old] = db.insert(items).values(salt).returning().all();
    db.update(items).set({ archivedAt: new Date().toISOString() }).where(eq(items.id, old!.id)).run();
    expect(() => db.insert(items).values(salt).run()).not.toThrow();
  });

  it("rejects a restock for an item that does not exist", () => {
    const db = createDb(":memory:");
    expect(() => db.insert(restocks).values({ itemId: 99, quantity: 1 }).run()).toThrow();
  });

  it("keeps restocks when an item is archived", () => {
    const db = createDb(":memory:");
    const [item] = db.insert(items).values(salt).returning().all();
    db.insert(restocks).values({ itemId: item!.id, quantity: 2 }).run();
    db.update(items).set({ archivedAt: new Date().toISOString() }).where(eq(items.id, item!.id)).run();
    expect(db.select().from(restocks).where(eq(restocks.itemId, item!.id)).all()).toHaveLength(1);
  });
});

describe("grocery_entries", () => {
  const withItem = () => {
    const db = createDb(":memory:");
    const [item] = db.insert(items).values(salt).returning().all();
    return { db, itemId: item!.id };
  };

  it("applies defaults and leaves an entry open", () => {
    const { db, itemId } = withItem();
    const [row] = db.insert(groceryEntries).values({ itemId, text: "Salt", addedBy: "auto" }).returning().all();
    expect(row).toMatchObject({ quantity: null, boughtAt: null, removedAt: null });
    expect(row?.createdAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it("rejects a second open entry for the same item", () => {
    const { db, itemId } = withItem();
    db.insert(groceryEntries).values({ itemId, text: "Salt", addedBy: "auto" }).run();
    expect(() => db.insert(groceryEntries).values({ itemId, text: "Salt", addedBy: "manual" }).run()).toThrow();
  });

  it("allows a new open entry once the old one is bought or removed", () => {
    const { db, itemId } = withItem();
    const [first] = db.insert(groceryEntries).values({ itemId, text: "Salt", addedBy: "auto" }).returning().all();
    db.update(groceryEntries).set({ boughtAt: new Date().toISOString() }).where(eq(groceryEntries.id, first!.id)).run();
    const [second] = db.insert(groceryEntries).values({ itemId, text: "Salt", addedBy: "auto" }).returning().all();
    db.update(groceryEntries).set({ removedAt: new Date().toISOString() }).where(eq(groceryEntries.id, second!.id)).run();
    expect(() => db.insert(groceryEntries).values({ itemId, text: "Salt", addedBy: "auto" }).run()).not.toThrow();
  });

  it("allows many open free-text entries", () => {
    const db = createDb(":memory:");
    db.insert(groceryEntries).values({ text: "charcoal", addedBy: "manual" }).run();
    expect(() => db.insert(groceryEntries).values({ text: "candles", addedBy: "manual" }).run()).not.toThrow();
  });

  it("rejects an entry for an item that does not exist", () => {
    const db = createDb(":memory:");
    expect(() => db.insert(groceryEntries).values({ itemId: 99, text: "Ghost", addedBy: "auto" }).run()).toThrow();
  });

  it("rejects two people whose names differ only by case", () => {
    const db = createDb(":memory:");
    db.insert(people).values({ name: "Sam" }).run();
    expect(() => db.insert(people).values({ name: "sam" }).run()).toThrow();
  });
});

describe("routine tables", () => {
  const withRow = () => {
    const db = createDb(":memory:");
    const [person] = db.insert(people).values({ name: "Person A" }).returning().all();
    const [row] = db.insert(routineItems).values({ personId: person!.id, name: "Row A", position: 0 }).returning().all();
    return { db, row: row! };
  };

  it("defaults the target to one a day and starts not removed", () => {
    expect(withRow().row).toMatchObject({ targetPerDay: 1, removedAt: null });
  });

  it("allows one tick row per routine row and day", () => {
    const { db, row } = withRow();
    db.insert(routineTicks).values({ routineItemId: row.id, date: "2026-11-05", count: 1 }).run();
    expect(() => db.insert(routineTicks).values({ routineItemId: row.id, date: "2026-11-05", count: 2 }).run()).toThrow();
    expect(() => db.insert(routineTicks).values({ routineItemId: row.id, date: "2026-11-06", count: 2 }).run()).not.toThrow();
  });

  it("rejects a routine row for a person who does not exist, and a tick for a row that does not exist", () => {
    const db = createDb(":memory:");
    expect(() => db.insert(routineItems).values({ personId: 99, name: "Row A", position: 0 }).run()).toThrow();
    expect(() => db.insert(routineTicks).values({ routineItemId: 99, date: "2026-11-05", count: 1 }).run()).toThrow();
  });
});
