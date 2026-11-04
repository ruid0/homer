import { parseToolCall, type ToolName } from "@homer/shared";
import { describe, expect, it } from "vitest";
import { createDb } from "../db/client";
import { createCaller } from "../routers/index";
import { snapshot, undoAction } from "./journal";
import { runTool } from "./tools";

const today = "2026-11-04";

const setup = () => {
  const db = createDb(":memory:");
  const api = createCaller({ db });
  const run = async (name: ToolName, args: unknown = {}) => {
    const parsed = parseToolCall(name, args);
    if (!parsed.ok) throw new Error(parsed.error);
    return runTool(db, today, parsed.call);
  };
  return { db, api, run };
};

const item = (name: string, quantity = 1, daysPerUnit: number | null = null) => ({
  name,
  unit: "bag",
  quantity,
  daysPerUnit,
  lowThresholdDays: 7,
});

const task = (title: string, dueDate: string | null = null) => ({ title, dueDate, dueTime: null, repeat: null, personId: null });

describe("read tools", () => {
  it("list_items shows quantity and days remaining, and records no action", async () => {
    const { api, run } = setup();
    await api.inventory.create(item("Milk", 1, 2));
    const done = await run("list_items");
    expect(done.actionId).toBeNull();
    expect(done.result).toMatchObject({ items: [{ name: "Milk", quantity: 1, unit: "bag", daysRemaining: 2 }] });
  });

  it("list_groceries shows what is on the list", async () => {
    const { api, run } = setup();
    await api.groceries.add({ text: "Bread", quantity: 2 });
    const done = await run("list_groceries");
    expect(done.result).toMatchObject({ entries: [{ name: "Bread", quantity: 2 }] });
    expect(done.actionId).toBeNull();
  });

  it("list_tasks defaults to today and includes overdue and undated tasks", async () => {
    const { api, run } = setup();
    await api.tasks.add(task("Old", "2026-11-01"));
    await api.tasks.add(task("Today", today));
    await api.tasks.add(task("Later", "2026-11-20"));
    await api.tasks.add(task("Someday"));
    await api.events.add({ title: "Dentist", date: today, time: "09:00", personId: null });
    const done = await run("list_tasks");
    const titles = JSON.stringify(done.result);
    expect(titles).toContain("Old");
    expect(titles).toContain("Today");
    expect(titles).toContain("Someday");
    expect(titles).toContain("Dentist");
    expect(titles).not.toContain("Later");
  });

  it("list_tasks counts overdue from today, whatever range is asked for", async () => {
    const { api, run } = setup();
    await api.tasks.add(task("Between", "2026-11-06"));
    await api.tasks.add(task("Old", "2026-11-01"));
    const future = JSON.stringify((await run("list_tasks", { from: "2026-11-10", to: "2026-11-12" })).result);
    expect(future).toContain('"overdue":[{"title":"Old"');
    expect(future).not.toContain("Between");
    const past = (await run("list_tasks", { from: "2026-10-01", to: "2026-10-05" })).result as { overdue: unknown[] };
    expect(past.overdue).toHaveLength(1);
  });

  it("list_tasks says when the range is backwards or too long", async () => {
    const { run } = setup();
    expect((await run("list_tasks", { from: "2026-11-10", to: "2026-11-01" })).result).toMatchObject({ status: "error" });
    expect((await run("list_tasks", { from: "2026-01-01", to: "2026-12-31" })).result).toMatchObject({ status: "error" });
  });
});

