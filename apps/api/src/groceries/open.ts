import { and, eq, isNull } from "drizzle-orm";
import type { Db } from "../db/client";
import { groceryEntries } from "../db/schema";

export type GroceryTx = Pick<Db, "select" | "insert" | "update">;

export const openEntries = and(isNull(groceryEntries.boughtAt), isNull(groceryEntries.removedAt));

export const openEntriesFor = (itemId: number) => and(eq(groceryEntries.itemId, itemId), openEntries);
