import { TRPCError } from "@trpc/server";
import { and, isNull } from "drizzle-orm";
import { ZodError } from "zod";
import { MAX_SCHEDULE_DAYS, daysBetween, resolveName, toolDefinitions, type Named, type Resolution, type ToolCall, type ToolName } from "@homer/shared";
import type { Db } from "../db/client";
import { tasks } from "../db/schema";
import { toolMessages } from "../messages";
import { createCaller } from "../routers/index";
import { journalled } from "./journal";

type Api = ReturnType<typeof createCaller>;
type Context = { db: Db; api: Api; today: string };
type ToolResult = Record<string, unknown>;
type Args<N extends ToolName> = Extract<ToolCall, { name: N }>["args"];
type Handlers = { [N in ToolName]: (context: Context, args: Args<N>) => Promise<ToolResult> };

export type ToolRun = { result: ToolResult; actionId: number | null };

// Names come from the household and reach the model inside results, so the loop must frame results as data.
const names = (matches: readonly Named[]) => matches.map((match) => match.name);

// Turns a lookup that did not find exactly one row into a result the model can ask a question about.
const orAsk = async <T extends Named>(
  resolution: Resolution<T>,
  missing: ToolResult,
  found: (match: T) => Promise<ToolResult>,
  describe: (matches: readonly T[]) => string[] = names,
): Promise<ToolResult> => {
  if (resolution.kind === "none") return missing;
  if (resolution.kind === "many") return { status: "ambiguous", matches: describe(resolution.matches) };
  return found(resolution.match);
};

const openTasks = (db: Db) =>
  db
    .select({ id: tasks.id, name: tasks.title, dueDate: tasks.dueDate })
    .from(tasks)
    .where(and(isNull(tasks.doneAt), isNull(tasks.removedAt)))
    .orderBy(tasks.id)
    .all();

const withPerson = async (
  { api }: Context,
  person: string | null | undefined,
  found: (personId: number | null, personName: string | null) => Promise<ToolResult>,
): Promise<ToolResult> => {
  if (person == null) return found(null, null);
  const people = await api.people.list();
  return orAsk(resolveName(person, people), { status: "person_not_found", name: person, people: names(people) }, (match) =>
    found(match.id, match.name),
  );
};

