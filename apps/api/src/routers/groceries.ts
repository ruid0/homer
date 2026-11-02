import { TRPCError } from "@trpc/server";
import { and, asc, eq, isNull } from "drizzle-orm";
import { groceryAddInputSchema, groceryBoughtInputSchema, idInputSchema } from "@homer/shared";
import type { Db } from "../db/client";
import { groceryEntries, items } from "../db/schema";
import { syncGrocery } from "../groceries/sync";
import { findActive, findActiveByName, type ItemRow } from "../inventory/lookup";
import { applyRestock, usualRestock } from "../inventory/stock";
import { publicProcedure, router } from "../trpc";

type EntryRow = typeof groceryEntries.$inferSelect;
type Tx = Pick<Db, "select" | "insert" | "update">;

const entryClosed = () =>
  new TRPCError({ code: "NOT_FOUND", message: "That entry is already off the list. Refresh the list." });

const quantityNeeded = () =>
  new TRPCError({ code: "BAD_REQUEST", message: "Enter how much you bought." });

const isOpen = and(isNull(groceryEntries.boughtAt), isNull(groceryEntries.removedAt));

const findOpenEntry = (db: Pick<Db, "select">, id: number): EntryRow => {
  const row = db.select().from(groceryEntries).where(and(eq(groceryEntries.id, id), isOpen)).get();
  if (!row) throw entryClosed();
  return row;
};

const withItemDetails = (db: Db, entry: EntryRow) => {
  if (entry.itemId === null) return { ...entry, unit: null, usualRestock: null };
  const item = db.select({ unit: items.unit }).from(items).where(eq(items.id, entry.itemId)).get();
  return { ...entry, unit: item?.unit ?? null, usualRestock: usualRestock(db, entry.itemId) };
};

const addForItem = (db: Tx, item: ItemRow, quantity?: number): EntryRow => {
  const open = db
    .select()
    .from(groceryEntries)
    .where(and(eq(groceryEntries.itemId, item.id), isOpen))
    .get();
  if (!open) {
    return db
      .insert(groceryEntries)
      .values({ itemId: item.id, text: item.name, quantity: quantity ?? null, addedBy: "manual" })
      .returning()
      .get();
  }
  if (quantity === undefined) return open;
  return db.update(groceryEntries).set({ quantity }).where(eq(groceryEntries.id, open.id)).returning().get();
};

export const groceriesRouter = router({
  list: publicProcedure.query(({ ctx }) =>
    ctx.db
      .select()
      .from(groceryEntries)
      .where(isOpen)
      .orderBy(asc(groceryEntries.addedBy), asc(groceryEntries.createdAt), asc(groceryEntries.id))
      .all()
      .map((entry) => withItemDetails(ctx.db, entry)),
  ),

  add: publicProcedure.input(groceryAddInputSchema).mutation(({ ctx, input }) =>
    ctx.db.transaction((tx) => {
      if ("itemId" in input) return addForItem(tx, findActive(tx, input.itemId), input.quantity);
      const match = findActiveByName(tx, input.text);
      if (match) return addForItem(tx, match, input.quantity);
      return tx
        .insert(groceryEntries)
        .values({ text: input.text, quantity: input.quantity ?? null, addedBy: "manual" })
        .returning()
        .get();
    }),
  ),

  markBought: publicProcedure.input(groceryBoughtInputSchema).mutation(({ ctx, input }) =>
    ctx.db.transaction((tx) => {
      const entry = findOpenEntry(tx, input.id);
      if (entry.itemId !== null) {
        findActive(tx, entry.itemId);
        if (input.quantity === undefined) throw quantityNeeded();
        applyRestock(tx, entry.itemId, input.quantity);
      }
      tx.update(groceryEntries).set({ boughtAt: new Date().toISOString() }).where(eq(groceryEntries.id, entry.id)).run();
      if (entry.itemId !== null) syncGrocery(tx, entry.itemId);
    }),
  ),

  remove: publicProcedure.input(idInputSchema).mutation(({ ctx, input }) => {
    const entry = findOpenEntry(ctx.db, input.id);
    ctx.db.update(groceryEntries).set({ removedAt: new Date().toISOString() }).where(eq(groceryEntries.id, entry.id)).run();
  }),
});
