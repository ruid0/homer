import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
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

  it("records that it ran in user_version", () => {
    const { db } = setup();
    backfillGrocery(db);
    expect(db.$client.pragma("user_version", { simple: true })).toBe(1);
  });

  it("adds no second entry if it runs again before the marker was saved", async () => {
    const { db, api } = setup();
    db.insert(items).values({ ...base, name: "Rice", quantity: 0 }).run();
    backfillGrocery(db);
    db.$client.pragma("user_version = 0");
    expect(backfillGrocery(db)).toBe(true);
    expect(await api.groceries.list()).toHaveLength(1);
  });

  it("stays done after the file is closed and opened again", () => {
    const path = join(mkdtempSync(join(tmpdir(), "homer-backfill-")), "homer-test.sqlite");
    const first = createDb(path);
    first.insert(items).values({ ...base, name: "Rice", quantity: 0 }).run();
    expect(backfillGrocery(first)).toBe(true);
    first.$client.close();
    expect(backfillGrocery(createDb(path))).toBe(false);
  });
});
