import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import {
  addDays,
  maintenanceInWindow,
  mcpToolDescriptions,
  mcpToolSchemas,
  routinesOpen,
  type McpToolName,
} from "@homer/shared";
import { runTool } from "../ai/tools";
import type { Db } from "../db/client";
import { mcpMessages } from "../messages";
import { createCaller } from "../routers/index";
import { registerWrite, reply, withNamed, written, type Result } from "./named";

type Deps = { db: Db; today: () => string };

const DEFAULT_DAYS = 7;

const span = (days: number | null | undefined) => days ?? DEFAULT_DAYS;

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

const withJob = async (
  { db, today }: Deps,
  name: string,
  words: string,
  found: (job: { id: number; name: string }) => Promise<Result>,
): Promise<Result> =>
  withNamed(await createCaller({ db }).maintenance.list({ today: today() }), name, words, "jobs", found);

export const registerMaintenanceTools = (server: McpServer, deps: Deps) => {
  const { db, today } = deps;
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
    registerWrite(server, "maintenance", name, run);

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
