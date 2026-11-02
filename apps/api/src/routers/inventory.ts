import { TRPCError } from "@trpc/server";
import { and, desc, eq, isNotNull, isNull, ne, sql } from "drizzle-orm";
import { z } from "zod";
import {
  daysRemaining,
  effectiveEstimate,
  idInputSchema,
  isRunningLow,
  itemInputSchema,
  nameInputSchema,
  restockInputSchema,
  updateItemInputSchema,
} from "@homer/shared";
import type { Db } from "../db/client";
import { items, restocks } from "../db/schema";
import { closeOpenEntry, removeOpenEntries, syncGrocery } from "../groceries/sync";
import { applyRestock, usualRestock } from "../inventory/stock";
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

const findArchivedByName = (db: Db, name: string): ItemRow | null =>
  db
    .select()
    .from(items)
    .where(and(sql`lower(${items.name}) = lower(${name})`, isNotNull(items.archivedAt)))
    .orderBy(desc(items.archivedAt), desc(items.id))
    .get() ?? null;

const findArchived = (db: Db, id: number): ItemRow => {
  const row = db.select().from(items).where(and(eq(items.id, id), isNotNull(items.archivedAt))).get();
  if (!row) throw notFound();
  return row;
};

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
    return ctx.db.transaction((tx) => {
      const created = tx.insert(items).values(itemValues(input)).returning().get();
      syncGrocery(tx, created.id);
      return created;
    });
  }),

  update: publicProcedure.input(updateItemInputSchema).mutation(({ ctx, input }) => {
    findActive(ctx.db, input.id);
    if (activeNameTaken(ctx.db, input.name, input.id)) throw nameTaken(input.name);
    return ctx.db.transaction((tx) => {
      const updated = tx.update(items).set(itemValues(input)).where(eq(items.id, input.id)).returning().get();
      syncGrocery(tx, input.id);
      return updated;
    });
  }),

  archive: publicProcedure.input(idInputSchema).mutation(({ ctx, input }) => {
    findActive(ctx.db, input.id);
    ctx.db.transaction((tx) => {
      tx.update(items).set({ archivedAt: new Date().toISOString() }).where(eq(items.id, input.id)).run();
      removeOpenEntries(tx, input.id);
    });
  }),

  restock: publicProcedure.input(restockInputSchema).mutation(({ ctx, input }) =>
    ctx.db.transaction((tx) => {
      findActive(tx, input.itemId);
      applyRestock(tx, input.itemId, input.quantity);
      closeOpenEntry(tx, input.itemId);
      syncGrocery(tx, input.itemId);
    }),
  ),

  findArchived: publicProcedure
    .input(nameInputSchema)
    .query(({ ctx, input }) => findArchivedByName(ctx.db, input.name)),

  restore: publicProcedure.input(updateItemInputSchema).mutation(({ ctx, input }) => {
    findArchived(ctx.db, input.id);
    if (activeNameTaken(ctx.db, input.name)) throw nameTaken(input.name);
    return ctx.db.transaction((tx) => {
      const restored = tx
        .update(items)
        .set({ ...itemValues(input), archivedAt: null })
        .where(eq(items.id, input.id))
        .returning()
        .get();
      syncGrocery(tx, input.id);
      return restored;
    });
  }),

  markOut: publicProcedure.input(idInputSchema).mutation(({ ctx, input }) => {
    findActive(ctx.db, input.id);
    ctx.db.transaction((tx) => {
      tx.update(items).set({ quantity: 0 }).where(eq(items.id, input.id)).run();
      syncGrocery(tx, input.id);
    });
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
