import { describe, expect, it } from "vitest";
import { createDb } from "../db/client";
import { groceryEntries } from "../db/schema";
import { createCaller } from "./index";

const setup = () => {
  const db = createDb(":memory:");
  return { db, api: createCaller({ db }) };
};

const milk = { name: "Milk", unit: "litre", quantity: 1, daysPerUnit: 2, lowThresholdDays: 7 };
const rice = { name: "Rice", unit: "bag", quantity: 1, daysPerUnit: 30, lowThresholdDays: 7 };

describe("groceries.list", () => {
  it("is empty when nothing is needed", async () => {
    const { api } = setup();
    await api.inventory.create(rice);
    expect(await api.groceries.list()).toEqual([]);
  });

  it("shows low milk with its unit", async () => {
    const { api } = setup();
    const item = await api.inventory.create(milk);
    expect(await api.groceries.list()).toMatchObject([
      { itemId: item.id, text: "Milk", addedBy: "auto", unit: "litre", usualRestock: null },
    ]);
  });

  it("shows the usual restock amount for a tracked item", async () => {
    const { api } = setup();
    const { id } = await api.inventory.create(rice);
    await api.inventory.restock({ itemId: id, quantity: 3 });
    await api.inventory.markOut({ id });
    expect(await api.groceries.list()).toMatchObject([{ itemId: id, usualRestock: 3, quantity: 3 }]);
  });

  it("lists automatic entries before manual ones, then oldest first", async () => {
    const { api } = setup();
    await api.groceries.add({ text: "charcoal" });
    await api.groceries.add({ text: "candles" });
    await api.inventory.create(milk);
    const texts = (await api.groceries.list()).map((entry) => entry.text);
    expect(texts).toEqual(["Milk", "charcoal", "candles"]);
  });
});

describe("groceries.add", () => {
  it("adds free text by hand", async () => {
    const { api } = setup();
    await api.groceries.add({ text: "  charcoal ", quantity: 2 });
    expect(await api.groceries.list()).toMatchObject([
      { itemId: null, text: "charcoal", quantity: 2, addedBy: "manual", unit: null },
    ]);
  });

  it("rejects blank text and a zero quantity", async () => {
    const { api } = setup();
    await expect(api.groceries.add({ text: "   " })).rejects.toMatchObject({ code: "BAD_REQUEST" });
    await expect(api.groceries.add({ text: "salt", quantity: 0 })).rejects.toMatchObject({ code: "BAD_REQUEST" });
    expect(await api.groceries.list()).toEqual([]);
  });

  it("links text that matches a tracked item, ignoring case", async () => {
    const { api } = setup();
    const { id } = await api.inventory.create(rice);
    await api.groceries.add({ text: "RICE" });
    expect(await api.groceries.list()).toMatchObject([{ itemId: id, text: "Rice", addedBy: "manual", unit: "bag" }]);
  });

  it("adds a tracked item by id", async () => {
    const { api } = setup();
    const { id } = await api.inventory.create(rice);
    await api.groceries.add({ itemId: id, quantity: 2 });
    expect(await api.groceries.list()).toMatchObject([{ itemId: id, quantity: 2, addedBy: "manual" }]);
  });

  it("reuses an existing entry and updates its quantity when one is given", async () => {
    const { api } = setup();
    const { id } = await api.inventory.create(milk);
    await api.groceries.add({ itemId: id, quantity: 4 });
    await api.groceries.add({ text: "milk" });
    const entries = await api.groceries.list();
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({ itemId: id, quantity: 4, addedBy: "auto" });
  });

  it("keeps a manual entry for an item that is not low", async () => {
    const { api } = setup();
    const { id } = await api.inventory.create(rice);
    await api.groceries.add({ itemId: id });
    await api.inventory.update({ id, ...rice, quantity: 5 });
    expect(await api.groceries.list()).toHaveLength(1);
  });

  it("fails for an unknown or removed item", async () => {
    const { api } = setup();
    await expect(api.groceries.add({ itemId: 99 })).rejects.toMatchObject({ code: "NOT_FOUND" });
    const { id } = await api.inventory.create(rice);
    await api.inventory.archive({ id });
    await expect(api.groceries.add({ itemId: id })).rejects.toMatchObject({ code: "NOT_FOUND" });
  });
});

