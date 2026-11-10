import cron from "node-cron";
import { eq, isNull } from "drizzle-orm";
import { daysBetween, depleteStock, effectiveEstimate } from "@homer/shared";
import type { Db } from "../db/client";
import { groceryEntries, items } from "../db/schema";
import { openEntries } from "../groceries/open";
import { syncGrocery } from "../groceries/sync";
import { depletionLog } from "../messages";
import { localDate, parseClockTime } from "../time";

type Item = typeof items.$inferSelect;

const elapsedDays = (item: Item, today: string): number =>
  item.depletedOn === null ? 0 : Math.max(0, daysBetween(item.depletedOn, today));

const used = (item: Item, today: string): number =>
  depleteStock(item.quantity, effectiveEstimate(item)?.daysPerUnit ?? null, elapsedDays(item, today));

// Takes the days that passed since each item was last handled off its quantity, then lets the grocery list follow.
export type DepletionResult = { changed: number; listed: number };

const openCount = (db: Pick<Db, "select">): number => db.select().from(groceryEntries).where(openEntries).all().length;

// Returns how many items changed and the net rise in open grocery entries (entries added minus any closed).
export const depleteAll = (db: Db, today: string): DepletionResult =>
  db.transaction((tx) => {
    const listedBefore = openCount(tx);
    const active = tx.select().from(items).where(isNull(items.archivedAt)).all();
    const due = active.filter((item) => item.depletedOn !== today);
    const changed = due.filter((item) => used(item, today) !== item.quantity);
    due.forEach((item) => {
      tx.update(items).set({ quantity: used(item, today), depletedOn: today }).where(eq(items.id, item.id)).run();
    });
    // Only items whose quantity moved are synced, so the run never adds list entries for stock nobody touched.
    changed.forEach((item) => syncGrocery(tx, item.id));
    return { changed: changed.length, listed: Math.max(0, openCount(tx) - listedBefore) };
  });

type Options = {
  time: string;
  now?: () => Date;
  log?: (message: string) => void;
  // Called after a run that put items on the grocery list.
  onListed?: (count: number) => void;
};

const messageOf = (error: unknown) => (error instanceof Error ? error.message : String(error));

// Never throws: a bad time is logged and the api carries on without the daily job.
export const startDepletion = (db: Db, { time, now = () => new Date(), log = console.log, onListed }: Options) => {
  try {
    const { hour, minute } = parseClockTime(time, "DEPLETION_TIME");
    const run = () => {
      try {
        const { changed, listed } = depleteAll(db, localDate(now()));
        log(depletionLog.done(changed));
        if (listed > 0) onListed?.(listed);
      } catch (error) {
        log(depletionLog.failed(messageOf(error)));
      }
    };
    // A Mac that slept through the time catches up on the days it missed as soon as the api starts.
    run();
    return cron.schedule(`${minute} ${hour} * * *`, run);
  } catch (error) {
    log(depletionLog.failed(messageOf(error)));
    return null;
  }
};
