import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { createDb } from "../db/client";
import { groceryEntries } from "../db/schema";
import { createCaller } from "../routers";

const setup = () => {
  const db = createDb(":memory:");
  const openEntries = () => db.select().from(groceryEntries).all().filter((e) => !e.boughtAt && !e.removedAt);
  return { db, api: createCaller({ db }), openEntries };
};

const milk = { name: "Milk", unit: "litre", quantity: 1, daysPerUnit: 2, lowThresholdDays: 7 };
const plentyOfRice = { name: "Rice", unit: "bag", quantity: 1, daysPerUnit: 30, lowThresholdDays: 7 };
const salt = { name: "Salt", unit: "bag", quantity: 2, daysPerUnit: null, lowThresholdDays: 7 };

describe("auto-adding to the grocery list", () => {
  it("puts milk at 1 litre lasting 2 days per litre on the list when it is created", async () => {
    const { api, openEntries } = setup();
    const item = await api.inventory.create(milk);
    expect(openEntries()).toMatchObject([{ itemId: item.id, text: "Milk", addedBy: "auto", quantity: null }]);
  });

  it("leaves an item with plenty of stock off the list", async () => {
    const { api, openEntries } = setup();
    await api.inventory.create(plentyOfRice);
    expect(openEntries()).toHaveLength(0);
  });

  it("leaves stock with no estimate off the list", async () => {
    const { api, openEntries } = setup();
    await api.inventory.create(salt);
    expect(openEntries()).toHaveLength(0);
  });

  it("puts an item on the list when it is marked out, even with no estimate", async () => {
    const { api, openEntries } = setup();
    const { id } = await api.inventory.create(salt);
    await api.inventory.markOut({ id });
    expect(openEntries()).toMatchObject([{ itemId: id, text: "Salt", addedBy: "auto" }]);
  });

  it("does not add a second entry when marked out twice", async () => {
    const { api, openEntries } = setup();
    const { id } = await api.inventory.create(salt);
    await api.inventory.markOut({ id });
    await api.inventory.markOut({ id });
    expect(openEntries()).toHaveLength(1);
  });

  it("uses the last restock as the suggested quantity", async () => {
    const { api, openEntries } = setup();
    const { id } = await api.inventory.create(plentyOfRice);
    await api.inventory.restock({ itemId: id, quantity: 3 });
    await api.inventory.markOut({ id });
    expect(openEntries()).toMatchObject([{ itemId: id, quantity: 3 }]);
  });

  it("adds an item when an edit makes it low", async () => {
    const { api, openEntries } = setup();
    const { id } = await api.inventory.create(plentyOfRice);
    await api.inventory.update({ id, ...plentyOfRice, daysPerUnit: 2 });
    expect(openEntries()).toMatchObject([{ itemId: id }]);
  });
});

describe("taking an item off the list", () => {
  it("closes the entry when the item is restocked and no longer low", async () => {
    const { api, db, openEntries } = setup();
    const { id } = await api.inventory.create(milk);
    await api.inventory.restock({ itemId: id, quantity: 4 });
    expect(openEntries()).toHaveLength(0);
    const [entry] = db.select().from(groceryEntries).all();
    expect(entry?.boughtAt).toBeTruthy();
    expect(entry?.removedAt).toBeNull();
  });

  it("opens a new entry when a restock still leaves the item low", async () => {
    const { api, db, openEntries } = setup();
    const { id } = await api.inventory.create(milk);
    await api.inventory.restock({ itemId: id, quantity: 1 });
    expect(openEntries()).toHaveLength(1);
    expect(db.select().from(groceryEntries).all()).toHaveLength(2);
  });

  it("closes a manual entry when the item is restocked", async () => {
    const { api, db, openEntries } = setup();
    const { id } = await api.inventory.create(plentyOfRice);
    db.insert(groceryEntries).values({ itemId: id, text: "Rice", addedBy: "manual" }).run();
    await api.inventory.restock({ itemId: id, quantity: 2 });
    expect(openEntries()).toHaveLength(0);
  });

  it("removes an auto entry when an edit gives a longer estimate", async () => {
    const { api, db, openEntries } = setup();
    const { id } = await api.inventory.create(milk);
    await api.inventory.update({ id, ...milk, daysPerUnit: 30 });
    expect(openEntries()).toHaveLength(0);
    const [entry] = db.select().from(groceryEntries).all();
    expect(entry?.removedAt).toBeTruthy();
    expect(entry?.boughtAt).toBeNull();
  });

  it("removes an auto entry when an edit raises the quantity", async () => {
    const { api, openEntries } = setup();
    const { id } = await api.inventory.create(milk);
    await api.inventory.update({ id, ...milk, quantity: 10 });
    expect(openEntries()).toHaveLength(0);
  });

  it("keeps a manual entry when an edit means the item is no longer low", async () => {
    const { api, db, openEntries } = setup();
    const { id } = await api.inventory.create(plentyOfRice);
    db.insert(groceryEntries).values({ itemId: id, text: "Rice", addedBy: "manual" }).run();
    await api.inventory.update({ id, ...plentyOfRice, quantity: 5 });
    expect(openEntries()).toMatchObject([{ itemId: id, addedBy: "manual" }]);
  });

  it("removes open entries when the item is removed", async () => {
    const { api, openEntries } = setup();
    const { id } = await api.inventory.create(milk);
    await api.inventory.archive({ id });
    expect(openEntries()).toHaveLength(0);
  });

  it("removes a manual entry when the item is removed", async () => {
    const { api, db, openEntries } = setup();
    const { id } = await api.inventory.create(plentyOfRice);
    db.insert(groceryEntries).values({ itemId: id, text: "Rice", addedBy: "manual" }).run();
    await api.inventory.archive({ id });
    expect(openEntries()).toHaveLength(0);
    expect(db.select().from(groceryEntries).where(eq(groceryEntries.itemId, id)).get()?.removedAt).toBeTruthy();
  });
});

describe("restoring a removed item", () => {
  it("puts it back on the list if it is low", async () => {
    const { api, openEntries } = setup();
    const { id } = await api.inventory.create(milk);
    await api.inventory.archive({ id });
    await api.inventory.restore({ id, ...milk });
    expect(openEntries()).toMatchObject([{ itemId: id, addedBy: "auto" }]);
  });

  it("leaves it off the list if it is not low", async () => {
    const { api, openEntries } = setup();
    const { id } = await api.inventory.create(milk);
    await api.inventory.archive({ id });
    await api.inventory.restore({ id, ...milk, quantity: 10 });
    expect(openEntries()).toHaveLength(0);
  });
});
