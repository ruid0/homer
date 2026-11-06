import { TRPCError } from "@trpc/server";
import { and, asc, eq, inArray, isNull, max } from "drizzle-orm";
import {
  MAX_ROUTINE_WEEKS_BACK,
  addDays,
  idInputSchema,
  moveRoutineItemInputSchema,
  routineItemInputSchema,
  routineWeekInputSchema,
  setRoutineCountInputSchema,
  updateRoutineItemInputSchema,
  weekDates,
} from "@homer/shared";
import type { Db } from "../db/client";
import { routineItems, routineTicks } from "../db/schema";
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
});