describe("mark_out", () => {
  it("zeroes the item and puts it on the grocery list, as one undoable action", async () => {
    const { db, api, run } = setup();
    await api.inventory.create(item("Salt", 3));
    const before = snapshot(db);
    const done = await run("mark_out", { name: "salt" });
    expect(done.result).toMatchObject({ status: "done", item: "Salt" });
    expect(done.actionId).not.toBeNull();
    expect((await api.inventory.list())[0]).toMatchObject({ quantity: 0 });
    expect((await api.groceries.list()).map((entry) => entry.text)).toEqual(["Salt"]);
    expect(undoAction(db, done.actionId!)).toEqual({ ok: true });
    expect(snapshot(db)).toEqual(before);
  });

  it("says the item is not tracked, so the assistant can ask, and changes nothing", async () => {
    const { run } = setup();
    const done = await run("mark_out", { name: "salt" });
    expect(done.result).toMatchObject({ status: "not_tracked", name: "salt" });
    expect(done.actionId).toBeNull();
  });

  it("lists the matches when the name fits several items", async () => {
    const { api, run } = setup();
    await api.inventory.create(item("Oat milk"));
    await api.inventory.create(item("Soy milk"));
    const done = await run("mark_out", { name: "milk" });
    expect(done.result).toMatchObject({ status: "ambiguous", matches: ["Oat milk", "Soy milk"] });
    expect(done.actionId).toBeNull();
  });
});

describe("restock_item", () => {
  it("adds to what is in stock", async () => {
    const { api, run } = setup();
    await api.inventory.create(item("Milk", 1, 2));
    const done = await run("restock_item", { name: "milk", quantity: 4 });
    expect(done.result).toMatchObject({ status: "done", item: "Milk", added: 4, quantity: 5 });
    expect(done.actionId).not.toBeNull();
  });

  it("does not guess an untracked item", async () => {
    const { run } = setup();
    expect((await run("restock_item", { name: "milk", quantity: 4 })).result).toMatchObject({ status: "not_tracked" });
  });
});

describe("errors from the app code", () => {
  it("come back as an error result with the reason", async () => {
    const { api, db } = setup();
    await api.inventory.create(item("Milk"));
    const done = await runTool(db, today, { name: "restock_item", args: { name: "Milk", quantity: -1 } });
    expect(done.result).toMatchObject({ status: "error" });
    expect(done.actionId).toBeNull();
  });
});

describe("add_item", () => {
  it("starts tracking an item", async () => {
    const { api, run } = setup();
    const done = await run("add_item", { name: "Salt", unit: "bag", quantity: 2, daysPerUnit: 30 });
    expect(done.result).toMatchObject({ status: "done", item: "Salt" });
    expect((await api.inventory.list())[0]).toMatchObject({ name: "Salt", quantity: 2, daysRemaining: 60 });
  });

  it("reports a name that is already tracked as an error", async () => {
    const { api, run } = setup();
    await api.inventory.create(item("Salt"));
    const done = await run("add_item", { name: "salt", unit: "bag", quantity: 1 });
    expect(done.result).toMatchObject({ status: "error" });
    expect(done.actionId).toBeNull();
  });
});

describe("add_to_groceries and mark_bought", () => {
  it("lists a tracked item by its own name", async () => {
    const { api, run } = setup();
    await api.inventory.create(item("Milk", 5, 30));
    const done = await run("add_to_groceries", { name: "milk", quantity: 2 });
    expect(done.result).toMatchObject({ status: "done", name: "Milk" });
    expect((await api.groceries.list())[0]).toMatchObject({ itemId: expect.any(Number), quantity: 2 });
  });

  it("lists anything else as text", async () => {
    const { api, run } = setup();
    await run("add_to_groceries", { name: "birthday candles" });
    expect((await api.groceries.list())[0]).toMatchObject({ text: "birthday candles", itemId: null });
  });

  it("marks a text entry bought", async () => {
    const { api, run } = setup();
    await api.groceries.add({ text: "Bread" });
    const done = await run("mark_bought", { name: "bread" });
    expect(done.result).toMatchObject({ status: "done", name: "Bread" });
    expect(await api.groceries.list()).toEqual([]);
  });

  it("asks for the quantity when the entry is a tracked item, and changes nothing", async () => {
    const { api, run } = setup();
    await api.inventory.create(item("Milk", 0, 2));
    const done = await run("mark_bought", { name: "milk" });
    expect(done.result).toMatchObject({ status: "needs_quantity", name: "Milk" });
    expect(done.actionId).toBeNull();
    expect(await api.groceries.list()).toHaveLength(1);
  });

  it("restocks a tracked item with the quantity given", async () => {
    const { api, run } = setup();
    await api.inventory.create(item("Milk", 0, 2));
    await run("mark_bought", { name: "milk", quantity: 3 });
    expect((await api.inventory.list())[0]).toMatchObject({ quantity: 3 });
  });

  it("says when nothing on the list matches", async () => {
    const { run } = setup();
    expect((await run("mark_bought", { name: "bread" })).result).toMatchObject({ status: "not_on_list" });
  });
});

