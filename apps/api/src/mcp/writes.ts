import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { parseToolCall, resolveToolDates, toolSchemas, type ToolName } from "@homer/shared";
import { refuseWrite } from "../ai/guard";
import { undoAction } from "../ai/journal";
import { knownNames, runTool } from "../ai/tools";
import type { Db } from "../db/client";
import { assistantCopy, mcpMessages } from "../messages";

// Only these change anything. Each one needs the person's own words, and each is journalled so it can be undone.
export const mcpWriteTools = [
  "mark_out",
  "restock_item",
  "add_item",
  "add_to_groceries",
  "mark_bought",
  "add_task",
  "add_event",
  "complete_task",
] as const satisfies readonly ToolName[];

const said = z.string().trim().min(1).describe(mcpMessages.saidField);

const reply = (result: Record<string, unknown>, text: string) => ({
  content: [{ type: "text" as const, text }],
  structuredContent: result,
});

type Deps = { db: Db; today: () => string; describe: (name: ToolName) => string | undefined };

export const registerWriteTools = (server: McpServer, { db, today, describe }: Deps) => {
  for (const name of mcpWriteTools) {
    server.registerTool(
      name,
      {
        description: `${describe(name)} ${mcpMessages.saidRule}`,
        inputSchema: toolSchemas[name].safeExtend({ said }),
        annotations: { readOnlyHint: false, destructiveHint: false },
      },
      async ({ said: words, ...args }: Record<string, unknown> & { said: string }) => {
        const parsed = parseToolCall(name, resolveToolDates(args, today()));
        if (!parsed.ok) return { ...reply({ status: "invalid", message: parsed.error }, parsed.error), isError: true };
        const refusal = refuseWrite(parsed.call, { recent: words, now: words }, await knownNames(db));
        if (refusal !== null) return reply(refusal, String(refusal.message));
        const { result, actionId } = await runTool(db, today(), parsed.call);
        return reply({ ...result, actionId }, mcpMessages.written(name, actionId));
      },
    );
  }

  server.registerTool(
    "undo",
    {
      description: mcpMessages.undoDescription,
      inputSchema: z.object({ actionId: z.number().int() }),
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true },
    },
    async ({ actionId }: { actionId: number }) => {
      const result = undoAction(db, actionId);
      if (result.ok) return reply({ status: "undone" }, mcpMessages.undone);
      const message =
        result.reason === "changed"
          ? assistantCopy.undoChanged(result.label)
          : result.reason === "undone"
            ? assistantCopy.undoneAlready
            : assistantCopy.undoMissing;
      return reply({ status: result.reason === "undone" ? "already_undone" : result.reason, message }, message);
    },
  );
};
