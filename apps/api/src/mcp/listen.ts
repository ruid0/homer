import { serve } from "@hono/node-server";
import type { Db } from "../db/client";
import { mcpMessages } from "../messages";
import { localDate } from "../time";
import { createMcpApp } from "./app";

const MIN_TOKEN_LENGTH = 16;

type Settings = { HOMER_MCP_TOKEN?: string; MCP_PORT?: string; MCP_HOST?: string };

// Its own port, bound to this machine, and off without a token. It is never behind the web proxy.
export const startMcp = (db: Db, settings: Settings) => {
  const token = settings.HOMER_MCP_TOKEN;
  if (!token) return null;
  if (token.length < MIN_TOKEN_LENGTH) {
    console.log(mcpMessages.tokenTooShort(MIN_TOKEN_LENGTH));
    return null;
  }
  const port = Number(settings.MCP_PORT) || 3002;
  const hostname = settings.MCP_HOST || "127.0.0.1";
  const app = createMcpApp(db, { token, today: () => localDate(new Date()) });
  return serve({ fetch: app.fetch, port, hostname }, () => console.log(mcpMessages.listening(hostname, port)));
};
