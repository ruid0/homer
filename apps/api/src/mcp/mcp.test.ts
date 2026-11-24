import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { describe, expect, it } from "vitest";
import { parseToolCall } from "@homer/shared";
import { runTool } from "../ai/tools";
import { createDb } from "../db/client";
import { createCaller } from "../routers/index";
import { createMcpApp } from "./app";
import { startMcp } from "./listen";

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

  it("lists only the read tools, read-only, with schemas", async () => {
    const { connect } = setup();
    const { tools } = await (await connect()).listTools();
    expect(tools.map((tool) => tool.name).sort()).toEqual(["list_groceries", "list_items", "list_tasks"]);
    for (const tool of tools) {
      expect(tool.annotations?.readOnlyHint).toBe(true);
      expect(tool.inputSchema.type).toBe("object");
    }
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
    const got = await (await connect()).callTool({ name: "mark_out", arguments: { name: "Salt" } }).catch((e) => e);
    expect(String(got instanceof Error ? got.message : got.content?.[0]?.text)).toMatch(/mark_out/);
  });
});
