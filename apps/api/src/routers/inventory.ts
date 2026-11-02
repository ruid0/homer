import { TRPCError } from "@trpc/server";
import { and, desc, eq, isNull, ne, sql } from "drizzle-orm";
import { z } from "zod";
import {
  daysRemaining,
  effectiveEstimate,
  idInputSchema,
  isRunningLow,
  itemInputSchema,
  restockInputSchema,
  updateItemInputSchema,
} from "@homer/shared";
import type { Db } from "../db/client";
import { items, restocks } from "../db/schema";
import { publicProcedure, router } from "../trpc";

type ItemRow = typeof items.$inferSelect;

const notFound = () => new TRPCError({ code: "NOT_FOUND", message: "That item doesn't exist. Refresh the list." });

const nameTaken = (name: string) =>
  new TRPCError({ code: "CONFLICT", message: `${name} is already tracked. Edit that item instead.` });

const findActive = (db: Pick<Db, "select">, id: number): ItemRow => {
  const row = db.select().from(items).where(and(eq(items.id, id), isNull(items.archivedAt))).get();
  if (!row) throw notFound();
  return row;
};

const activeNameTaken = (db: Db, name: string, exceptId?: number): boolean =>
  db
    .select({ id: items.id })
    .from(items)
    .where(
      and(
        sql`lower(${items.name}) = lower(${name})`,
        isNull(items.archivedAt),
        exceptId === undefined ? undefined : ne(items.id, exceptId),
      ),
    )
    .get() !== undefined;

const usualRestock = (db: Db, itemId: number): number | null =>
  db
    .select({ quantity: restocks.quantity })
    .from(restocks)
    .where(eq(restocks.itemId, itemId))
    .orderBy(desc(restocks.restockedAt), desc(restocks.id))
    .get()?.quantity ?? null;

const toListItem = (db: Db, row: ItemRow) => {
  const estimate = effectiveEstimate(row);
  const days = daysRemaining(row.quantity, estimate?.daysPerUnit ?? null);
  return {
    ...row,
    daysRemaining: days,
    runningLow: isRunningLow(days, row.lowThresholdDays),
    estimateSource: estimate?.source ?? null,
    usualRestock: usualRestock(db, row.id),
  };
};

const itemValues = (input: z.infer<typeof itemInputSchema>) => ({
  name: input.name,
  unit: input.unit,
  quantity: input.quantity,
  daysPerUnitEntered: input.daysPerUnit,
  lowThresholdDays: input.lowThresholdDays,
});

export const inventoryRouter = router({
  list: publicProcedure.query(({ ctx }) =>
    ctx.db
      .select()
      .from(items)
      .where(isNull(items.archivedAt))
      .orderBy(items.name)
      .all()
      .map((row) => toListItem(ctx.db, row)),
  ),

  create: publicProcedure.input(itemInputSchema).mutation(({ ctx, input }) => {
    if (activeNameTaken(ctx.db, input.name)) throw nameTaken(input.name);
    return ctx.db.insert(items).values(itemValues(input)).returning().get();
  }),

  update: publicProcedure.input(updateItemInputSchema).mutation(({ ctx, input }) => {
    findActive(ctx.db, input.id);
    if (activeNameTaken(ctx.db, input.name, input.id)) throw nameTaken(input.name);
    return ctx.db.update(items).set(itemValues(input)).where(eq(items.id, input.id)).returning().get();
  }),

  archive: publicProcedure.input(idInputSchema).mutation(({ ctx, input }) => {
    findActive(ctx.db, input.id);
    ctx.db.update(items).set({ archivedAt: new Date().toISOString() }).where(eq(items.id, input.id)).run();
  }),

  restock: publicProcedure.input(restockInputSchema).mutation(({ ctx, input }) =>
    ctx.db.transaction((tx) => {
      findActive(tx, input.itemId);
      tx.update(items)
        .set({ quantity: sql`${items.quantity} + ${input.quantity}` })
        .where(eq(items.id, input.itemId))
        .run();
      tx.insert(restocks).values({ itemId: input.itemId, quantity: input.quantity }).run();
    }),
  ),

  markOut: publicProcedure.input(idInputSchema).mutation(({ ctx, input }) => {
    findActive(ctx.db, input.id);
    ctx.db.update(items).set({ quantity: 0 }).where(eq(items.id, input.id)).run();
  }),

  history: publicProcedure.input(idInputSchema).query(({ ctx, input }) =>
    ctx.db
      .select()
      .from(restocks)
      .where(eq(restocks.itemId, input.id))
      .orderBy(desc(restocks.restockedAt), desc(restocks.id))
      .all(),
  ),
});
