import { TRPCError } from "@trpc/server";
import { and, eq, isNull, sql } from "drizzle-orm";
import type { Db } from "../db/client";
import { items } from "../db/schema";
import { messages } from "../messages";

export type ItemRow = typeof items.$inferSelect;

export const notFound = () =>
  new TRPCError({ code: "NOT_FOUND", message: messages.itemNotFound });

export const findActive = (db: Pick<Db, "select">, id: number): ItemRow => {
  const row = db.select().from(items).where(and(eq(items.id, id), isNull(items.archivedAt))).get();
  if (!row) throw notFound();
  return row;
};

export const findActiveByName = (db: Pick<Db, "select">, name: string): ItemRow | undefined =>
  db
    .select()
    .from(items)
    .where(and(sql`lower(${items.name}) = lower(${name})`, isNull(items.archivedAt)))
    .get();
