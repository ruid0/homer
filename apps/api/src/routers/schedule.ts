import { and, eq, inArray, isNull } from "drizzle-orm";
import { addDays, compareSchedule, daysBetween, isOverdue, scheduleViewInputSchema } from "@homer/shared";
import { events, people, tasks } from "../db/schema";
import { isShown } from "./events";
import { publicProcedure, router } from "../trpc";

type TaskRow = typeof tasks.$inferSelect;
type EventRow = typeof events.$inferSelect;
type EventView = EventRow & { personName: string | null };
type TaskView = TaskRow & { personName: string | null; daysOverdue: number };

const byWhen = (today: string) => (a: TaskRow, b: TaskRow) => {
  const entry = (task: TaskRow) => ({
    date: task.dueDate ?? "",
    time: task.dueTime,
    overdue: isOverdue(task, today),
  });
  return compareSchedule(entry(a), entry(b)) || a.title.localeCompare(b.title) || a.id - b.id;
};

const entryOf = (event: { date: string; time: string | null }) => ({ ...event, overdue: false });

const eventOrder = (a: EventView, b: EventView) =>
  compareSchedule(entryOf(a), entryOf(b)) || a.title.localeCompare(b.title) || a.id - b.id;

const toView = (today: string) => ({ task, personName }: { task: TaskRow; personName: string | null }): TaskView => ({
  ...task,
  personName,
  daysOverdue: isOverdue(task, today) && task.dueDate !== null ? daysBetween(task.dueDate, today) : 0,
});

export const scheduleRouter = router({
  view: publicProcedure.input(scheduleViewInputSchema).query(({ ctx, input }) => {
    const { today, days, personId } = input;
    const open = and(
      isNull(tasks.doneAt),
      isNull(tasks.removedAt),
      personId === undefined ? undefined : eq(tasks.personId, personId),
    );
    const compare = byWhen(today);
    const views = ctx.db
      .select({ task: tasks, personName: people.name })
      .from(tasks)
      .leftJoin(people, eq(tasks.personId, people.id))
      .where(open)
      .all()
      .sort((a, b) => compare(a.task, b.task))
      .map(toView(today));
    const dates = Array.from({ length: days }, (_, index) => addDays(today, index));
    const inRange = and(
      isShown,
      inArray(events.date, dates),
      personId === undefined ? undefined : eq(events.personId, personId),
    );
    const shownEvents: EventView[] = ctx.db
      .select({ event: events, personName: people.name })
      .from(events)
      .leftJoin(people, eq(events.personId, people.id))
      .where(inRange)
      .all()
      .map(({ event, personName }) => ({ ...event, personName }))
      .sort(eventOrder);
    return {
      overdue: views.filter((task) => task.daysOverdue > 0),
      days: dates.map((date) => ({
        date,
        tasks: views.filter((task) => task.dueDate === date),
        events: shownEvents.filter((event) => event.date === date),
      })),
      undated: views.filter((task) => task.dueDate === null),
    };
  }),
});