const handlers: Handlers = {
  list_items: async ({ api }) => ({
    items: (await api.inventory.list()).map(({ name, quantity, unit, daysRemaining, runningLow }) => ({
      name,
      quantity,
      unit,
      daysRemaining,
      runningLow,
    })),
  }),

  mark_out: async ({ api }, { name }) =>
    orAsk(resolveName(name, await api.inventory.list()), { status: "not_tracked", name }, async (match) => {
      await api.inventory.markOut({ id: match.id });
      return { status: "done", item: match.name, onGroceryList: true };
    }),

  restock_item: async ({ api }, { name, quantity }) =>
    orAsk(resolveName(name, await api.inventory.list()), { status: "not_tracked", name }, async (match) => {
      await api.inventory.restock({ itemId: match.id, quantity });
      const now = (await api.inventory.list()).find((candidate) => candidate.id === match.id);
      return { status: "done", item: match.name, added: quantity, quantity: now?.quantity ?? null, unit: match.unit };
    }),

  add_item: async ({ api }, { name, unit, quantity, daysPerUnit }) => {
    const created = await api.inventory.create({ name, unit, quantity, daysPerUnit: daysPerUnit ?? null });
    return { status: "done", item: created.name, quantity: created.quantity, unit: created.unit };
  },

  list_groceries: async ({ api }) => ({
    entries: (await api.groceries.list()).map(({ text, quantity, unit }) => ({ name: text, quantity, unit })),
  }),

  add_to_groceries: async ({ api }, { name, quantity }) => {
    const amount = quantity ?? undefined;
    const resolution = resolveName(name, await api.inventory.list());
    if (resolution.kind === "many") return { status: "ambiguous", matches: names(resolution.matches) };
    const entry =
      resolution.kind === "one"
        ? await api.groceries.add({ itemId: resolution.match.id, quantity: amount })
        : await api.groceries.add({ text: name, quantity: amount });
    return { status: "done", name: resolution.kind === "one" ? resolution.match.name : entry.text, quantity: entry.quantity };
  },

  mark_bought: async ({ api }, { name, quantity }) => {
    const entries = await api.groceries.list();
    return orAsk(resolveName(name, entries.map(({ id, text }) => ({ id, name: text }))), { status: "not_on_list", name }, async (match) => {
      const entry = entries.find((candidate) => candidate.id === match.id);
      const tracked = entry?.itemId != null;
      if (tracked && quantity == null) return { status: "needs_quantity", name: match.name };
      await api.groceries.markBought({ id: match.id, quantity: quantity ?? undefined });
      return { status: "done", name: match.name, restocked: tracked ? (quantity ?? null) : null };
    });
  },

  list_tasks: async ({ api, today }, { from, to }) => {
    const start = from ?? today;
    const end = to ?? start;
    const requested = daysBetween(start, end) + 1;
    if (requested < 1) return { status: "error", message: toolMessages.rangeBackwards };
    if (requested > MAX_SCHEDULE_DAYS) return { status: "error", message: toolMessages.rangeTooLong(MAX_SCHEDULE_DAYS) };
    // Overdue always counts from the real today. The schedule only looks forward, so past days are left out.
    const view = await api.schedule.view({ today, days: Math.max(1, Math.min(daysBetween(today, end) + 1, MAX_SCHEDULE_DAYS)) });
    const show = ({ title, dueDate, dueTime, personName }: (typeof view.overdue)[number]) => ({ title, dueDate, dueTime, person: personName });
    return {
      overdue: view.overdue.map(show),
      days: view.days
        .filter((day) => day.date >= start && day.date <= end)
        .map((day) => ({
          date: day.date,
          tasks: day.tasks.map(show),
          events: day.events.map(({ title, time, personName }) => ({ title, time, person: personName })),
        })),
      undated: view.undated.map(show),
    };
  },

  add_task: async (context, { title, dueDate, dueTime, repeat, person }) =>
    withPerson(context, person, async (personId, personName) => {
      const created = await context.api.tasks.add({
        title,
        dueDate: dueDate ?? null,
        dueTime: dueTime ?? null,
        repeat: repeat ?? null,
        personId,
      });
      return { status: "done", title: created.title, dueDate: created.dueDate, person: personName };
    }),

  add_event: async (context, { title, date, time, person }) =>
    withPerson(context, person, async (personId, personName) => {
      const created = await context.api.events.add({ title, date, time: time ?? null, personId });
      return { status: "done", title: created.title, date: created.date, time: created.time, person: personName };
    }),

  complete_task: async ({ api, db, today }, { title }) =>
    orAsk(
      resolveName(title, openTasks(db)),
      { status: "not_found", title },
      async (match) => {
        const { next } = await api.tasks.complete({ id: match.id, today });
        return { status: "done", title: match.name, nextDueDate: next?.dueDate ?? null };
      },
      // Two tasks can share a title, so the due date tells them apart.
      (matches) => matches.map((match) => (match.dueDate ? `${match.name} (due ${match.dueDate})` : match.name)),
    ),
};

const readOnly = new Set(toolDefinitions.filter((tool) => !tool.writes).map((tool) => tool.name));

// What went wrong, in words the model can act on.
const errorMessage = (error: TRPCError): string =>
  error.cause instanceof ZodError ? error.cause.issues.map((issue) => issue.message).join(" ") : error.message;

const execute = async (context: Context, call: ToolCall): Promise<ToolResult> => {
  try {
    // `call` is a union of name and matching args, so this pairing is safe.
    return await (handlers[call.name] as (context: Context, args: unknown) => Promise<ToolResult>)(context, call.args);
  } catch (error) {
    if (error instanceof TRPCError) return { status: "error", message: errorMessage(error) };
    throw error;
  }
};

// Read tools run as they are. Write tools run inside the journal, so what they change can be undone.
export const runTool = async (db: Db, today: string, call: ToolCall): Promise<ToolRun> => {
  const context = { db, api: createCaller({ db }), today };
  if (readOnly.has(call.name)) return { result: await execute(context, call), actionId: null };
  const { result, actionId } = await journalled(db, call.name, call.args, () => execute(context, call));
  return { result, actionId };
};
