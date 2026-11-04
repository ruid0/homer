import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { createDb } from "../db/client";
import { groceryEntries, restocks } from "../db/schema";
import { createCaller } from "../routers/index";
import { diffSnapshots, journalled, snapshot, undoAction } from "./journal";

const setup = () => {
  const db = createDb(":memory:");
  return { db, api: createCaller({ db }) };
};

const milk = { name: "Milk", unit: "litre", quantity: 1, daysPerUnit: 2, lowThresholdDays: 7 };

describe("diffSnapshots", () => {
  it("is empty when nothing changed", async () => {
    const { db } = setup();
    const before = snapshot(db);
    expect(diffSnapshots(before, snapshot(db)).items).toEqual({ added: [], changed: [], removed: [] });
  });

  it("reports added and changed rows", async () => {
    const { db, api } = setup();
    const before = snapshot(db);
    const { id } = await api.inventory.create(milk);
    const created = snapshot(db);
    await api.inventory.markOut({ id });
    const changes = diffSnapshots(before, snapshot(db));
    expect(changes.items.added).toHaveLength(1);
    expect(changes.items.added[0]).toMatchObject({ name: "Milk", quantity: 0 });
    expect(diffSnapshots(created, snapshot(db)).items.changed).toHaveLength(1);
  });
});

describe("journalled", () => {
  it("records the tool, its arguments, its result and what changed", async () => {
    const { db, api } = setup();
    const done = await journalled(db, "add_item", { name: "Milk" }, () => api.inventory.create(milk));
    expect(done.actionId).toBeGreaterThan(0);
    expect(done.changed).toBe(true);
  });

  it("records no action when nothing changed", async () => {
    const { db } = setup();
    const done = await journalled(db, "mark_out", { name: "Salt" }, async () => "not tracked");
    expect(done.actionId).toBeNull();
    expect(done.changed).toBe(false);
  });

  it("returns the value of the run", async () => {
    const { db } = setup();
    const done = await journalled(db, "mark_out", {}, async () => 42);
    expect(done.result).toBe(42);
  });
});

describe("undoAction", () => {
  it("puts back a changed row and removes an added one", async () => {
    const { db, api } = setup();
    const { id } = await api.inventory.create(milk);
    const before = snapshot(db);
    const done = await journalled(db, "restock_item", {}, () => api.inventory.restock({ itemId: id, quantity: 4 }));
    expect(snapshot(db)).not.toEqual(before);
    expect(undoAction(db, done.actionId!)).toEqual({ ok: true });
    expect(snapshot(db)).toEqual(before);
  });

  it("puts back rows an action removed", async () => {
    const { db, api } = setup();
    const { id } = await api.tasks.add({ title: "Call plumber", dueDate: null, dueTime: null, repeat: null, personId: null });
    const before = snapshot(db);
    const done = await journalled(db, "complete_task", {}, () => api.tasks.complete({ id, today: "2026-11-04" }));
    expect(undoAction(db, done.actionId!)).toEqual({ ok: true });
    expect(snapshot(db)).toEqual(before);
  });

  it("refuses when a row changed since, and writes nothing", async () => {
    const { db, api } = setup();
    const { id } = await api.inventory.create(milk);
    const done = await journalled(db, "restock_item", {}, () => api.inventory.restock({ itemId: id, quantity: 4 }));
    await api.inventory.markOut({ id });
    const before = snapshot(db);
    const result = undoAction(db, done.actionId!);
    expect(result).toMatchObject({ ok: false, reason: "changed", label: "Milk" });
    expect(snapshot(db)).toEqual(before);
  });

  it("refuses a second undo", async () => {
    const { db, api } = setup();
    const done = await journalled(db, "add_item", {}, () => api.inventory.create(milk));
    undoAction(db, done.actionId!);
    expect(undoAction(db, done.actionId!)).toMatchObject({ ok: false, reason: "undone" });
  });

  it("refuses an action that does not exist", () => {
    const { db } = setup();
    expect(undoAction(db, 99)).toMatchObject({ ok: false, reason: "missing" });
  });
});

