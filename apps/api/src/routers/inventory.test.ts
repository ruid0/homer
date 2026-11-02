import { describe, expect, it } from "vitest";
import { createDb } from "../db/client";
import { createCaller } from "./index";

const setup = () => createCaller({ db: createDb(":memory:") });

const milk = { name: "Milk", unit: "litre", quantity: 1, daysPerUnit: 2, lowThresholdDays: 7 };
const salt = { name: "Salt", unit: "bag", quantity: 1, daysPerUnit: null, lowThresholdDays: 7 };

describe("inventory.list", () => {
  it("shows milk at 1 litre lasting 2 days per litre as running out in 2 days", async () => {
    const api = setup();
    await api.inventory.create(milk);
    const [item] = await api.inventory.list();
    expect(item).toMatchObject({
      name: "Milk",
      daysRemaining: 2,
      runningLow: true,
      estimateSource: "entered",
      usualRestock: null,
    });
  });

  it("shows no estimate instead of guessing", async () => {
    const api = setup();
    await api.inventory.create(salt);
    const [item] = await api.inventory.list();
    expect(item).toMatchObject({ daysRemaining: null, runningLow: false, estimateSource: null });
  });

  it("does not flag an item that lasts longer than its threshold", async () => {
    const api = setup();
    await api.inventory.create({ ...milk, daysPerUnit: 30 });
    const [item] = await api.inventory.list();
    expect(item).toMatchObject({ daysRemaining: 30, runningLow: false });
  });
});

describe("inventory.create", () => {
  it("rejects invalid input", async () => {
    const api = setup();
    await expect(api.inventory.create({ ...milk, name: " " })).rejects.toMatchObject({ code: "BAD_REQUEST" });
    expect(await api.inventory.list()).toHaveLength(0);
  });

  it("rejects an active item with the same name in another case", async () => {
    const api = setup();
    await api.inventory.create(milk);
    await expect(api.inventory.create({ ...milk, name: "milk" })).rejects.toMatchObject({ code: "CONFLICT" });
  });
});

describe("inventory.update", () => {
  it("changes the entered estimate and threshold", async () => {
    const api = setup();
    const created = await api.inventory.create(milk);
    await api.inventory.update({ id: created.id, ...milk, daysPerUnit: 4, lowThresholdDays: 3 });
    const [item] = await api.inventory.list();
    expect(item).toMatchObject({ daysRemaining: 4, lowThresholdDays: 3, runningLow: false });
  });

  it("fails for an item that does not exist", async () => {
    const api = setup();
    await expect(api.inventory.update({ id: 99, ...milk })).rejects.toMatchObject({ code: "NOT_FOUND" });
  });
});

describe("inventory.restock", () => {
  it("adds to the quantity, updates days remaining and records the restock", async () => {
    const api = setup();
    const { id } = await api.inventory.create(milk);
    await api.inventory.restock({ itemId: id, quantity: 4 });
    const [item] = await api.inventory.list();
    expect(item).toMatchObject({ quantity: 5, daysRemaining: 10, usualRestock: 4 });
    expect(await api.inventory.history({ id: id })).toHaveLength(1);
  });

  it("uses the latest restock as the usual amount", async () => {
    const api = setup();
    const { id } = await api.inventory.create(milk);
    await api.inventory.restock({ itemId: id, quantity: 4 });
    await api.inventory.restock({ itemId: id, quantity: 2 });
    const [item] = await api.inventory.list();
    expect(item?.usualRestock).toBe(2);
  });

  it("rejects a zero quantity and writes nothing", async () => {
    const api = setup();
    const { id } = await api.inventory.create(milk);
    await expect(api.inventory.restock({ itemId: id, quantity: 0 })).rejects.toMatchObject({ code: "BAD_REQUEST" });
    expect(await api.inventory.history({ id: id })).toHaveLength(0);
  });

  it("fails for an unknown item and writes nothing", async () => {
    const api = setup();
    await expect(api.inventory.restock({ itemId: 99, quantity: 1 })).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect(await api.inventory.history({ id: 99 })).toHaveLength(0);
  });

  it("fails for an archived item", async () => {
    const api = setup();
    const { id } = await api.inventory.create(milk);
    await api.inventory.archive({ id });
    await expect(api.inventory.restock({ itemId: id, quantity: 1 })).rejects.toMatchObject({ code: "NOT_FOUND" });
  });
});

describe("inventory.markOut", () => {
  it("sets the quantity to zero", async () => {
    const api = setup();
    const { id } = await api.inventory.create(milk);
    await api.inventory.markOut({ id });
    const [item] = await api.inventory.list();
    expect(item).toMatchObject({ quantity: 0, daysRemaining: 0, runningLow: true });
  });

  it("fails for an unknown item", async () => {
    await expect(setup().inventory.markOut({ id: 99 })).rejects.toMatchObject({ code: "NOT_FOUND" });
  });
});

describe("inventory.archive and history", () => {
  it("hides the item from the list but keeps its history", async () => {
    const api = setup();
    const { id } = await api.inventory.create(milk);
    await api.inventory.restock({ itemId: id, quantity: 4 });
    await api.inventory.archive({ id });
    expect(await api.inventory.list()).toHaveLength(0);
    expect(await api.inventory.history({ id: id })).toHaveLength(1);
  });

  it("lets a new item reuse an archived name with its own history", async () => {
    const api = setup();
    const old = await api.inventory.create(milk);
    await api.inventory.archive({ id: old.id });
    const fresh = await api.inventory.create(milk);
    expect(fresh.id).not.toBe(old.id);
    expect(await api.inventory.history({ id: fresh.id })).toHaveLength(0);
  });

  it("returns history newest first", async () => {
    const api = setup();
    const { id } = await api.inventory.create(milk);
    await api.inventory.restock({ itemId: id, quantity: 1 });
    await api.inventory.restock({ itemId: id, quantity: 2 });
    const quantities = (await api.inventory.history({ id: id })).map((row) => row.quantity);
    expect(quantities).toEqual([2, 1]);
  });
});
