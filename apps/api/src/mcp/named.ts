import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { resolveName } from "@homer/shared";
import { chosenFromSeveral } from "../ai/guard";
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
export const withNamed = async <Row extends { id: number; name: string }>(
  rows: readonly Row[],
  name: string,
  words: string,
  listKey: string,
  found: (row: Row) => Promise<Result>,
): Promise<Result> => {
  const resolved = resolveName(name, rows);
  if (resolved.kind === "none") return { status: "not_found", name, [listKey]: rows.map((row) => row.name) };
  if (resolved.kind === "many") return { status: "ambiguous", matches: resolved.matches.map((row) => row.name) };
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

// A refused rule from the router ("already done today", "name taken") is an answer for the agent, not a failure.
export const answered = async (run: () => Promise<Result>): Promise<Result> =>
  run().catch((error: unknown) => {
    if (error instanceof TRPCError) return { status: "error", message: error.message };
    throw error;
  });

export const written = (tool: string, args: unknown, db: Db, run: () => Promise<Result>) =>
  journalled(db, tool, args, () => answered(run)).then(({ result, actionId }) => ({ ...result, actionId }));
