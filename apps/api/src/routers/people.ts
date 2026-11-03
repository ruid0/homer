import { TRPCError } from "@trpc/server";
import { and, eq, ne, sql } from "drizzle-orm";
import { personInputSchema, renamePersonInputSchema } from "@homer/shared";
import type { Db } from "../db/client";
import { people } from "../db/schema";
import { messages } from "../messages";
import { isActivePerson, requirePerson } from "../people/lookup";
import { publicProcedure, router } from "../trpc";

const nameTaken = (name: string) => new TRPCError({ code: "CONFLICT", message: messages.personNameTaken(name) });

const nameInUse = (db: Pick<Db, "select">, name: string, exceptId?: number): boolean =>
  db
    .select({ id: people.id })
    .from(people)
    .where(
      and(
        sql`lower(${people.name}) = lower(${name})`,
        isActivePerson,
        exceptId === undefined ? undefined : ne(people.id, exceptId),
      ),
    )
    .get() !== undefined;

export const peopleRouter = router({
  list: publicProcedure.query(({ ctx }) =>
    ctx.db.select().from(people).where(isActivePerson).orderBy(people.name).all(),
  ),

  add: publicProcedure.input(personInputSchema).mutation(({ ctx, input }) =>
    ctx.db.transaction((tx) => {
      if (nameInUse(tx, input.name)) throw nameTaken(input.name);
      return tx.insert(people).values({ name: input.name }).returning().get();
    }),
  ),

  rename: publicProcedure.input(renamePersonInputSchema).mutation(({ ctx, input }) =>
    ctx.db.transaction((tx) => {
      requirePerson(tx, input.id);
      if (nameInUse(tx, input.name, input.id)) throw nameTaken(input.name);
      return tx.update(people).set({ name: input.name }).where(eq(people.id, input.id)).returning().get();
    }),
  ),
});
