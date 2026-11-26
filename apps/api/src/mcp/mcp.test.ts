import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { eq, isNull } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { parseToolCall } from "@homer/shared";
import { runTool } from "../ai/tools";
import { createDb } from "../db/client";
import { events, items, people, tasks } from "../db/schema";
import { createCaller } from "../routers/index";
import { createMcpApp } from "./app";
import { mcpReadTools } from "./server";
import { mcpWriteTools } from "./writes";
import { startMcp } from "./listen";

const mcpMaintenanceTools = ["list_due", "complete_maintenance", "snooze_maintenance", "add_maintenance"];
const mcpStockTools = ["update_item", "remove_item", "remove_from_groceries"];
const mcpScheduleTools = ["update_task", "remove_task", "update_event", "remove_event"];
const token = "test-token";
const today = "2026-11-04";

const setup = () => {
  const db = createDb(":memory:");
  const app = createMcpApp(db, { token, today: () => today });
  const connect = async (bearer: string = token) => {
    const client = new Client({ name: "test", version: "0" });
    await client.connect(
      new StreamableHTTPClientTransport(new URL("http://homer.test/mcp"), {
        fetch: (url, init) => Promise.resolve(app.request(url as string, init)),
        requestInit: { headers: { authorization: `Bearer ${bearer}` } },
      }),
    );
    return client;
  };
  return { db, app, connect };
};

