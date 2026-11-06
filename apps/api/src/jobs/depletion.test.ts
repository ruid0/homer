import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { createDb } from "../db/client";
import { groceryEntries, items } from "../db/schema";
import { createCaller } from "../routers";
import { depleteAll, startDepletion } from "./depletion";

const today = "2026-11-05";

const withItem = (values: Partial<typeof items.$inferInsert> = {}) => {
  const db = createDb(":memory:");
  const [row] = db
    .insert(items)
    .values({ name: "Item A", unit: "bag", quantity: 2, daysPerUnitEntered: 10, depletedOn: "2026-11-02", ...values })
    .returning()
    .all();
  const read = () => db.select().from(items).where(eq(items.id, row!.id)).get()!;
  return { db, read, id: row!.id };
};

describe("depleteAll", () => {
  it("takes the days that passed off the quantity and stamps the day", () => {
    const { db, read } = withItem();
    expect(depleteAll(db, today)).toBe(1);
    expect(read()).toMatchObject({ quantity: 1.7, depletedOn: today });
  });

  it("does nothing a second time on the same day", () => {
    const { db, read } = withItem();
    depleteAll(db, today);
    expect(depleteAll(db, today)).toBe(0);
    expect(read().quantity).toBe(1.7);
  });

  it("catches up several missed days in one go", () => {
    const { db, read } = withItem({ depletedOn: "2026-10-26" });
    depleteAll(db, today);
    expect(read().quantity).toBe(1);
  });

  it("uses the learned estimate over the entered one", () => {
    const { db, read } = withItem({ daysPerUnitLearned: 5 });
    depleteAll(db, today);
    expect(read().quantity).toBe(1.4);
  });

  it("only stamps the day for an item with no estimate", () => {
    const { db, read } = withItem({ daysPerUnitEntered: null });
    expect(depleteAll(db, today)).toBe(0);
    expect(read()).toMatchObject({ quantity: 2, depletedOn: today });
  });

  it("stamps an item with no date and takes nothing off", () => {
    const { db, read } = withItem({ depletedOn: null });
    depleteAll(db, today);
    expect(read()).toMatchObject({ quantity: 2, depletedOn: today });
  });

  it("never goes below zero and puts an item that ran out on the grocery list", () => {
    const { db, read, id } = withItem({ quantity: 0.2 });
    depleteAll(db, today);
    expect(read().quantity).toBe(0);
    expect(db.select().from(groceryEntries).where(eq(groceryEntries.itemId, id)).all()).toMatchObject([
      { addedBy: "auto", boughtAt: null, removedAt: null },
    ]);
  });

  it("puts an item that became low on the list while it still has some left", () => {
    const { db, id } = withItem({ quantity: 1, daysPerUnitEntered: 10, depletedOn: "2026-11-02", lowThresholdDays: 7 });
    depleteAll(db, today);
    expect(db.select().from(groceryEntries).where(eq(groceryEntries.itemId, id)).all()).toHaveLength(1);
  });

  it("leaves archived items alone", () => {
    const { db, read } = withItem({ archivedAt: "2026-11-01T00:00:00.000Z" });
    depleteAll(db, today);
    expect(read()).toMatchObject({ quantity: 2, depletedOn: "2026-11-02" });
  });
});

describe("depleteAll with other changes", () => {
  it("does not charge a restock twice, and a restock keeps what it added", async () => {
    const { db, read, id } = withItem();
    depleteAll(db, "2026-11-03"); // 1 day: 2 -> 1.9
    await createCaller({ db }).inventory.restock({ itemId: id, quantity: 3 });
    depleteAll(db, "2026-11-04"); // 1 more day: 4.9 -> 4.8
    expect(read().quantity).toBe(4.8);
  });

  it("does not take the days an item was archived off a restored item", async () => {
    const { db, read, id } = withItem({ depletedOn: "2026-08-01" });
    const api = createCaller({ db });
    await api.inventory.archive({ id });
    depleteAll(db, today);
    await api.inventory.restore({ id, name: "Item A", unit: "bag", quantity: 2, daysPerUnit: 10, lowThresholdDays: 7 });
    depleteAll(db, today);
    expect(read().quantity).toBe(2);
  });

  it("clamps a date in the future to no days instead of adding stock", () => {
    const { db, read } = withItem({ depletedOn: "2026-12-01" });
    depleteAll(db, today);
    expect(read().quantity).toBe(2);
  });

  it("puts nothing on the list for stock the run did not change", () => {
    const { db } = withItem({ quantity: 0, daysPerUnitEntered: 10, depletedOn: "2026-11-02" });
    depleteAll(db, today);
    expect(db.select().from(groceryEntries).all()).toHaveLength(0);
  });

  it("rolls everything back when one item fails", () => {
    const { db, read } = withItem();
    db.$client.exec("create trigger fail_update before update on items begin select raise(abort, 'no'); end");
    expect(() => depleteAll(db, today)).toThrow();
    expect(read()).toMatchObject({ quantity: 2, depletedOn: "2026-11-02" });
  });
});

describe("startDepletion", () => {
  it("applies missed days at once and returns the schedule", () => {
    const { db, read } = withItem();
    const logged: string[] = [];
    const task = startDepletion(db, { time: "05:30", now: () => new Date(2026, 10, 5, 9), log: (m) => logged.push(m) });
    expect(task).not.toBeNull();
    void task?.stop();
    expect(read()).toMatchObject({ quantity: 1.7, depletedOn: today });
    expect(logged).toEqual(["daily usage applied, 1 items changed"]);
  });

  it("logs and carries on when the time is invalid", () => {
    const logged: string[] = [];
    expect(startDepletion(createDb(":memory:"), { time: "soon", log: (m) => logged.push(m) })).toBeNull();
    expect(logged[0]).toMatch(/DEPLETION_TIME/);
  });
});
