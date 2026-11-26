import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { mcpToolDescriptions, mcpToolSchemas, resolveName, type McpToolName } from "@homer/shared";
import { chosenFromSeveral } from "../ai/guard";
import { errorMessage } from "../ai/tools";
import { journalled } from "../ai/journal";
import type { Db } from "../db/client";
import { assistantCopy, mcpMessages } from "../messages";

export type Result = Record<string, unknown>;

export const said = z.string().trim().min(1).describe(mcpMessages.saidField);

export const reply = (result: Result, text: string) => ({
  content: [{ type: "text" as const, text }],
  structuredContent: result,
});

// Something is found by name. A name that is not found, matches several, or was not the one the person said is a question
// for the agent, and nothing changes. `listKey` names the list of choices handed back when nothing matched.
// `label` words a row for the agent when its name is not enough, as for two tasks with one title.
export const withNamed = async <Row extends { id: number; name: string }>(
  rows: readonly Row[],
  name: string,
  words: string,
  listKey: string,
  found: (row: Row) => Promise<Result>,
  label: (row: Row) => string = (row) => row.name,
): Promise<Result> => {
  const resolved = resolveName(name, rows);
  if (resolved.kind === "none") return { status: "not_found", name, [listKey]: rows.map(label) };
  if (resolved.kind === "many") return { status: "ambiguous", matches: resolved.matches.map(label) };
  const { match } = resolved;
  if (
    chosenFromSeveral(
      match.name,
      words,
      rows.map((row) => row.name),
    )
  ) {
    return { status: "not_said", name: match.name, message: assistantCopy.skipped.notSaid(match.name) };
  }
  return found(match);
};

// A refused rule from the router ("already done today", "name taken") is an answer for the agent, not a failure, in words
// the agent can pass on rather than a list of validation issues.
export const answered = async (run: () => Promise<Result>): Promise<Result> =>
  run().catch((error: unknown) => {
    if (error instanceof TRPCError) return { status: "error", message: errorMessage(error) };
    throw error;
  });

export const written = (tool: string, args: unknown, db: Db, run: () => Promise<Result>) =>
  journalled(db, tool, args, () => answered(run)).then(({ result, actionId }) => ({ ...result, actionId }));

export type WriteToolName = Exclude<McpToolName, "list_due">;

// A write tool that needs the person's own words. `label` names the area in the "done" text.
export const registerWrite = (
  server: McpServer,
  label: string,
  name: WriteToolName,
  run: (args: never, words: string) => Promise<Result>,
) =>
  server.registerTool(
    name,
    {
      description: `${mcpToolDescriptions[name]} ${mcpMessages.saidRule}`,
      inputSchema: mcpToolSchemas[name].extend({ said }),
      annotations: { readOnlyHint: false, destructiveHint: false },
    },
    async ({ said: words, ...args }: Record<string, unknown> & { said: string }) => {
      const result = await run(args as never, words);
      return reply(
        result,
        String(result.message ?? mcpMessages.written(label, (result.actionId as number | null) ?? null)),
      );
    },
  );