describe("undoAction edge cases", () => {
  it("refuses, and writes nothing, when something outside the action now points at a row it added", async () => {
    const { db, api } = setup();
    const done = await journalled(db, "add_item", {}, () => api.inventory.create(milk));
    const [item] = await api.inventory.list();
    await api.inventory.restock({ itemId: item!.id, quantity: 2 });
    const before = snapshot(db);
    expect(undoAction(db, done.actionId!)).toMatchObject({ ok: false, reason: "changed" });
    expect(snapshot(db)).toEqual(before);
  });

  it("puts back a deleted row with its empty fields", async () => {
    const { db, api } = setup();
    await api.groceries.add({ text: "Bread" });
    const before = snapshot(db);
    const done = await journalled(db, "remove", {}, async () => db.delete(groceryEntries).run());
    expect(snapshot(db).groceryEntries).toEqual([]);
    expect(undoAction(db, done.actionId!)).toEqual({ ok: true });
    expect(snapshot(db)).toEqual(before);
  });

  it("puts back a deleted restock under its item", async () => {
    const { db, api } = setup();
    const { id } = await api.inventory.create(milk);
    await api.inventory.restock({ itemId: id, quantity: 3 });
    const before = snapshot(db);
    const done = await journalled(db, "remove", {}, async () => db.delete(restocks).run());
    expect(undoAction(db, done.actionId!)).toEqual({ ok: true });
    expect(snapshot(db)).toEqual(before);
  });

  it("names a restock after its item when it cannot be undone", async () => {
    const { db, api } = setup();
    const { id } = await api.inventory.create(milk);
    const done = await journalled(db, "restock_item", {}, () => api.inventory.restock({ itemId: id, quantity: 3 }));
    db.update(restocks).set({ quantity: 9 }).run();
    expect(undoAction(db, done.actionId!)).toMatchObject({ ok: false, reason: "changed", label: "Milk" });
  });
});

type Op = { kind: "create" | "restock" | "out" | "task" | "complete" | "grocery" | "event"; n: number };

describe("undo restores the tables exactly", () => {
  it("for any sequence of changes, undoing the latest gives back the state before it", async () => {
    const op = fc.record({
      kind: fc.constantFrom<Op["kind"]>("create", "restock", "out", "task", "complete", "grocery", "event"),
      n: fc.integer({ min: 1, max: 5 }),
    });
    await fc.assert(
      fc.asyncProperty(fc.array(op, { minLength: 1, maxLength: 8 }), async (ops) => {
        const { db, api } = setup();
        for (const [index, { kind, n }] of ops.entries()) {
          const [item] = await api.inventory.list();
          const [task] = (await api.schedule.view({ today: "2026-11-04", days: 1 })).days[0]!.tasks;
          const before = snapshot(db);
          const run = async () => {
            if (kind === "create") return api.inventory.create({ ...milk, name: `Item ${n} ${index}` });
            if (kind === "restock" && item) return api.inventory.restock({ itemId: item.id, quantity: n });
            if (kind === "out" && item) return api.inventory.markOut({ id: item.id });
            if (kind === "task") return api.tasks.add({ title: `Task ${n}`, dueDate: "2026-11-04", dueTime: null, repeat: n % 2 ? "daily" : null, personId: null });
            if (kind === "complete" && task) return api.tasks.complete({ id: task.id, today: "2026-11-04" });
            if (kind === "grocery") return api.groceries.add({ text: `Thing ${n}`, quantity: n });
            if (kind === "event") return api.events.add({ title: `Event ${n}`, date: "2026-11-05", time: null, personId: null });
            return null;
          };
          const done = await journalled(db, kind, { kind, n }, run);
          if (done.actionId === null) continue;
          expect(undoAction(db, done.actionId)).toEqual({ ok: true });
          expect(snapshot(db)).toEqual(before);
          await journalled(db, kind, { kind, n }, run);
        }
      }),
      { numRuns: 30 },
    );
  });
});
