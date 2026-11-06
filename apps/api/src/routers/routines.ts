import { TRPCError } from "@trpc/server";
import { and, asc, eq, inArray, isNull, max } from "drizzle-orm";
import {
  routineRemindersInputSchema,
  MAX_ROUTINE_WEEKS_BACK,
  addDays,
  addReminderInputSchema,
  clockText,
  idInputSchema,
  parseReminderWhen,
  reminderFireAt,
  moveRoutineItemInputSchema,
  routineItemInputSchema,
  routineWeekInputSchema,
  setRoutineCountInputSchema,
  updateRoutineItemInputSchema,
  weekDates,
} from "@homer/shared";
import type { Db } from "../db/client";
import { people, routineItems, routineReminders, routineTicks } from "../db/schema";
import { messages } from "../messages";
import { requirePerson } from "../people/lookup";
import { publicProcedure, router } from "../trpc";

const isShown = isNull(routineItems.removedAt);

const rowRemoved = () => new TRPCError({ code: "NOT_FOUND", message: messages.routineRowRemoved });

const requireShown = (db: Pick<Db, "select">, id: number) => {
  const row = db.select().from(routineItems).where(and(eq(routineItems.id, id), isShown)).get();
  if (!row) throw rowRemoved();
  return row;
};

const shownRows = (db: Pick<Db, "select">, personId: number) =>
  db
    .select()
    .from(routineItems)
    .where(and(eq(routineItems.personId, personId), isShown))
    .orderBy(asc(routineItems.position), asc(routineItems.id))
    .all();

const requireDayAllowed = (date: string, today: string) => {
  if (date > today) throw new TRPCError({ code: "BAD_REQUEST", message: messages.routineDateInFuture });
  const oldest = addDays(weekDates(today)[0]!, -7 * MAX_ROUTINE_WEEKS_BACK);
  if (date < oldest) {
    throw new TRPCError({ code: "BAD_REQUEST", message: messages.routineDateTooOld(MAX_ROUTINE_WEEKS_BACK) });
  }
};

const nextPosition = (db: Pick<Db, "select">, personId: number): number => {
  const last = db
    .select({ last: max(routineItems.position) })
    .from(routineItems)
    .where(eq(routineItems.personId, personId))
    .get();
  return (last?.last ?? -1) + 1;
};