describe("add_task, add_event and complete_task", () => {
  it("adds a task on the date given", async () => {
    const { api, run } = setup();
    const done = await run("add_task", { title: "Call the plumber", dueDate: "2026-11-06" });
    expect(done.result).toMatchObject({ status: "done", title: "Call the plumber", dueDate: "2026-11-06" });
    expect((await api.schedule.view({ today, days: 3 })).days[2]!.tasks[0]).toMatchObject({ title: "Call the plumber" });
  });

  it("adds a task without a date, without inventing one", async () => {
    const { api, run } = setup();
    await run("add_task", { title: "Call the plumber" });
    expect((await api.schedule.view({ today, days: 1 })).undated[0]).toMatchObject({ dueDate: null });
  });

  it("gives a task to a person by name", async () => {
    const { api, run } = setup();
    await api.people.add({ name: "Anna" });
    const done = await run("add_task", { title: "Bins", person: "anna" });
    expect(done.result).toMatchObject({ status: "done", person: "Anna" });
  });

  it("asks which person when the name is unknown", async () => {
    const { api, run } = setup();
    await api.people.add({ name: "Anna" });
    const done = await run("add_task", { title: "Bins", person: "Zed" });
    expect(done.result).toMatchObject({ status: "person_not_found", name: "Zed", people: ["Anna"] });
    expect(done.actionId).toBeNull();
  });

  it("adds an event", async () => {
    const { api, run } = setup();
    const done = await run("add_event", { title: "Dentist", date: "2026-11-05", time: "09:30" });
    expect(done.result).toMatchObject({ status: "done", title: "Dentist" });
    expect((await api.schedule.view({ today, days: 2 })).days[1]!.events[0]).toMatchObject({ time: "09:30" });
  });

  it("completes a task by title and reports the next one for a repeat", async () => {
    const { api, run } = setup();
    await api.tasks.add({ ...task("Water plants", today), repeat: "weekly" });
    const done = await run("complete_task", { title: "water plants" });
    expect(done.result).toMatchObject({ status: "done", title: "Water plants", nextDueDate: "2026-11-11" });
    expect(done.actionId).not.toBeNull();
  });

  it("completes an undated or future task too", async () => {
    const { api, run } = setup();
    await api.tasks.add(task("Later", "2026-12-01"));
    expect((await run("complete_task", { title: "later" })).result).toMatchObject({ status: "done" });
  });

  it("says when no open task matches, or several do", async () => {
    const { api, run } = setup();
    expect((await run("complete_task", { title: "bins" })).result).toMatchObject({ status: "not_found" });
    await api.tasks.add(task("Take out bins"));
    await api.tasks.add(task("Wash bins"));
    expect((await run("complete_task", { title: "bins" })).result).toMatchObject({
      status: "ambiguous",
      matches: ["Take out bins", "Wash bins"],
    });
    await api.tasks.add(task("Mop", "2026-11-05"));
    await api.tasks.add(task("Mop", "2026-11-12"));
    expect((await run("complete_task", { title: "mop" })).result).toMatchObject({
      matches: ["Mop (due 2026-11-05)", "Mop (due 2026-11-12)"],
    });
  });
});
