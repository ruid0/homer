import { describe, expect, it } from "vitest";
import { createDb } from "../db/client";
import { messages } from "../messages";
import { createCaller } from "./index";

const today = "2026-11-05"; // a Thursday
const monday = "2026-11-02";

const setup = async () => {
  const api = createCaller({ db: createDb(":memory:") });
  const person = await api.people.add({ name: "Person A" });
  return { api, person };
};

const withRow = async (targetPerDay = 2) => {
  const { api, person } = await setup();
  const row = await api.routines.addItem({ personId: person.id, name: "Row A", targetPerDay });
  return { api, person, row };
};

describe("routines.addItem", () => {
  it("adds a row at the end with its target", async () => {
    const { api, person } = await setup();
    const a = await api.routines.addItem({ personId: person.id, name: " Row A " });
    const b = await api.routines.addItem({ personId: person.id, name: "Row B", targetPerDay: 3 });
    expect(a).toMatchObject({ name: "Row A", targetPerDay: 1, position: 0, removedAt: null });
    expect(b).toMatchObject({ targetPerDay: 3, position: 1 });
  });

  it("rejects a person who does not exist and a blank name", async () => {
    const { api, person } = await setup();
    await expect(api.routines.addItem({ personId: 99, name: "Row A" })).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(api.routines.addItem({ personId: person.id, name: " " })).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });
});

describe("routines.week", () => {
  it("returns Monday to Sunday with counts for each day, zero where nothing was done", async () => {
    const { api, person, row } = await withRow();
    await api.routines.setCount({ itemId: row.id, date: "2026-11-03", today, count: 1 });
    await api.routines.setCount({ itemId: row.id, date: today, today, count: 2 });

    const week = await api.routines.week({ personId: person.id, today });
    expect(week.days[0]).toBe(monday);
    expect(week.days).toHaveLength(7);
    expect(week.items).toMatchObject([{ id: row.id, name: "Row A", counts: [0, 1, 0, 2, 0, 0, 0] }]);
  });

  it("shows an earlier week from weekOf, without this week's counts", async () => {
    const { api, person, row } = await withRow();
    await api.routines.setCount({ itemId: row.id, date: today, today, count: 2 });
    await api.routines.setCount({ itemId: row.id, date: "2026-10-28", today, count: 1 });

    const earlier = await api.routines.week({ personId: person.id, today, weekOf: "2026-10-28" });
    expect(earlier.days[0]).toBe("2026-10-26");
    expect(earlier.items[0]?.counts).toEqual([0, 0, 1, 0, 0, 0, 0]);
  });

  it("returns only that person's rows, in order, without removed rows", async () => {
    const { api, person } = await setup();
    const other = await api.people.add({ name: "Person B" });
    const a = await api.routines.addItem({ personId: person.id, name: "Row A" });
    await api.routines.addItem({ personId: person.id, name: "Row B" });
    await api.routines.addItem({ personId: other.id, name: "Row C" });
    await api.routines.removeItem({ id: a.id });

    const week = await api.routines.week({ personId: person.id, today });
    expect(week.items.map((item) => item.name)).toEqual(["Row B"]);
  });

  it("rejects a person who does not exist", async () => {
    const { api } = await setup();
    await expect(api.routines.week({ personId: 99, today })).rejects.toMatchObject({ code: "NOT_FOUND" });
  });
});

