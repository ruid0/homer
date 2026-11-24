import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { timingSafeEqual } from "node:crypto";
import { Hono } from "hono";
import type { Db } from "../db/client";
import { mcpMessages } from "../messages";
import { createMcpServer } from "./server";

const sameToken = (given: string, expected: string) => {
  const a = Buffer.from(given);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
};

// Stateless: each request gets its own server and transport, so nothing is held between calls.
export const createMcpApp = (db: Db, { token, today }: { token: string; today: () => string }) =>
  new Hono().all("/mcp", async (c) => {
    const given = c.req.header("authorization")?.match(/^Bearer (.+)$/)?.[1] ?? "";
    if (!sameToken(given, token)) return c.json({ error: mcpMessages.unauthorized }, 401);
    const transport = new WebStandardStreamableHTTPServerTransport({ enableJsonResponse: true });
    const server = createMcpServer(db, { today });
    await server.connect(transport);
    try {
      return await transport.handleRequest(c.req.raw);
    } finally {
      await server.close();
    }
  });
