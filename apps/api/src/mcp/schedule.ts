import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { and, asc, eq, gte, isNull } from "drizzle-orm";
import type { z } from "zod";
import { mcpToolSchemas, resolveName } from "@homer/shared";
import type { Db } from "../db/client";
import { events, tasks } from "../db/schema";
import { mcpMessages } from "../messages";
import { createCaller } from "../routers/index";
import { registerWrite, withNamed, written, type Result } from "./named";

type Name = "update_task" | "remove_task" | "update_event" | "remove_event";
type Args<N extends Name> = z.infer<(typeof mcpToolSchemas)[N]>;
type Deps = { db: Db; today: () => string };

const unchanged = (values: readonly unknown[], clear: readonly unknown[] | null | undefined) =>
  values.every((value) => value == null) && (clear ?? []).length === 0;

// Setting a field and clearing it in one call is a mistake to hand back, not to guess at.
const contradicts = (set: Record<string, unknown>, clear: readonly string[] | null | undefined) =>
  (clear ?? []).some((field) => set[field] != null);

const named = <Row extends { title: string; id: number }>(rows: readonly Row[]) =>
  rows.map((row) => ({ ...row, name: row.title }));

// Tasks and events, changed the way the app changes them. The in-app assistant does not get these.
export const registerScheduleTools = (server: McpServer, { db, today }: Deps) => {
  const api = createCaller({ db });
  const write = <N extends Name>(name: N, run: (args: Args<N>, words: string) => Promise<Result>) =>
    registerWrite(server, "schedule", name, run as never);

  // An open task, found by its title. onDate tells apart two that share one.
  const openTasks = (onDate: string | null | undefined) =>
    named(
      db
        .select()
        .from(tasks)
        .where(and(isNull(tasks.doneAt), isNull(tasks.removedAt)))
        .orderBy(asc(tasks.dueDate), asc(tasks.id))
        .all()
        .filter((task) => onDate == null || task.dueDate === onDate),
    );
  const taskLabel = (task: { title: string; dueDate: string | null }) =>
    task.dueDate === null ? task.title : `${task.title} (${task.dueDate})`;

  // An event, found by its title: the ones from today on, or the ones on onDate (which may be past).
  const shownEvents = (onDate: string | null | undefined) =>
    named(
      db
        .select()
        .from(events)
        .where(and(isNull(events.removedAt), onDate == null ? gte(events.date, today()) : eq(events.date, onDate)))
        .orderBy(asc(events.date), asc(events.id))
        .all(),
    );
  const eventLabel = (event: { title: string; date: string }) => `${event.title} (${event.date})`;

  // The person said by name, or undefined when none was given.
  const withPerson = async (
    person: string | null | undefined,
    found: (personId: number | undefined) => Promise<Result>,
  ): Promise<Result> => {
    if (person == null) return found(undefined);
    const people = await api.people.list();
    const resolved = resolveName(person, people);
    if (resolved.kind === "one") return found(resolved.match.id);
    if (resolved.kind === "many") return { status: "ambiguous", matches: resolved.matches.map((match) => match.name) };
    return { status: "person_not_found", name: person, people: people.map((entry) => entry.name) };
  };

  write("update_task", async (args, words) => {
    const clear = new Set(args.clear ?? []);
    const set = { dueDate: args.dueDate, dueTime: args.dueTime, repeat: args.repeat, person: args.person };
    if (contradicts(set, args.clear)) return { status: "invalid", message: mcpMessages.setAndClear };
    if (unchanged([args.newTitle, ...Object.values(set)], args.clear)) {
      return { status: "nothing_to_change", message: mcpMessages.nothingToChange };
    }
    return withNamed(
      openTasks(args.onDate),
      args.title,
      words,
      "tasks",
      (task) =>
        withPerson(args.person, (personId) =>
          written("update_task", args, db, () =>
            api.tasks
              .update({
                id: task.id,
                title: args.newTitle ?? task.title,
                dueDate: clear.has("dueDate") ? null : (args.dueDate ?? task.dueDate),
                dueTime: clear.has("dueTime") ? null : (args.dueTime ?? task.dueTime),
                repeat: clear.has("repeat") ? null : (args.repeat ?? task.repeat),
                personId: clear.has("person") ? null : (personId ?? task.personId),
              })
              .then((updated) => ({ status: "updated", title: updated.title, dueDate: updated.dueDate })),
          ),
        ),
      taskLabel,
    );
  });

  write("remove_task", async (args, words) =>
    withNamed(
      openTasks(args.onDate),
      args.title,
      words,
      "tasks",
      (task) =>
        written("remove_task", args, db, () =>
          api.tasks
            .remove({ id: task.id })
            .then(() => ({ status: "removed", title: task.title, dueDate: task.dueDate })),
        ),
      taskLabel,
    ),
  );

  write("update_event", async (args, words) => {
    const clear = new Set(args.clear ?? []);
    const set = { date: args.date, time: args.time, person: args.person };
    if (contradicts(set, args.clear)) return { status: "invalid", message: mcpMessages.setAndClear };
    if (unchanged([args.newTitle, ...Object.values(set)], args.clear)) {
      return { status: "nothing_to_change", message: mcpMessages.nothingToChange };
    }
    return withNamed(
      shownEvents(args.onDate),
      args.title,
      words,
      "events",
      (event) =>
        withPerson(args.person, (personId) =>
          written("update_event", args, db, () =>
            api.events
              .update({
                id: event.id,
                title: args.newTitle ?? event.title,
                date: args.date ?? event.date,
                time: clear.has("time") ? null : (args.time ?? event.time),
                personId: clear.has("person") ? null : (personId ?? event.personId),
              })
              .then((updated) => ({ status: "updated", title: updated.title, date: updated.date })),
          ),
        ),
      eventLabel,
    );
  });

  write("remove_event", async (args, words) =>
    withNamed(
      shownEvents(args.onDate),
      args.title,
      words,
      "events",
      (event) =>
        written("remove_event", args, db, () =>
          api.events.remove({ id: event.id }).then(() => ({ status: "removed", title: event.title, date: event.date })),
        ),
      eventLabel,
    ),
  );
};
