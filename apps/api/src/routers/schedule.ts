import { and, eq, isNull } from "drizzle-orm";
import { addDays, compareSchedule, daysBetween, isOverdue, scheduleViewInputSchema } from "@homer/shared";
import { people, tasks } from "../db/schema";
import { publicProcedure, router } from "../trpc";

type TaskRow = typeof tasks.$inferSelect;
type TaskView = TaskRow & { personName: string | null; daysOverdue: number };

const byWhen = (today: string) => (a: TaskRow, b: TaskRow) => {
  const entry = (task: TaskRow) => ({
    date: task.dueDate ?? "",
    time: task.dueTime,
    overdue: isOverdue(task, today),
  });
  return compareSchedule(entry(a), entry(b)) || a.title.localeCompare(b.title) || a.id - b.id;
};

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
    return {
      overdue: views.filter((task) => task.daysOverdue > 0),
      days: Array.from({ length: days }, (_, index) => addDays(today, index)).map((date) => ({
        date,
        tasks: views.filter((task) => task.dueDate === date),
      })),
      undated: views.filter((task) => task.dueDate === null),
    };
  }),
});
