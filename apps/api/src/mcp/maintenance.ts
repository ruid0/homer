import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import {
  addDays,
  maintenanceInWindow,
  mcpToolDescriptions,
  mcpToolSchemas,
  resolveName,
  routinesOpen,
  type McpToolName,
} from "@homer/shared";
import { chosenFromSeveral } from "../ai/guard";
import { journalled } from "../ai/journal";
import { runTool } from "../ai/tools";
import type { Db } from "../db/client";
import { assistantCopy, mcpMessages } from "../messages";
import { createCaller } from "../routers/index";

type Deps = { db: Db; today: () => string };
type Result = Record<string, unknown>;

const DEFAULT_DAYS = 7;

const span = (days: number | null | undefined) => days ?? DEFAULT_DAYS;

const said = z.string().trim().min(1).describe(mcpMessages.saidField);

const reply = (result: Result, text: string) => ({
  content: [{ type: "text" as const, text }],
  structuredContent: result,
});

const due = async ({ db, today }: Deps, days: number | null | undefined): Promise<Result> => {
  const now = today();
  const api = createCaller({ db });
  const maintenance = maintenanceInWindow(await api.maintenance.list({ today: now }), span(days)).map(
    ({ name, dueOn, daysUntil, status }) => ({ name, dueOn, daysUntil, status }),
  );
  const people = await api.people.list();
  const routines = routinesOpen(
    await Promise.all(
      people.map(async ({ id, name }) => {
        const week = await api.routines.week({ personId: id, today: now });
        const at = week.days.indexOf(now);
        return {
          person: name,
          rows: week.items.map((row) => ({
            name: row.name,
            targetPerDay: row.targetPerDay,
            doneToday: row.counts[at] ?? 0,
          })),
        };
      }),
    ),
  );
  const { result: tasks } = await runTool(db, now, {
    name: "list_tasks",
    args: { from: now, to: addDays(now, span(days) - 1) },
  });
  return { maintenance, routines, tasks };
};

// A job is found by name. A name that is not found, matches several, or was not the one the person said is a question.
const withJob = async (
  { db, today }: Deps,
  name: string,
  words: string,
  found: (job: { id: number; name: string }) => Promise<Result>,
): Promise<Result> => {
  const jobs = await createCaller({ db }).maintenance.list({ today: today() });
  const resolved = resolveName(name, jobs);
  if (resolved.kind === "none") return { status: "not_found", name, jobs: jobs.map((job) => job.name) };
  if (resolved.kind === "many") return { status: "ambiguous", matches: resolved.matches.map((job) => job.name) };
  const { match } = resolved;
  if (
    chosenFromSeveral(
      match.name,
      words,
      jobs.map((job) => job.name),
    )
  ) {
    return { status: "not_said", name: match.name, message: assistantCopy.skipped.notSaid(match.name) };
  }
  return found(match);
};

// A refused rule from the router ("already done today") is an answer for the agent, not a failure.
const answered = async (run: () => Promise<Result>): Promise<Result> =>
  run().catch((error: unknown) => {
    if (error instanceof TRPCError) return { status: "error", message: error.message };
    throw error;
  });

const written = (tool: string, args: unknown, db: Db, run: () => Promise<Result>) =>
  journalled(db, tool, args, () => answered(run)).then(({ result, actionId }) => ({ ...result, actionId }));

export const registerMaintenanceTools = (server: McpServer, deps: Deps) => {
  const { db, today } = deps;
  const text = (result: Result) =>
    String(result.message ?? mcpMessages.written("maintenance", (result.actionId as number | null) ?? null));

  server.registerTool(
    "list_due",
    {
      description: mcpToolDescriptions.list_due,
      inputSchema: mcpToolSchemas.list_due,
      annotations: { readOnlyHint: true },
    },
    async ({ days }: { days?: number | null }) => {
      const result = await due(deps, days);
      return reply(result, mcpMessages.dueSummary(span(days)));
    },
  );

  const write = (name: Exclude<McpToolName, "list_due">, run: (args: never, words: string) => Promise<Result>) =>
    server.registerTool(
      name,
      {
        description: `${mcpToolDescriptions[name]} ${mcpMessages.saidRule}`,
        inputSchema: mcpToolSchemas[name].extend({ said }),
        annotations: { readOnlyHint: false, destructiveHint: false },
      },
      async ({ said: words, ...args }: Record<string, unknown> & { said: string }) => {
        const result = await run(args as never, words);
        return reply(result, text(result));
      },
    );

  write("complete_maintenance", (args: { name: string; doneOn?: string | null }, words) =>
    withJob(deps, args.name, words, (job) =>
      written("complete_maintenance", args, db, () =>
        createCaller({ db })
          .maintenance.markDone({ id: job.id, doneOn: args.doneOn ?? today(), today: today() })
          .then(() => ({ status: "done", job: job.name })),
      ),
    ),
  );

  write("snooze_maintenance", (args: { name: string }, words) =>
    withJob(deps, args.name, words, (job) =>
      written("snooze_maintenance", args, db, () =>
        createCaller({ db })
          .maintenance.snooze({ id: job.id, until: addDays(today(), 1), today: today() })
          .then(() => ({ status: "snoozed", job: job.name, until: addDays(today(), 1) })),
      ),
    ),
  );

  write("add_maintenance", (args: z.infer<typeof mcpToolSchemas.add_maintenance>) =>
    written("add_maintenance", args, db, () =>
      createCaller({ db })
        .maintenance.add({ ...args, lastDoneOn: args.lastDoneOn ?? null, today: today() })
        .then(() => ({ status: "added", job: args.name })),
    ),
  );
};
