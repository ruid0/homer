import { TRPCError } from "@trpc/server";
import { and, eq, isNull } from "drizzle-orm";
import type { Db } from "../db/client";
import { people } from "../db/schema";
import { messages } from "../messages";

export const personNotFound = () => new TRPCError({ code: "NOT_FOUND", message: messages.personNotFound });

// Nothing removes people now, but rows hidden by an earlier build must stay hidden.
export const isActivePerson = isNull(people.archivedAt);

export const requirePerson = (db: Pick<Db, "select">, id: number): void => {
  const found = db.select({ id: people.id }).from(people).where(and(eq(people.id, id), isActivePerson)).get();
  if (!found) throw personNotFound();
};
