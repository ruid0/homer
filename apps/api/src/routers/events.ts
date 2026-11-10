import { TRPCError } from "@trpc/server";
import { and, eq, isNull } from "drizzle-orm";
import { eventInputSchema, idInputSchema, updateEventInputSchema } from "@homer/shared";
import type { Db } from "../db/client";
import { events } from "../db/schema";
import { messages } from "../messages";
import { requirePerson } from "../people/lookup";
import { publicProcedure, router } from "../trpc";

const removed = () => new TRPCError({ code: "NOT_FOUND", message: messages.eventRemoved });

export const isShown = isNull(events.removedAt);

const requireShown = (db: Pick<Db, "select">, id: number): void => {
  const found = db.select({ id: events.id }).from(events).where(and(eq(events.id, id), isShown)).get();
  if (!found) throw removed();
};

const requireAssignee = (db: Pick<Db, "select">, personId: number | null) => {
  if (personId !== null) requirePerson(db, personId);
};

export const eventsRouter = router({
  add: publicProcedure.input(eventInputSchema).mutation(({ ctx, input }) =>
    ctx.db.transaction((tx) => {
      requireAssignee(tx, input.personId);
      return tx.insert(events).values(input).returning().get();
    }),
  ),

  update: publicProcedure.input(updateEventInputSchema).mutation(({ ctx, input }) =>
    ctx.db.transaction((tx) => {
      requireShown(tx, input.id);
      requireAssignee(tx, input.personId);
      const { id, ...fields } = input;
      return tx.update(events).set(fields).where(eq(events.id, id)).returning().get();
    }),
  ),

  remove: publicProcedure.input(idInputSchema).mutation(({ ctx, input }) =>
    ctx.db.transaction((tx) => {
      requireShown(tx, input.id);
      tx.update(events).set({ removedAt: new Date().toISOString() }).where(eq(events.id, input.id)).run();
    }),
  ),
});
