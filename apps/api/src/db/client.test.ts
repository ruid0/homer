import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { createDb } from "./client";
import { items, restocks } from "./schema";

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
