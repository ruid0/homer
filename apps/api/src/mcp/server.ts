import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { toolDefinitions, toolSchemas, type ToolCall, type ToolName } from "@homer/shared";
import type { Db } from "../db/client";
import { runTool } from "../ai/tools";
import { mcpMessages } from "../messages";
import { registerWriteTools } from "./writes";

// Only these and the write tools in writes.ts are offered. A tool joins the list on purpose, never because it exists.
export const mcpReadTools = ["list_items", "list_groceries", "list_tasks"] as const satisfies readonly ToolName[];

const describe = (name: ToolName) => toolDefinitions.find((tool) => tool.name === name)?.description;

type Deps = { today: () => string };

const summary = (name: string, result: Record<string, unknown>) => {
  const rows = Object.values(result).find(Array.isArray);
  return mcpMessages.summary(name, rows?.length ?? 0);
};

export const createMcpServer = (db: Db, { today }: Deps) => {
  const server = new McpServer({ name: "homer", version: "1.0.0" });
  for (const name of mcpReadTools) {
    server.registerTool(
      name,
      { description: describe(name), inputSchema: toolSchemas[name], annotations: { readOnlyHint: true } },
      async (args: Record<string, unknown>) => {
        const { result } = await runTool(db, today(), { name, args } as ToolCall);
        return { content: [{ type: "text" as const, text: summary(name, result) }], structuredContent: result };
      },
    );
  }
  registerWriteTools(server, { db, today, describe });
  return server;
};
