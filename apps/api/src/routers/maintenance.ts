import { TRPCError } from "@trpc/server";
import { and, desc, eq, isNull, max, ne, sql } from "drizzle-orm";
import {
  compareMaintenance,
  dueOn,
  idInputSchema,
  maintenanceItemInputSchema,
  maintenanceListInputSchema,
  maintenanceStatus,
  markMaintenanceDoneInputSchema,
  undoMaintenanceDoneInputSchema,
  updateMaintenanceItemInputSchema,
} from "@homer/shared";
import type { Db } from "../db/client";
import { maintenanceDone, maintenanceItems } from "../db/schema";
import { messages } from "../messages";
import { publicProcedure, router } from "../trpc";

const isShown = isNull(maintenanceItems.removedAt);

const itemGone = () => new TRPCError({ code: "NOT_FOUND", message: messages.maintenanceGone });

const requireShown = (db: Pick<Db, "select">, id: number) => {
  const item = db.select().from(maintenanceItems).where(and(eq(maintenanceItems.id, id), isShown)).get();
  if (!item) throw itemGone();
  return item;
};

const nameInUse = (db: Pick<Db, "select">, name: string, exceptId?: number): boolean =>
  db
    .select({ id: maintenanceItems.id })
    .from(maintenanceItems)
    .where(
      and(
        sql`lower(${maintenanceItems.name}) = lower(${name})`,
        isShown,
        exceptId === undefined ? undefined : ne(maintenanceItems.id, exceptId),
      ),
    )
    .get() !== undefined;

const nameTaken = (name: string) => new TRPCError({ code: "CONFLICT", message: messages.maintenanceNameTaken(name) });

// last_done_on is always the latest done_on among the item's rows.
const syncLastDone = (db: Pick<Db, "select" | "update">, itemId: number): string | null => {
  const latest =
    db.select({ latest: max(maintenanceDone.doneOn) }).from(maintenanceDone).where(eq(maintenanceDone.itemId, itemId)).get()?.latest ?? null;
  db.update(maintenanceItems).set({ lastDoneOn: latest }).where(eq(maintenanceItems.id, itemId)).run();
  return latest;
};

export const maintenanceRouter = router({
  list: publicProcedure.input(maintenanceListInputSchema).query(({ ctx, input }) =>
    ctx.db
      .select({
        id: maintenanceItems.id,
        name: maintenanceItems.name,
        every: maintenanceItems.every,
        unit: maintenanceItems.unit,
        lastDoneOn: maintenanceItems.lastDoneOn,
        createdOn: maintenanceItems.createdOn,
      })
      .from(maintenanceItems)
      .where(isShown)
      .all()
      .map((item) => {
        const due = dueOn(item, item.every, item.unit);
        return { ...item, dueOn: due, ...maintenanceStatus(due, input.today) };
      })
      .sort(compareMaintenance),
  ),

  add: publicProcedure.input(maintenanceItemInputSchema).mutation(({ ctx, input }) =>
    ctx.db.transaction((tx) => {
      if (nameInUse(tx, input.name)) throw nameTaken(input.name);
      const created = tx
        .insert(maintenanceItems)
        .values({ name: input.name, every: input.every, unit: input.unit, createdOn: input.today })
        .returning({ id: maintenanceItems.id })
        .get();
      if (input.lastDoneOn !== null) {
        tx.insert(maintenanceDone).values({ itemId: created.id, doneOn: input.lastDoneOn }).run();
        syncLastDone(tx, created.id);
      }
      return created;
    }),
  ),

  update: publicProcedure.input(updateMaintenanceItemInputSchema).mutation(({ ctx, input }) =>
    ctx.db.transaction((tx) => {
      requireShown(tx, input.id);
      if (nameInUse(tx, input.name, input.id)) throw nameTaken(input.name);
      tx.update(maintenanceItems)
        .set({ name: input.name, every: input.every, unit: input.unit })
        .where(eq(maintenanceItems.id, input.id))
        .run();
      return { id: input.id };
    }),
  ),

  // Soft: the item and its done dates stay in the database.
  remove: publicProcedure.input(idInputSchema).mutation(({ ctx, input }) =>
    ctx.db.transaction((tx) => {
      requireShown(tx, input.id);
      tx.update(maintenanceItems).set({ removedAt: new Date().toISOString() }).where(eq(maintenanceItems.id, input.id)).run();
      return { id: input.id };
    }),
  ),

  markDone: publicProcedure.input(markMaintenanceDoneInputSchema).mutation(({ ctx, input }) =>
    ctx.db.transaction((tx) => {
      requireShown(tx, input.id);
      const { id: doneId } = tx
        .insert(maintenanceDone)
        .values({ itemId: input.id, doneOn: input.doneOn })
        .returning({ id: maintenanceDone.id })
        .get();
      return { doneId, lastDoneOn: syncLastDone(tx, input.id) };
    }),
  ),

  // Removes exactly that done record, so a double tap or a second device never removes a different one.
  undoDone: publicProcedure.input(undoMaintenanceDoneInputSchema).mutation(({ ctx, input }) =>
    ctx.db.transaction((tx) => {
      const done = tx.select().from(maintenanceDone).where(eq(maintenanceDone.id, input.doneId)).get();
      if (!done) throw new TRPCError({ code: "NOT_FOUND", message: messages.maintenanceDoneGone });
      requireShown(tx, done.itemId);
      tx.delete(maintenanceDone).where(eq(maintenanceDone.id, done.id)).run();
      return { lastDoneOn: syncLastDone(tx, done.itemId) };
    }),
  ),

  history: publicProcedure.input(idInputSchema).query(({ ctx, input }) =>
    ctx.db
      .select({ id: maintenanceDone.id, doneOn: maintenanceDone.doneOn })
      .from(maintenanceDone)
      .where(eq(maintenanceDone.itemId, input.id))
      .orderBy(desc(maintenanceDone.doneOn), desc(maintenanceDone.id))
      .all(),
  ),
});
