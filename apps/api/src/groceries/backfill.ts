import { isNull } from "drizzle-orm";
import type { Db } from "../db/client";
import { items } from "../db/schema";
import { syncGrocery } from "./sync";

const BACKFILL_DONE = 1;

// Gives items that were already low before the grocery list existed their first entry.
// SQLite's user_version records that it ran, so an entry someone removes later stays removed.
export const backfillGrocery = (db: Db): boolean => {
  if (db.$client.pragma("user_version", { simple: true }) === BACKFILL_DONE) return false;
  db.transaction((tx) => {
    tx.select({ id: items.id }).from(items).where(isNull(items.archivedAt)).all().forEach(({ id }) => syncGrocery(tx, id));
  });
  db.$client.pragma(`user_version = ${BACKFILL_DONE}`);
  return true;
};
