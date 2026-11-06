import { describe, expect, it } from "vitest";
import { createDb } from "../db/client";
import { createCaller } from "../routers";
import { dayCounts, endOfDayMessage } from "./summary";

describe("endOfDayMessage", () => {
  it("says nothing on a quiet day", () => expect(endOfDayMessage({ tasksLeft: 0, itemsLow: 0 })).toBeNull());

  it("counts tasks and low items, with singular and plural", () => {
    expect(endOfDayMessage({ tasksLeft: 1, itemsLow: 2 })).toBe("Today: 1 task left, 2 items running low.");
    expect(endOfDayMessage({ tasksLeft: 3, itemsLow: 0 })).toBe("Today: 3 tasks left.");
    expect(endOfDayMessage({ tasksLeft: 0, itemsLow: 1 })).toBe("Today: 1 item running low.");
  });
});

describe("dayCounts", () => {
  it("counts open tasks due today or overdue, and low or out items, but not later tasks or fine stock", async () => {
    const db = createDb(":memory:");
    const api = createCaller({ db });
    await api.tasks.add({ title: "Task A", dueDate: "2026-11-05" });
    await api.tasks.add({ title: "Task B", dueDate: "2026-11-01" });
    await api.tasks.add({ title: "Task C", dueDate: "2026-11-09" });
    await api.tasks.add({ title: "Task D" });
    await api.inventory.create({ name: "Item A", unit: "bag", quantity: 0, daysPerUnit: 10 });
    await api.inventory.create({ name: "Item B", unit: "bag", quantity: 1, daysPerUnit: 3 });
    await api.inventory.create({ name: "Item C", unit: "bag", quantity: 9, daysPerUnit: 30 });
    expect(await dayCounts(db, "2026-11-05")).toEqual({ tasksLeft: 2, itemsLow: 2 });
  });

  it("leaves out done tasks and archived items", async () => {
    const db = createDb(":memory:");
    const api = createCaller({ db });
    const task = await api.tasks.add({ title: "Task A", dueDate: "2026-11-05" });
    await api.tasks.complete({ id: task.id, today: "2026-11-05" });
    const item = await api.inventory.create({ name: "Item A", unit: "bag", quantity: 0, daysPerUnit: 10 });
    await api.inventory.archive({ id: item.id });
    expect(await dayCounts(db, "2026-11-05")).toEqual({ tasksLeft: 0, itemsLow: 0 });
  });
});