describe("routines.setCount", () => {
  it("sets, replaces and zeroes a day's count", async () => {
    const { api, person, row } = await withRow();
    await api.routines.setCount({ itemId: row.id, date: today, today, count: 1 });
    await api.routines.setCount({ itemId: row.id, date: today, today, count: 3 });
    expect((await api.routines.week({ personId: person.id, today })).items[0]?.counts[3]).toBe(3);
    await api.routines.setCount({ itemId: row.id, date: today, today, count: 0 });
    expect((await api.routines.week({ personId: person.id, today })).items[0]?.counts[3]).toBe(0);
  });

  it("accepts a count above the target", async () => {
    const { api, row } = await withRow(1);
    expect(await api.routines.setCount({ itemId: row.id, date: today, today, count: 4 })).toMatchObject({ count: 4 });
  });

  it("rejects a day that has not happened yet", async () => {
    const { api, row } = await withRow();
    await expect(
      api.routines.setCount({ itemId: row.id, date: "2026-11-06", today, count: 1 }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST", message: messages.routineDateInFuture });
  });

  it("allows the oldest day of the eighth week back and rejects the day before it", async () => {
    const { api, row } = await withRow();
    // This week starts 2026-11-02, so eight weeks back is 2026-09-07.
    await expect(api.routines.setCount({ itemId: row.id, date: "2026-09-07", today, count: 1 })).resolves.toBeDefined();
    await expect(
      api.routines.setCount({ itemId: row.id, date: "2026-09-06", today, count: 1 }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST", message: messages.routineDateTooOld(8) });
  });

  it("rejects a removed row and a row that does not exist", async () => {
    const { api, row } = await withRow();
    await api.routines.removeItem({ id: row.id });
    await expect(
      api.routines.setCount({ itemId: row.id, date: today, today, count: 1 }),
    ).rejects.toMatchObject({ code: "NOT_FOUND", message: messages.routineRowRemoved });
    await expect(
      api.routines.setCount({ itemId: 99, date: today, today, count: 1 }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("rejects a negative count", async () => {
    const { api, row } = await withRow();
    await expect(
      api.routines.setCount({ itemId: row.id, date: today, today, count: -1 }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });
});

describe("routines.updateItem and removeItem", () => {
  it("renames a row and changes its target", async () => {
    const { api, row } = await withRow();
    expect(await api.routines.updateItem({ id: row.id, name: "Row Z", targetPerDay: 4 })).toMatchObject({
      name: "Row Z",
      targetPerDay: 4,
    });
  });

  it("keeps the target when a rename sends the same target, and refuses a rename without one", async () => {
    const { api, person, row } = await withRow(3);
    await api.routines.updateItem({ id: row.id, name: "Row Z", targetPerDay: 3 });
    expect((await api.routines.week({ personId: person.id, today })).items[0]).toMatchObject({ targetPerDay: 3 });
    await expect(api.routines.updateItem({ id: row.id, name: "Row Y" } as never)).rejects.toMatchObject({
      code: "BAD_REQUEST",
    });
  });

  it("refuses to remove or change a removed row", async () => {
    const { api, row } = await withRow();
    await api.routines.removeItem({ id: row.id });
    await expect(api.routines.removeItem({ id: row.id })).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(api.routines.updateItem({ id: row.id, name: "Row Z", targetPerDay: 1 })).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
  });
});

describe("routines.moveItem", () => {
  const three = async () => {
    const { api, person } = await setup();
    const [a, b, c] = [
      await api.routines.addItem({ personId: person.id, name: "Row A" }),
      await api.routines.addItem({ personId: person.id, name: "Row B" }),
      await api.routines.addItem({ personId: person.id, name: "Row C" }),
    ];
    const names = async () => (await api.routines.week({ personId: person.id, today })).items.map((item) => item.name);
    return { api, a: a!, b: b!, c: c!, names };
  };

  it("moves a row up and down", async () => {
    const { api, c, names } = await three();
    await api.routines.moveItem({ id: c.id, direction: "up" });
    expect(await names()).toEqual(["Row A", "Row C", "Row B"]);
    await api.routines.moveItem({ id: c.id, direction: "down" });
    expect(await names()).toEqual(["Row A", "Row B", "Row C"]);
  });

  it("does nothing at the ends", async () => {
    const { api, a, c, names } = await three();
    await api.routines.moveItem({ id: a.id, direction: "up" });
    await api.routines.moveItem({ id: c.id, direction: "down" });
    expect(await names()).toEqual(["Row A", "Row B", "Row C"]);
  });

  it("moves correctly after a removal and an add, and leaves another person's order alone", async () => {
    const { api, a, b, c, names } = await three();
    const other = await api.people.add({ name: "Person B" });
    await api.routines.addItem({ personId: other.id, name: "Row X" });
    await api.routines.addItem({ personId: other.id, name: "Row Y" });
    await api.routines.removeItem({ id: b.id });
    const d = await api.routines.addItem({ personId: a.personId, name: "Row D" });
    await api.routines.moveItem({ id: d.id, direction: "up" });
    expect(await names()).toEqual(["Row A", "Row D", "Row C"]);
    await api.routines.moveItem({ id: c.id, direction: "up" });
    expect(await names()).toEqual(["Row A", "Row C", "Row D"]);
    const theirs = (await api.routines.week({ personId: other.id, today })).items.map((item) => item.name);
    expect(theirs).toEqual(["Row X", "Row Y"]);
  });

  it("skips over a removed row", async () => {
    const { api, b, c, names } = await three();
    await api.routines.removeItem({ id: b.id });
    await api.routines.moveItem({ id: c.id, direction: "up" });
    expect(await names()).toEqual(["Row C", "Row A"]);
  });
});
