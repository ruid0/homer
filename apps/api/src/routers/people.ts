import { TRPCError } from "@trpc/server";
import { and, eq, isNull, ne, sql } from "drizzle-orm";
import { personInputSchema, renamePersonInputSchema } from "@homer/shared";
import type { Db } from "../db/client";
import { people } from "../db/schema";
import { messages } from "../messages";
import { publicProcedure, router } from "../trpc";

const notFound = () => new TRPCError({ code: "NOT_FOUND", message: messages.personNotFound });

const nameTaken = (name: string) => new TRPCError({ code: "CONFLICT", message: messages.personNameTaken(name) });

// Nothing removes people now, but rows hidden by an earlier build must stay hidden.
const isActive = isNull(people.archivedAt);

const nameInUse = (db: Pick<Db, "select">, name: string, exceptId: number | undefined = undefined): boolean =>
  db
    .select({ id: people.id })
    .from(people)
    .where(
      and(
        sql`lower(${people.name}) = lower(${name})`,
        isActive,
        exceptId === undefined ? undefined : ne(people.id, exceptId),
      ),
    )
    .get() !== undefined;

export const peopleRouter = router({
  list: publicProcedure.query(({ ctx }) => ctx.db.select().from(people).where(isActive).orderBy(people.name).all()),

  add: publicProcedure.input(personInputSchema).mutation(({ ctx, input }) =>
    ctx.db.transaction((tx) => {
      if (nameInUse(tx, input.name)) throw nameTaken(input.name);
      return tx.insert(people).values({ name: input.name }).returning().get();
    }),
  ),

  rename: publicProcedure.input(renamePersonInputSchema).mutation(({ ctx, input }) =>
    ctx.db.transaction((tx) => {
      if (nameInUse(tx, input.name, input.id)) throw nameTaken(input.name);
      const renamed = tx
        .update(people)
        .set({ name: input.name })
        .where(and(eq(people.id, input.id), isActive))
        .returning()
        .get();
      if (!renamed) throw notFound();
      return renamed;
    }),
  ),
});
