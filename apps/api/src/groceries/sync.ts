import { and, eq, isNull } from "drizzle-orm";
import { daysRemaining, effectiveEstimate, groceryAction, needsRestock } from "@homer/shared";
import type { Db } from "../db/client";
import { groceryEntries, items } from "../db/schema";
import { usualRestock } from "../inventory/stock";

type Tx = Pick<Db, "select" | "insert" | "update">;

const isOpen = (itemId: number) =>
  and(eq(groceryEntries.itemId, itemId), isNull(groceryEntries.boughtAt), isNull(groceryEntries.removedAt));

const openEntryFor = (db: Pick<Db, "select">, itemId: number) =>
  db.select().from(groceryEntries).where(isOpen(itemId)).get();

const stockNeedsRestock = (item: typeof items.$inferSelect): boolean => {
  const estimate = effectiveEstimate(item);
  const days = daysRemaining(item.quantity, estimate?.daysPerUnit ?? null);
  return needsRestock({ quantity: item.quantity, daysRemaining: days, lowThresholdDays: item.lowThresholdDays });
};

// Call after any change to an item, inside the same transaction as that change.
export const syncGrocery = (db: Tx, itemId: number): void => {
  const item = db.select().from(items).where(eq(items.id, itemId)).get();
  if (!item || item.archivedAt) return;
  const open = openEntryFor(db, itemId);
  const action = groceryAction(stockNeedsRestock(item), open ? { addedBy: open.addedBy } : null);
  if (action === "add") {
    db.insert(groceryEntries)
      .values({ itemId, text: item.name, quantity: usualRestock(db, itemId), addedBy: "auto" })
      .run();
  }
  if (action === "remove" && open) {
    db.update(groceryEntries).set({ removedAt: new Date().toISOString() }).where(eq(groceryEntries.id, open.id)).run();
  }
};

export const closeOpenEntry = (db: Pick<Db, "update">, itemId: number): void => {
  db.update(groceryEntries).set({ boughtAt: new Date().toISOString() }).where(isOpen(itemId)).run();
};

export const removeOpenEntries = (db: Pick<Db, "update">, itemId: number): void => {
  db.update(groceryEntries).set({ removedAt: new Date().toISOString() }).where(isOpen(itemId)).run();
};