describe("mcp", () => {
  it("refuses a missing or wrong token", async () => {
    const { app } = setup();
    expect((await app.request("/mcp", { method: "POST" })).status).toBe(401);
    expect((await app.request("/mcp", { method: "POST", headers: { authorization: "Bearer nope" } })).status).toBe(401);
  });

  it("does not start without a token", () => {
    expect(startMcp(createDb(":memory:"), {})).toBeNull();
  });

  it("stays off for a token that is too short", () => {
    expect(startMcp(createDb(":memory:"), { HOMER_MCP_TOKEN: "x" })).toBeNull();
  });

  it("lists the allowlisted tools, with write tools marked as writes", async () => {
    const { connect } = setup();
    const { tools } = await (await connect()).listTools();
    expect(tools.map((tool) => tool.name).sort()).toEqual(
      [...mcpReadTools, ...mcpWriteTools, ...mcpMaintenanceTools, ...mcpStockTools, ...mcpScheduleTools, "undo"].sort(),
    );
    for (const tool of tools) {
      expect(tool.inputSchema.type).toBe("object");
      expect(tool.annotations?.readOnlyHint).toBe(["list_due", ...mcpReadTools].includes(tool.name as never));
    }
    const markOut = tools.find((tool) => tool.name === "mark_out");
    expect(markOut?.inputSchema.required).toContain("said");
  });

  it("returns what runTool returns for the same call", async () => {
    const { db, connect } = setup();
    const api = createCaller({ db });
    await api.inventory.create({ name: "Salt", unit: "bag", quantity: 2, daysPerUnit: null, lowThresholdDays: 7 });
    const client = await connect();
    for (const name of ["list_items", "list_groceries", "list_tasks"] as const) {
      const parsed = parseToolCall(name, {});
      if (!parsed.ok) throw new Error(parsed.error);
      const expected = (await runTool(db, today, parsed.call)).result;
      const got = await client.callTool({ name, arguments: {} });
      expect(got.structuredContent).toEqual(JSON.parse(JSON.stringify(expected)));
    }
  });

  it("rejects a tool that is not offered", async () => {
    const { connect } = setup();
    const got = await (await connect()).callTool({ name: "remove_item", arguments: {} }).catch((e) => e);
    expect(String(got instanceof Error ? got.message : got.content?.[0]?.text)).toMatch(/remove_item/);
  });

  describe("writes", () => {
    const stock = (api: ReturnType<typeof createCaller>, name: string, quantity = 2) =>
      api.inventory.create({ name, unit: "bag", quantity, daysPerUnit: null, lowThresholdDays: 7 });

    it("changes what the in-app path changes, and undo reverts it", async () => {
      const { db, connect } = setup();
      const api = createCaller({ db });
      await stock(api, "Salt");
      const client = await connect();
      const done = await client.callTool({ name: "mark_out", arguments: { name: "Salt", said: "we're out of salt" } });
      const { actionId } = done.structuredContent as { actionId: number };
      expect(actionId).toBeGreaterThan(0);
      expect((await api.inventory.list()).find((item) => item.name === "Salt")?.quantity).toBe(0);
      expect(await api.groceries.list()).toHaveLength(1);

      const undone = await client.callTool({ name: "undo", arguments: { actionId } });
      expect(undone.structuredContent).toEqual({ status: "undone" });
      expect((await api.inventory.list()).find((item) => item.name === "Salt")?.quantity).toBe(2);
      expect(await api.groceries.list()).toHaveLength(0);

      const again = await client.callTool({ name: "undo", arguments: { actionId } });
      expect(again.structuredContent).toMatchObject({
        status: "already_undone",
        message: expect.stringMatching(/already/),
      });
    });

    it("refuses a name the person did not say, and changes nothing", async () => {
      const { db, connect } = setup();
      const api = createCaller({ db });
      await stock(api, "Oat milk");
      await stock(api, "Soy milk");
      const got = await (
        await connect()
      ).callTool({
        name: "mark_out",
        arguments: { name: "Soy milk", said: "we're out of milk" },
      });
      expect(got.structuredContent).toMatchObject({ status: "not_said" });
      expect((await api.inventory.list()).every((item) => item.quantity === 2)).toBe(true);
    });

    it("needs said, and reports a bad argument without writing", async () => {
      const { connect } = setup();
      const client = await connect();
      const noSaid = await client.callTool({ name: "add_task", arguments: { title: "Call" } }).catch((e) => e);
      expect(String(noSaid instanceof Error ? noSaid.message : noSaid.content?.[0]?.text)).toMatch(/said/);
      const listed = await client.callTool({ name: "list_tasks", arguments: {} });
      expect(JSON.stringify(listed.structuredContent)).not.toContain("Call");
    });

    it("adds a task and an event", async () => {
      const { connect } = setup();
      const client = await connect();
      await client.callTool({ name: "add_task", arguments: { title: "Call the plumber", said: "remind me" } });
      await client.callTool({
        name: "add_event",
        arguments: { title: "Dentist", date: "2026-11-10", said: "dentist on the 10th" },
      });
      const listed = await client.callTool({ name: "list_tasks", arguments: { from: "2026-11-04", to: "2026-11-10" } });
      expect(JSON.stringify(listed.structuredContent)).toContain("Call the plumber");
      expect(JSON.stringify(listed.structuredContent)).toContain("Dentist");
    });
  });

  describe("due and maintenance", () => {
    const job = (api: ReturnType<typeof createCaller>, name: string, lastDoneOn: string | null = null) =>
      api.maintenance.add({ name, every: 1, unit: "weeks", lastDoneOn, today });

    it("lists what is due: overdue jobs, open routine rows and tasks", async () => {
      const { db, connect } = setup();
      const api = createCaller({ db });
      await job(api, "Softener salt", "2026-10-01");
      await job(api, "Water filter", "2026-11-03");
      const person = await api.people.add({ name: "Ana" });
      await api.routines.addItem({ personId: person.id, name: "Vitamins", targetPerDay: 1 });
      const got = await (await connect()).callTool({ name: "list_due", arguments: { days: 7 } });
      const due = got.structuredContent as { maintenance: { name: string; status: string }[]; routines: unknown[] };
      expect(due.maintenance.map((entry) => [entry.name, entry.status])).toEqual([
        ["Softener salt", "overdue"],
        ["Water filter", "soon"],
      ]);
      expect(due.routines).toEqual([{ person: "Ana", open: [{ name: "Vitamins", left: 1 }] }]);
    });

    it("completes a job by name and undo removes the done date", async () => {
      const { db, connect } = setup();
      const api = createCaller({ db });
      await job(api, "Softener salt", "2026-10-01");
      const client = await connect();
      const done = await client.callTool({
        name: "complete_maintenance",
        arguments: { name: "softener salt", said: "I refilled the softener salt" },
      });
      const { actionId } = done.structuredContent as { actionId: number };
      expect(actionId).toBeGreaterThan(0);
      expect((await api.maintenance.list({ today }))[0]?.lastDoneOn).toBe(today);
      await client.callTool({ name: "undo", arguments: { actionId } });
      expect((await api.maintenance.list({ today }))[0]?.lastDoneOn).toBe("2026-10-01");
    });

    it("says so when the job was already done today, and journals nothing", async () => {
      const { db, connect } = setup();
      const api = createCaller({ db });
      await job(api, "Softener salt", today);
      const got = await (
        await connect()
      ).callTool({
        name: "complete_maintenance",
        arguments: { name: "Softener salt", said: "softener salt is done" },
      });
      expect(got.structuredContent).toMatchObject({ status: "error", actionId: null });
    });

    it("asks when the name is unknown or matches more than one", async () => {
      const { db, connect } = setup();
      const api = createCaller({ db });
      await job(api, "Water filter");
      await job(api, "Furnace filter");
      const client = await connect();
      const many = await client.callTool({
        name: "snooze_maintenance",
        arguments: { name: "filter", said: "skip the filter" },
      });
      expect(many.structuredContent).toMatchObject({ status: "ambiguous" });
      const none = await client.callTool({
        name: "snooze_maintenance",
        arguments: { name: "gutters", said: "skip gutters" },
      });
      expect(none.structuredContent).toMatchObject({ status: "not_found" });
    });

    it("snoozes until tomorrow and hides the job from list_due", async () => {
      const { db, connect } = setup();
      const api = createCaller({ db });
      await job(api, "Softener salt", "2026-10-01");
      const client = await connect();
      const got = await client.callTool({
        name: "snooze_maintenance",
        arguments: { name: "Softener salt", said: "not today for the softener salt" },
      });
      expect(got.structuredContent).toMatchObject({ status: "snoozed", until: "2026-11-05" });
      const due = (await client.callTool({ name: "list_due", arguments: {} })).structuredContent as {
        maintenance: unknown[];
      };
      expect(due.maintenance).toEqual([]);
    });

    it("does not list a job done today, and a day-one window stops at today", async () => {
      const { db, connect } = setup();
      const api = createCaller({ db });
      await job(api, "Softener salt", today);
      await job(api, "Water filter", "2026-10-30");
      const due = (await (await connect()).callTool({ name: "list_due", arguments: { days: 1 } }))
        .structuredContent as {
        maintenance: unknown[];
      };
      expect(due.maintenance).toEqual([]);
    });

    it("refuses a job the person did not name when others share a word", async () => {
      const { db, connect } = setup();
      const api = createCaller({ db });
      await job(api, "Water filter");
      await job(api, "Furnace filter");
      const got = await (
        await connect()
      ).callTool({
        name: "complete_maintenance",
        arguments: { name: "Furnace filter", said: "I changed the water filter" },
      });
      expect(got.structuredContent).toMatchObject({ status: "not_said" });
      expect((await api.maintenance.list({ today })).every((entry) => entry.lastDoneOn === null)).toBe(true);
    });

    it("undoes a snooze and an add", async () => {
      const { db, connect } = setup();
      const api = createCaller({ db });
      await job(api, "Softener salt", "2026-10-01");
      const client = await connect();
      const snoozed = await client.callTool({
        name: "snooze_maintenance",
        arguments: { name: "Softener salt", said: "not today for the softener salt" },
      });
      await client.callTool({
        name: "undo",
        arguments: { actionId: (snoozed.structuredContent as { actionId: number }).actionId },
      });
      expect((await api.maintenance.list({ today }))[0]?.snoozedUntil).toBeNull();
      const added = await client.callTool({
        name: "add_maintenance",
        arguments: { name: "Gutters", every: 6, unit: "months", said: "gutters every 6 months" },
      });
      await client.callTool({
        name: "undo",
        arguments: { actionId: (added.structuredContent as { actionId: number }).actionId },
      });
      expect((await api.maintenance.list({ today })).map((entry) => entry.name)).toEqual(["Softener salt"]);
    });

    it("answers a duplicate name without writing", async () => {
      const { db, connect } = setup();
      await job(createCaller({ db }), "Gutters");
      const got = await (
        await connect()
      ).callTool({
        name: "add_maintenance",
        arguments: { name: "gutters", every: 6, unit: "months", said: "add gutters" },
      });
      expect(got.structuredContent).toMatchObject({ status: "error", actionId: null });
    });

    it("adds a job", async () => {
      const { db, connect } = setup();
      await (
        await connect()
      ).callTool({
        name: "add_maintenance",
        arguments: { name: "Gutters", every: 6, unit: "months", said: "clean the gutters every 6 months" },
      });
      expect((await createCaller({ db }).maintenance.list({ today })).map((entry) => entry.name)).toEqual(["Gutters"]);
    });
  });

  describe("items and the grocery list", () => {
    const stock = (
      api: ReturnType<typeof createCaller>,
      name: string,
      quantity = 2,
      daysPerUnit: number | null = null,
    ) => api.inventory.create({ name, unit: "bag", quantity, daysPerUnit, lowThresholdDays: 3 });
    const find = async (api: ReturnType<typeof createCaller>, name: string) =>
      (await api.inventory.list()).find((item) => item.name === name);

    it("renames an item and corrects its quantity, and undo puts both back", async () => {
      const { db, connect } = setup();
      const api = createCaller({ db });
      await stock(api, "Salt");
      const client = await connect();
      const got = await client.callTool({
        name: "update_item",
        arguments: { name: "Salt", newName: "Sea salt", quantity: 5, said: "rename the salt to sea salt, we have 5" },
      });
      expect(got.structuredContent).toMatchObject({ status: "updated", item: "Sea salt" });
      expect(await find(api, "Salt")).toBeUndefined();
      // The threshold was not mentioned, so it is not reset to the default.
      expect(await find(api, "Sea salt")).toMatchObject({ quantity: 5, unit: "bag", lowThresholdDays: 3 });

      const { actionId } = got.structuredContent as { actionId: number };
      expect((await client.callTool({ name: "undo", arguments: { actionId } })).structuredContent).toEqual({
        status: "undone",
      });
      expect(await find(api, "Sea salt")).toBeUndefined();
      expect(await find(api, "Salt")).toMatchObject({ quantity: 2 });
    });

    it("treats nulls as left out, and a quantity of 0 as a real change", async () => {
      const { db, connect } = setup();
      const api = createCaller({ db });
      await stock(api, "Salt", 4, 10);
      const client = await connect();
      await client.callTool({
        name: "update_item",
        arguments: {
          name: "Salt",
          newName: null,
          unit: "tin",
          quantity: null,
          daysPerUnit: null,
          lowThresholdDays: null,
          said: "salt is in tins",
        },
      });
      expect(await find(api, "Salt")).toMatchObject({ unit: "tin", quantity: 4, daysPerUnitEntered: 10 });
      await client.callTool({ name: "update_item", arguments: { name: "Salt", quantity: 0, said: "no salt left" } });
      expect(await find(api, "Salt")).toMatchObject({ quantity: 0 });
    });

    it("keeps what HOMER has learned unless the days per unit change", async () => {
      const { db, connect } = setup();
      const api = createCaller({ db });
      const { id } = await stock(api, "Rice", 3, 10);
      db.update(items).set({ daysPerUnitLearned: 6 }).where(eq(items.id, id)).run();
      const client = await connect();
      await client.callTool({
        name: "update_item",
        arguments: { name: "Rice", unit: "kg", said: "rice is in kg now" },
      });
      expect(db.select().from(items).where(eq(items.id, id)).get()).toMatchObject({
        unit: "kg",
        daysPerUnitEntered: 10,
        daysPerUnitLearned: 6,
      });
      await client.callTool({
        name: "update_item",
        arguments: { name: "Rice", daysPerUnit: 4, said: "rice lasts 4 days" },
      });
      expect(db.select().from(items).where(eq(items.id, id)).get()).toMatchObject({
        daysPerUnitEntered: 4,
        daysPerUnitLearned: null,
      });
    });

    it("answers with a status, and changes nothing, for a name that is taken, unknown, unclear or unsaid", async () => {
      const { db, connect } = setup();
      const api = createCaller({ db });
      await stock(api, "Oat milk");
      await stock(api, "Soy milk");
      await stock(api, "Salt");
      const client = await connect();
      const call = async (args: Record<string, unknown>) =>
        (await client.callTool({ name: "update_item", arguments: args })).structuredContent;
      expect(await call({ name: "Salt", newName: "Soy milk", said: "call the salt soy milk" })).toMatchObject({
        status: "error",
      });
      expect(await call({ name: "Pepper", quantity: 1, said: "we have 1 pepper" })).toMatchObject({
        status: "not_found",
      });
      expect(await call({ name: "milk", quantity: 1, said: "1 milk left" })).toMatchObject({ status: "ambiguous" });
      expect(await call({ name: "Soy milk", quantity: 9, said: "we have 9 milk" })).toMatchObject({
        status: "not_said",
      });
      expect(await call({ name: "Salt", said: "change the salt" })).toMatchObject({ status: "nothing_to_change" });
      expect((await api.inventory.list()).map((item) => [item.name, item.quantity])).toEqual([
        ["Oat milk", 2],
        ["Salt", 2],
        ["Soy milk", 2],
      ]);
    });

    it("stops tracking an item, takes it off the grocery list, and undo brings both back", async () => {
      const { db, connect } = setup();
      const api = createCaller({ db });
      await stock(api, "Salt");
      const client = await connect();
      await client.callTool({ name: "mark_out", arguments: { name: "Salt", said: "we're out of salt" } });
      expect(await api.groceries.list()).toHaveLength(1);
      const got = await client.callTool({
        name: "remove_item",
        arguments: { name: "Salt", said: "stop tracking salt" },
      });
      expect(got.structuredContent).toMatchObject({ status: "removed", item: "Salt" });
      expect(await find(api, "Salt")).toBeUndefined();
      expect(await api.groceries.list()).toHaveLength(0);

      const { actionId } = got.structuredContent as { actionId: number };
      await client.callTool({ name: "undo", arguments: { actionId } });
      expect(await find(api, "Salt")).toBeDefined();
      expect(await api.groceries.list()).toHaveLength(1);
    });

    it("takes a free-text entry off the grocery list, and says when it is not there", async () => {
      const { db, connect } = setup();
      const api = createCaller({ db });
      await api.groceries.add({ text: "Birthday candles" });
      const client = await connect();
      const missing = await client.callTool({
        name: "remove_from_groceries",
        arguments: { name: "Balloons", said: "no balloons" },
      });
      expect(missing.structuredContent).toMatchObject({ status: "not_found" });
      const got = await client.callTool({
        name: "remove_from_groceries",
        arguments: { name: "Birthday candles", said: "drop the birthday candles" },
      });
      expect(got.structuredContent).toMatchObject({ status: "removed", entry: "Birthday candles" });
      expect(await api.groceries.list()).toHaveLength(0);

      const { actionId } = got.structuredContent as { actionId: number };
      await client.callTool({ name: "undo", arguments: { actionId } });
      expect(await api.groceries.list()).toHaveLength(1);
    });

    it("says so when an item that is still low will be put back on the list", async () => {
      const { db, connect } = setup();
      const api = createCaller({ db });
      await stock(api, "Salt");
      await stock(api, "Rice", 5);
      const client = await connect();
      await client.callTool({ name: "mark_out", arguments: { name: "Salt", said: "we're out of salt" } });
      const got = await client.callTool({
        name: "remove_from_groceries",
        arguments: { name: "Salt", said: "take salt off the list" },
      });
      expect(got.structuredContent).toMatchObject({ status: "removed", note: expect.stringMatching(/again/) });

      await api.groceries.add({ text: "Rice" });
      const fine = await client.callTool({
        name: "remove_from_groceries",
        arguments: { name: "Rice", said: "take rice off the list" },
      });
      expect(fine.structuredContent).not.toHaveProperty("note");
    });

    it("refuses an entry the person did not name when others share a word", async () => {
      const { db, connect } = setup();
      const api = createCaller({ db });
      await api.groceries.add({ text: "Dish soap" });
      await api.groceries.add({ text: "Hand soap" });
      const got = await (
        await connect()
      ).callTool({ name: "remove_from_groceries", arguments: { name: "Hand soap", said: "drop the dish soap" } });
      expect(got.structuredContent).toMatchObject({ status: "not_said" });
      expect(await api.groceries.list()).toHaveLength(2);
    });
  });

  describe("tasks and events", () => {
    const tasksOf = async (api: ReturnType<typeof createCaller>) =>
      (await api.schedule.view({ today, days: 31 })).days.flatMap((day) => day.tasks);
    const open = (db: ReturnType<typeof setup>["db"]) => db.select().from(tasks).where(isNull(tasks.removedAt)).all();

    it("changes a task's title, day, time and person, and undo puts it back", async () => {
      const { db, connect } = setup();
      const api = createCaller({ db });
      const ana = await api.people.add({ name: "Ana" });
      await api.tasks.add({ title: "Call the plumber", dueDate: "2026-11-05" });
      const client = await connect();
      const got = await client.callTool({
        name: "update_task",
        arguments: {
          title: "plumber",
          newTitle: "Call the electrician",
          dueDate: "2026-11-06",
          dueTime: "09:30",
          person: "Ana",
          said: "move the plumber call to the 6th at 9:30 for Ana, and call it the electrician",
        },
      });
      expect(got.structuredContent).toMatchObject({ status: "updated", title: "Call the electrician" });
      expect(open(db)).toMatchObject([
        { title: "Call the electrician", dueDate: "2026-11-06", dueTime: "09:30", personId: ana.id },
      ]);

      const { actionId } = got.structuredContent as { actionId: number };
      await client.callTool({ name: "undo", arguments: { actionId } });
      expect(open(db)).toMatchObject([
        { title: "Call the plumber", dueDate: "2026-11-05", dueTime: null, personId: null },
      ]);
    });

    it("clears a field only when asked, and says when a rule refuses the result", async () => {
      const { db, connect } = setup();
      const api = createCaller({ db });
      await api.tasks.add({ title: "Water the plants", dueDate: "2026-11-05", dueTime: "08:00" });
      const client = await connect();
      const call = async (args: Record<string, unknown>) =>
        (await client.callTool({ name: "update_task", arguments: { title: "Water the plants", ...args } }))
          .structuredContent;
      expect(await call({ dueTime: null, said: "water the plants again" })).toMatchObject({
        status: "nothing_to_change",
      });
      expect(await call({ clear: ["dueTime"], said: "any time for the plants" })).toMatchObject({ status: "updated" });
      expect(open(db)).toMatchObject([{ dueDate: "2026-11-05", dueTime: null }]);
      expect(await call({ dueTime: "10:00", clear: ["dueTime"], said: "10:00 but any time" })).toMatchObject({
        status: "invalid",
      });
      await call({ dueTime: "10:00", said: "plants at 10" });
      // A time needs a day, so removing the day while it has a time is refused and nothing changes.
      const refused = await call({ clear: ["dueDate"], said: "no day for the plants" });
      expect(refused).toMatchObject({ status: "error", message: expect.stringMatching(/due date/i) });
      // Words for the person, not the validation issue list.
      expect(String((refused as { message: string }).message)).not.toMatch(/^\[|"code"/);
      expect(open(db)).toMatchObject([{ dueDate: "2026-11-05", dueTime: "10:00" }]);
    });

    it("asks which task when two share a title, and onDate picks one", async () => {
      const { db, connect } = setup();
      const api = createCaller({ db });
      await api.tasks.add({ title: "Take out the bins", dueDate: "2026-11-05" });
      await api.tasks.add({ title: "Take out the bins", dueDate: "2026-11-12" });
      const client = await connect();
      const many = await client.callTool({
        name: "remove_task",
        arguments: { title: "Take out the bins", said: "drop the bins task" },
      });
      expect(many.structuredContent).toMatchObject({
        status: "ambiguous",
        matches: ["Take out the bins (2026-11-05)", "Take out the bins (2026-11-12)"],
      });
      expect(open(db)).toHaveLength(2);

      const one = await client.callTool({
        name: "remove_task",
        arguments: { title: "Take out the bins", onDate: "2026-11-12", said: "drop the bins task on the 12th" },
      });
      expect(one.structuredContent).toMatchObject({ status: "removed" });
      expect(open(db)).toMatchObject([{ dueDate: "2026-11-05" }]);

      const { actionId } = one.structuredContent as { actionId: number };
      await client.callTool({ name: "undo", arguments: { actionId } });
      expect(open(db)).toHaveLength(2);
    });

    it("does not touch a task the person did not name, or one that is not there", async () => {
      const { db, connect } = setup();
      const api = createCaller({ db });
      await api.tasks.add({ title: "Call the plumber", dueDate: "2026-11-05" });
      await api.tasks.add({ title: "Call the dentist", dueDate: "2026-11-05" });
      const client = await connect();
      const wrong = await client.callTool({
        name: "remove_task",
        arguments: { title: "Call the dentist", said: "I called the plumber" },
      });
      expect(wrong.structuredContent).toMatchObject({ status: "not_said" });
      const none = await client.callTool({ name: "remove_task", arguments: { title: "Mow", said: "drop the mowing" } });
      expect(none.structuredContent).toMatchObject({ status: "not_found" });
      const stranger = await client.callTool({
        name: "update_task",
        arguments: { title: "Call the plumber", person: "Zed", said: "give the plumber call to Zed" },
      });
      expect(stranger.structuredContent).toMatchObject({ status: "person_not_found" });
      expect(open(db)).toHaveLength(2);
    });

    it("moves an event, clears its time and person, and undo puts it back", async () => {
      const { db, connect } = setup();
      const api = createCaller({ db });
      const ana = await api.people.add({ name: "Ana" });
      await api.events.add({ title: "Dentist", date: "2026-11-10", time: "14:00", personId: ana.id });
      const client = await connect();
      const got = await client.callTool({
        name: "update_event",
        arguments: {
          title: "Dentist",
          date: "2026-11-12",
          clear: ["time", "person"],
          said: "dentist moved to the 12th",
        },
      });
      expect(got.structuredContent).toMatchObject({ status: "updated", title: "Dentist", date: "2026-11-12" });
      expect(db.select().from(events).all()).toMatchObject([{ date: "2026-11-12", time: null, personId: null }]);

      const { actionId } = got.structuredContent as { actionId: number };
      await client.callTool({ name: "undo", arguments: { actionId } });
      expect(db.select().from(events).all()).toMatchObject([{ date: "2026-11-10", time: "14:00", personId: ana.id }]);
    });

    it("looks at upcoming events unless a date is given, and removes one with undo", async () => {
      const { db, connect } = setup();
      const api = createCaller({ db });
      await api.events.add({ title: "Soccer practice", date: "2026-10-28" });
      await api.events.add({ title: "Soccer practice", date: "2026-11-11" });
      const client = await connect();
      const got = await client.callTool({
        name: "remove_event",
        arguments: { title: "Soccer practice", said: "cancel soccer practice" },
      });
      expect(got.structuredContent).toMatchObject({ status: "removed", date: "2026-11-11" });
      expect(db.select().from(events).where(isNull(events.removedAt)).all()).toMatchObject([{ date: "2026-10-28" }]);

      const past = await client.callTool({
        name: "remove_event",
        arguments: { title: "Soccer practice", onDate: "2026-10-28", said: "that old soccer practice, remove it" },
      });
      expect(past.structuredContent).toMatchObject({ status: "removed", date: "2026-10-28" });

      const { actionId } = got.structuredContent as { actionId: number };
      await client.callTool({ name: "undo", arguments: { actionId } });
      expect(db.select().from(events).where(isNull(events.removedAt)).all()).toMatchObject([{ date: "2026-11-11" }]);
    });

    it("removes a repeating task, ending its repeats, and undo brings it back", async () => {
      const { db, connect } = setup();
      const api = createCaller({ db });
      await api.tasks.add({ title: "Take out the bins", dueDate: "2026-11-05", repeat: "weekly" });
      const client = await connect();
      const got = await client.callTool({
        name: "remove_task",
        arguments: { title: "Take out the bins", said: "stop the bins reminder" },
      });
      expect(open(db)).toHaveLength(0);
      const { actionId } = got.structuredContent as { actionId: number };
      await client.callTool({ name: "undo", arguments: { actionId } });
      expect(open(db)).toMatchObject([{ title: "Take out the bins", repeat: "weekly" }]);
    });

    it("picks the task on onDate when updating, and does not know a person who has left", async () => {
      const { db, connect } = setup();
      const api = createCaller({ db });
      const ana = await api.people.add({ name: "Ana" });
      db.update(people).set({ archivedAt: "2026-10-01T00:00:00.000Z" }).where(eq(people.id, ana.id)).run();
      await api.tasks.add({ title: "Practice piano", dueDate: "2026-11-05" });
      await api.tasks.add({ title: "Practice piano", dueDate: "2026-11-12" });
      const client = await connect();
      const left = await client.callTool({
        name: "update_task",
        arguments: { title: "Practice piano", onDate: "2026-11-12", person: "Ana", said: "give the 12th piano to Ana" },
      });
      expect(left.structuredContent).toMatchObject({ status: "person_not_found" });
      const moved = await client.callTool({
        name: "update_task",
        arguments: {
          title: "Practice piano",
          onDate: "2026-11-12",
          dueTime: "16:00",
          said: "the 12th piano is at 4pm",
        },
      });
      expect(moved.structuredContent).toMatchObject({ status: "updated", dueDate: "2026-11-12" });
      expect(open(db).map((task) => [task.dueDate, task.dueTime])).toEqual([
        ["2026-11-05", null],
        ["2026-11-12", "16:00"],
      ]);
    });

    it("does not change an event the person did not name", async () => {
      const { db, connect } = setup();
      const api = createCaller({ db });
      await api.events.add({ title: "Dentist", date: "2026-11-10" });
      await api.events.add({ title: "Dance recital", date: "2026-11-11" });
      const client = await connect();
      const call = async (name: string, args: Record<string, unknown>) =>
        (await client.callTool({ name, arguments: args })).structuredContent;
      expect(await call("remove_event", { title: "Dentist", said: "cancel the recital" })).toMatchObject({
        status: "not_said",
      });
      expect(
        await call("update_event", { title: "Dentist", time: "09:00", said: "the recital is at nine" }),
      ).toMatchObject({
        status: "not_said",
      });
      expect(db.select().from(events).where(isNull(events.removedAt)).all()).toMatchObject([
        { title: "Dentist", time: null },
        { title: "Dance recital" },
      ]);
    });
  });
});
