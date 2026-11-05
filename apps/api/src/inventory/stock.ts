import { and, desc, eq, gte, sql } from "drizzle-orm";
import { learnDaysPerUnit, type Learned } from "@homer/shared";
import type { Db } from "../db/client";
import { items, restocks } from "../db/schema";

export const usualRestock = (store: Pick<Db, "select">, itemId: number): number | null =>
  store
    .select({ quantity: restocks.quantity })
    .from(restocks)
    .where(eq(restocks.itemId, itemId))
    .orderBy(desc(restocks.restockedAt), desc(restocks.id))
    .get()?.quantity ?? null;

// What the item has been restocked with since the person last set its estimate by hand.
const learnedFromHistory = (store: Pick<Db, "select">, itemId: number, since: string | null): Learned | null =>
  learnDaysPerUnit(
    store
      .select({ quantity: restocks.quantity, restockedAt: restocks.restockedAt })
      .from(restocks)
      .where(and(eq(restocks.itemId, itemId), since === null ? undefined : gte(restocks.restockedAt, since)))
      .all(),
  );

type Learning = { id: number; learningSince: string | null; daysPerUnitLearned: number | null };

// How many restocks the learned estimate on this item rests on, or null when it has none.
export const learnedFrom = (store: Pick<Db, "select">, item: Learning): number | null =>
  item.daysPerUnitLearned === null ? null : (learnedFromHistory(store, item.id, item.learningSince)?.restocks ?? null);

// Keeps the stored learned estimate in step with the restock history. Null until there is enough history to trust.
export const relearn = (store: Pick<Db, "select" | "update">, itemId: number): void => {
  const since = store.select({ since: items.learningSince }).from(items).where(eq(items.id, itemId)).get()?.since ?? null;
  const learned = learnedFromHistory(store, itemId, since);
  store.update(items).set({ daysPerUnitLearned: learned?.daysPerUnit ?? null }).where(eq(items.id, itemId)).run();
};

export const applyRestock = (store: Pick<Db, "select" | "update" | "insert">, itemId: number, quantity: number): void => {
  store
    .update(items)
    .set({ quantity: sql`${items.quantity} + ${quantity}` })
    .where(eq(items.id, itemId))
    .run();
  store.insert(restocks).values({ itemId, quantity }).run();
  relearn(store, itemId);
};