describe("groceries.markBought", () => {
  it("restocks a tracked item, takes it off the list and updates days remaining", async () => {
    const { api } = setup();
    const { id } = await api.inventory.create(milk);
    const [entry] = await api.groceries.list();
    await api.groceries.markBought({ id: entry!.id, quantity: 4 });
    expect(await api.groceries.list()).toEqual([]);
    expect(await api.inventory.list()).toMatchObject([{ id, quantity: 5, daysRemaining: 10, usualRestock: 4 }]);
    expect(await api.inventory.history({ id })).toHaveLength(1);
  });

  it("puts the item straight back if what was bought is not enough", async () => {
    const { api } = setup();
    await api.inventory.create(milk);
    const [entry] = await api.groceries.list();
    await api.groceries.markBought({ id: entry!.id, quantity: 1 });
    expect(await api.groceries.list()).toMatchObject([{ text: "Milk", quantity: 1 }]);
  });

  it("needs a quantity for a tracked item and changes nothing without one", async () => {
    const { api } = setup();
    const { id } = await api.inventory.create(milk);
    const [entry] = await api.groceries.list();
    await expect(api.groceries.markBought({ id: entry!.id })).rejects.toMatchObject({ code: "BAD_REQUEST" });
    expect(await api.groceries.list()).toHaveLength(1);
    expect(await api.inventory.history({ id })).toHaveLength(0);
  });

  it("takes free text off the list without a quantity", async () => {
    const { api } = setup();
    await api.groceries.add({ text: "charcoal" });
    const [entry] = await api.groceries.list();
    await api.groceries.markBought({ id: entry!.id });
    expect(await api.groceries.list()).toEqual([]);
  });

  it("restocks only once when two people tap Bought it", async () => {
    const { api } = setup();
    const { id } = await api.inventory.create(milk);
    const [entry] = await api.groceries.list();
    await api.groceries.markBought({ id: entry!.id, quantity: 4 });
    await expect(api.groceries.markBought({ id: entry!.id, quantity: 4 })).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect(await api.inventory.list()).toMatchObject([{ id, quantity: 5 }]);
  });

  it("fails for an unknown entry", async () => {
    await expect(setup().api.groceries.markBought({ id: 99 })).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("leaves the entry open when the item can no longer be restocked", async () => {
    const { api, db } = setup();
    const { id } = await api.inventory.create(rice);
    await api.inventory.archive({ id });
    const [orphan] = db.insert(groceryEntries).values({ itemId: id, text: "Rice", addedBy: "manual" }).returning().all();
    await expect(api.groceries.markBought({ id: orphan!.id, quantity: 2 })).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect(db.select().from(groceryEntries).all()[0]?.boughtAt).toBeNull();
  });
});

describe("groceries.remove", () => {
  it("takes an entry off the list without buying it", async () => {
    const { api } = setup();
    const { id } = await api.inventory.create(milk);
    const [entry] = await api.groceries.list();
    await api.groceries.remove({ id: entry!.id });
    expect(await api.groceries.list()).toEqual([]);
    expect(await api.inventory.list()).toMatchObject([{ id, quantity: 1 }]);
    expect(await api.inventory.history({ id })).toHaveLength(0);
  });

  it("fails for an entry that is already closed", async () => {
    const { api } = setup();
    await api.groceries.add({ text: "charcoal" });
    const [entry] = await api.groceries.list();
    await api.groceries.remove({ id: entry!.id });
    await expect(api.groceries.remove({ id: entry!.id })).rejects.toMatchObject({ code: "NOT_FOUND" });
  });
});
