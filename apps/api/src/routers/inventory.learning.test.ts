import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { journalled, undoAction } from "../ai/journal";
import { createDb } from "../db/client";
import { assistantActions, restocks } from "../db/schema";
import { createCaller } from "./index";

const DAY = 86_400_000;
const daysAgo = (days: number) => new Date(Date.now() - days * DAY).toISOString();

const setup = () => {
  const db = createDb(":memory:");
  return { db, api: createCaller({ db }) };
};

const salt = { name: "Salt", unit: "bag", quantity: 1, daysPerUnit: 30, lowThresholdDays: 7 };

// A shelf that was restocked a bag every 20 days: three trips in the past, the fourth is made through the api.
const withHistory = async () => {
  const { db, api } = setup();
  const { id } = await api.inventory.create(salt);
  db.insert(restocks)
    .values([60, 40, 20].map((days) => ({ itemId: id, quantity: 1, restockedAt: daysAgo(days) })))
    .run();
  return { db, api, id };
};

const only = async (api: ReturnType<typeof setup>["api"]) => (await api.inventory.list())[0]!;

describe("learned usage", () => {
  it("switches from the entered 30 days to a learned estimate near 20 and says so", async () => {
    const { api, id } = await withHistory();
    await api.inventory.restock({ itemId: id, quantity: 1 });
    const item = await only(api);
    expect(item.estimateSource).toBe("learned");
    expect(item.daysPerUnitLearned).toBeCloseTo(20, 0);
    expect(item.learnedFrom).toBe(4);
    // Two bags on the shelf now, at about 20 days each.
    expect(item.daysRemaining).toBeGreaterThanOrEqual(39);
    expect(item.daysRemaining).toBeLessThanOrEqual(40);
  });

  it("keeps the entered estimate until there is enough history", async () => {
    const { api } = setup();
    const { id } = await api.inventory.create(salt);
    await api.inventory.restock({ itemId: id, quantity: 1 });
    await api.inventory.restock({ itemId: id, quantity: 1 });
    expect(await only(api)).toMatchObject({ estimateSource: "entered", learnedFrom: null, daysPerUnitLearned: null });
  });

  it("learns when a grocery entry is marked bought too", async () => {
    const { db, api } = setup();
    const { id } = await api.inventory.create({ ...salt, quantity: 0 });
    db.insert(restocks)
      .values([60, 40, 20].map((days) => ({ itemId: id, quantity: 1, restockedAt: daysAgo(days) })))
      .run();
    const [entry] = await api.groceries.list();
    await api.groceries.markBought({ id: entry!.id, quantity: 1 });
    expect(await only(api)).toMatchObject({ estimateSource: "learned", learnedFrom: 4 });
  });

  it("forgets the learned estimate when the entered number is edited, and learns again from that moment", async () => {
    const { api, id } = await withHistory();
    await api.inventory.restock({ itemId: id, quantity: 1 });
    await api.inventory.update({ id, ...salt, quantity: 2, daysPerUnit: 25 });
    expect(await only(api)).toMatchObject({ estimateSource: "entered", daysPerUnitLearned: null, learnedFrom: null });
    // The old history no longer counts: one more restock is not enough to learn from.
    await api.inventory.restock({ itemId: id, quantity: 1 });
    expect(await only(api)).toMatchObject({ estimateSource: "entered", learnedFrom: null });
  });

  it("keeps the learned estimate when something else about the item is edited", async () => {
    const { api, id } = await withHistory();
    await api.inventory.restock({ itemId: id, quantity: 1 });
    await api.inventory.update({ id, ...salt, quantity: 2, daysPerUnit: 30, lowThresholdDays: 5 });
    expect(await only(api)).toMatchObject({ estimateSource: "learned", learnedFrom: 4 });
  });

  it("goes back to the entered estimate when Undo takes the restock away", async () => {
    const { db, api, id } = await withHistory();
    const done = await journalled(db, "restock_item", {}, () => api.inventory.restock({ itemId: id, quantity: 1 }));
    expect((await only(api)).estimateSource).toBe("learned");
    expect(undoAction(db, done.actionId!).ok).toBe(true);
    expect(await only(api)).toMatchObject({ estimateSource: "entered", daysPerUnitLearned: null, learnedFrom: null });
  });

  it("starts learning over when an archived item comes back with a different number", async () => {
    const { api, id } = await withHistory();
    await api.inventory.restock({ itemId: id, quantity: 1 });
    await api.inventory.archive({ id });
    await api.inventory.restore({ id, ...salt, quantity: 1, daysPerUnit: 25 });
    expect(await only(api)).toMatchObject({ estimateSource: "entered", daysPerUnitLearned: null, learnedFrom: null });
  });

  it("keeps what was learned when an archived item comes back with the same number", async () => {
    const { api, id } = await withHistory();
    await api.inventory.restock({ itemId: id, quantity: 1 });
    await api.inventory.archive({ id });
    await api.inventory.restore({ id, ...salt, quantity: 1 });
    expect(await only(api)).toMatchObject({ estimateSource: "learned", learnedFrom: 4 });
  });

  it("can still undo an action recorded before the learning column existed", async () => {
    const { db, api, id } = await withHistory();
    const done = await journalled(db, "restock_item", {}, () => api.inventory.restock({ itemId: id, quantity: 1 }));
    // Older actions stored item rows without learningSince.
    const stored = db.select().from(assistantActions).where(eq(assistantActions.id, done.actionId!)).get()!;
    const strip = (rows: Record<string, unknown>[]) => rows.map(({ learningSince: _gone, ...rest }) => rest);
    const changes = stored.changes as { items: { added: Record<string, unknown>[]; changed: { before: Record<string, unknown>; after: Record<string, unknown> }[]; removed: Record<string, unknown>[] } };
    const old = {
      ...changes,
      items: {
        added: strip(changes.items.added),
        removed: strip(changes.items.removed),
        changed: changes.items.changed.map(({ before, after }) => ({ before: strip([before])[0]!, after: strip([after])[0]! })),
      },
    };
    db.update(assistantActions).set({ changes: old }).where(eq(assistantActions.id, done.actionId!)).run();
    expect(undoAction(db, done.actionId!).ok).toBe(true);
    expect(await only(api)).toMatchObject({ estimateSource: "entered" });
  });
});
