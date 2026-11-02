import { desc, eq, sql } from "drizzle-orm";
import type { Db } from "../db/client";
import { items, restocks } from "../db/schema";

export const usualRestock = (db: Pick<Db, "select">, itemId: number): number | null =>
  db
    .select({ quantity: restocks.quantity })
    .from(restocks)
    .where(eq(restocks.itemId, itemId))
    .orderBy(desc(restocks.restockedAt), desc(restocks.id))
    .get()?.quantity ?? null;

export const applyRestock = (db: Pick<Db, "update" | "insert">, itemId: number, quantity: number): void => {
  db.update(items)
    .set({ quantity: sql`${items.quantity} + ${quantity}` })
    .where(eq(items.id, itemId))
    .run();
  db.insert(restocks).values({ itemId, quantity }).run();
};
