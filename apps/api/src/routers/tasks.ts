import { TRPCError } from "@trpc/server";
import { and, eq, isNull } from "drizzle-orm";
import { completeTaskInputSchema, idInputSchema, nextDueDate, taskInputSchema, updateTaskInputSchema } from "@homer/shared";
import type { Db } from "../db/client";
import { tasks } from "../db/schema";
import { messages } from "../messages";
import { requirePerson } from "../people/lookup";
import { publicProcedure, router } from "../trpc";

type TaskRow = typeof tasks.$inferSelect;
type TaskFields = Pick<TaskRow, "title" | "dueDate" | "dueTime" | "repeat" | "personId">;

const closed = () => new TRPCError({ code: "NOT_FOUND", message: messages.taskClosed });

const isOpen = and(isNull(tasks.doneAt), isNull(tasks.removedAt));

const findOpen = (db: Pick<Db, "select">, id: number): TaskRow => {
  const row = db.select().from(tasks).where(and(eq(tasks.id, id), isOpen)).get();
  if (!row) throw closed();
  return row;
};

const fieldsOf = ({ title, dueDate, dueTime, repeat, personId }: TaskFields): TaskFields => ({
  title,
  dueDate,
  dueTime,
  repeat,
  personId,
});

const requireAssignee = (db: Pick<Db, "select">, personId: number | null) => {
  if (personId !== null) requirePerson(db, personId);
};

export const tasksRouter = router({
  add: publicProcedure.input(taskInputSchema).mutation(({ ctx, input }) =>
    ctx.db.transaction((tx) => {
      requireAssignee(tx, input.personId);
      return tx.insert(tasks).values(fieldsOf(input)).returning().get();
    }),
  ),

  update: publicProcedure.input(updateTaskInputSchema).mutation(({ ctx, input }) =>
    ctx.db.transaction((tx) => {
      findOpen(tx, input.id);
      requireAssignee(tx, input.personId);
      return tx.update(tasks).set(fieldsOf(input)).where(eq(tasks.id, input.id)).returning().get();
    }),
  ),

  complete: publicProcedure.input(completeTaskInputSchema).mutation(({ ctx, input }) =>
    ctx.db.transaction((tx) => {
      const task = findOpen(tx, input.id);
      tx.update(tasks).set({ doneAt: new Date().toISOString() }).where(eq(tasks.id, task.id)).run();
      const { dueDate, repeat } = task;
      const next =
        dueDate === null || repeat === null
          ? null
          : tx
              .insert(tasks)
              .values({ ...fieldsOf(task), dueDate: nextDueDate(dueDate, repeat, input.today) })
              .returning()
              .get();
      return { next };
    }),
  ),

  remove: publicProcedure.input(idInputSchema).mutation(({ ctx, input }) => {
    const task = findOpen(ctx.db, input.id);
    ctx.db.update(tasks).set({ removedAt: new Date().toISOString() }).where(eq(tasks.id, task.id)).run();
  }),
});
