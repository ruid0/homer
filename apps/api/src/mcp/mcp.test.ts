import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { describe, expect, it } from "vitest";
import { parseToolCall } from "@homer/shared";
import { runTool } from "../ai/tools";
import { createDb } from "../db/client";
import { createCaller } from "../routers/index";
import { createMcpApp } from "./app";
import { mcpReadTools } from "./server";
import { mcpWriteTools } from "./writes";
import { startMcp } from "./listen";

const mcpMaintenanceTools = ["list_due", "complete_maintenance", "snooze_maintenance", "add_maintenance"];
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
      [...mcpReadTools, ...mcpWriteTools, ...mcpMaintenanceTools, "undo"].sort(),
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
});
