import { isNull } from "drizzle-orm";
import type { Db } from "../db/client";
import { items } from "../db/schema";
import { syncGrocery } from "./sync";

// This is the only user of SQLite's user_version (drizzle keeps its own state in a table).
// A later one-time job must use a higher number, not reuse this one.
const BACKFILL_DONE = 1;

// Gives items that were already low before the grocery list existed their first entry.
// The marker is set in the same transaction, so an entry someone removes later is never brought back.
export const backfillGrocery = (db: Db): boolean => {
  if (Number(db.$client.pragma("user_version", { simple: true })) >= BACKFILL_DONE) return false;
  db.transaction((tx) => {
    const active = tx.select({ id: items.id }).from(items).where(isNull(items.archivedAt)).all();
    active.forEach(({ id }) => syncGrocery(tx, id));
    db.$client.pragma(`user_version = ${BACKFILL_DONE}`);
  });
  return true;
};