export const routinesRouter = router({
  week: publicProcedure.input(routineWeekInputSchema).query(({ ctx, input }) => {
    requirePerson(ctx.db, input.personId);
    const days = weekDates(input.weekOf ?? input.today);
    const rows = shownRows(ctx.db, input.personId);
    const ticks = rows.length
      ? ctx.db
          .select()
          .from(routineTicks)
          .where(
            and(
              inArray(routineTicks.routineItemId, rows.map((row) => row.id)),
              inArray(routineTicks.date, days),
            ),
          )
          .all()
      : [];
    const countOf = (itemId: number, day: string) =>
      ticks.find((tick) => tick.routineItemId === itemId && tick.date === day)?.count ?? 0;
    return { days, items: rows.map((row) => ({ ...row, counts: days.map((day) => countOf(row.id, day)) })) };
  }),

  addItem: publicProcedure.input(routineItemInputSchema).mutation(({ ctx, input }) =>
    ctx.db.transaction((tx) => {
      requirePerson(tx, input.personId);
      return tx
        .insert(routineItems)
        .values({ ...input, position: nextPosition(tx, input.personId) })
        .returning()
        .get();
    }),
  ),

  updateItem: publicProcedure.input(updateRoutineItemInputSchema).mutation(({ ctx, input }) =>
    ctx.db.transaction((tx) => {
      requireShown(tx, input.id);
      const { id, ...fields } = input;
      return tx.update(routineItems).set(fields).where(eq(routineItems.id, id)).returning().get();
    }),
  ),

  moveItem: publicProcedure.input(moveRoutineItemInputSchema).mutation(({ ctx, input }) =>
    ctx.db.transaction((tx) => {
      const row = requireShown(tx, input.id);
      const rows = shownRows(tx, row.personId);
      const at = rows.findIndex((other) => other.id === row.id);
      const neighbour = rows[input.direction === "up" ? at - 1 : at + 1];
      if (!neighbour) return;
      // Positions can tie after earlier edits, so the list is renumbered by place rather than two values swapped.
      const swap = (other: typeof row) => (other.id === row.id ? neighbour : other.id === neighbour.id ? row : other);
      const reordered = rows.map(swap);
      reordered.forEach((other, position) =>
        tx.update(routineItems).set({ position }).where(eq(routineItems.id, other.id)).run(),
      );
    }),
  ),

  removeItem: publicProcedure.input(idInputSchema).mutation(({ ctx, input }) =>
    ctx.db.transaction((tx) => {
      requireShown(tx, input.id);
      tx.update(routineItems).set({ removedAt: new Date().toISOString() }).where(eq(routineItems.id, input.id)).run();
    }),
  ),

  setCount: publicProcedure.input(setRoutineCountInputSchema).mutation(({ ctx, input }) =>
    ctx.db.transaction((tx) => {
      requireDayAllowed(input.date, input.today);
      requireShown(tx, input.itemId);
      const { itemId: routineItemId, date, count } = input;
      return tx
        .insert(routineTicks)
        .values({ routineItemId, date, count })
        .onConflictDoUpdate({ target: [routineTicks.routineItemId, routineTicks.date], set: { count } })
        .returning()
        .get();
    }),
  ),

  // The open reminders on a person's rows. Nothing about the secret topic.
  reminders: publicProcedure.input(routineRemindersInputSchema).query(({ ctx, input }) => {
    requirePerson(ctx.db, input.personId);
    return ctx.db
      .select({ id: routineReminders.id, itemId: routineReminders.routineItemId, fireAt: routineReminders.fireAt, dailyTime: routineReminders.dailyTime })
      .from(routineReminders)
      .innerJoin(routineItems, eq(routineItems.id, routineReminders.routineItemId))
      .where(and(eq(routineItems.personId, input.personId), isShown, isNull(routineReminders.removedAt)))
      .orderBy(asc(routineReminders.fireAt))
      .all();
  }),

  addReminder: publicProcedure.input(addReminderInputSchema).mutation(({ ctx, input }) =>
    ctx.db.transaction((tx) => {
      const row = requireShown(tx, input.itemId);
      const person = tx.select({ topic: people.notifyTopic }).from(people).where(eq(people.id, row.personId)).get();
      if (!person?.topic) throw new TRPCError({ code: "PRECONDITION_FAILED", message: messages.remindersOff });
      const when = parseReminderWhen(input.text);
      if (!when) throw new TRPCError({ code: "BAD_REQUEST", message: messages.reminderWhenUnknown });
      if (input.repeatDaily && when.kind !== "at") {
        throw new TRPCError({ code: "BAD_REQUEST", message: messages.reminderDailyNeedsClock });
      }
      const fireAt = reminderFireAt(when, ctx.now?.() ?? new Date()).toISOString();
      const dailyTime = input.repeatDaily && when.kind === "at" ? clockText(when.hour, when.minute) : null;
      return tx.insert(routineReminders).values({ routineItemId: row.id, fireAt, dailyTime }).returning().get();
    }),
  ),

  removeReminder: publicProcedure.input(idInputSchema).mutation(({ ctx, input }) =>
    ctx.db.transaction((tx) => {
      const open = and(eq(routineReminders.id, input.id), isNull(routineReminders.removedAt));
      if (!tx.select({ id: routineReminders.id }).from(routineReminders).where(open).get()) {
        throw new TRPCError({ code: "NOT_FOUND", message: messages.reminderGone });
      }
      tx.update(routineReminders).set({ removedAt: new Date().toISOString() }).where(open).run();
    }),
  ),
});
