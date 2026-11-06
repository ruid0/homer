import { randomBytes } from "node:crypto";
import { TRPCError } from "@trpc/server";
import { and, eq, isNull, ne, sql } from "drizzle-orm";
import { idInputSchema, personInputSchema, renamePersonInputSchema } from "@homer/shared";
import type { Db } from "../db/client";
import { people } from "../db/schema";
import { messages } from "../messages";
import { isActivePerson, requirePerson } from "../people/lookup";
import { publicProcedure, router } from "../trpc";

const nameTaken = (name: string) => new TRPCError({ code: "CONFLICT", message: messages.personNameTaken(name) });

// What leaves the api about a person. The secret reminder topic is left out; only whether it exists is shown.
const publicColumns = {
  id: people.id,
  name: people.name,
  createdAt: people.createdAt,
  archivedAt: people.archivedAt,
  remindersOn: sql<boolean>`${people.notifyTopic} is not null`.mapWith(Boolean),
};

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

const newTopic = () => `homer-${randomBytes(16).toString("hex")}`;

export const peopleRouter = router({
  list: publicProcedure.query(({ ctx }) =>
    ctx.db.select(publicColumns).from(people).where(isActivePerson).orderBy(people.name).all(),
  ),

  add: publicProcedure.input(personInputSchema).mutation(({ ctx, input }) =>
    ctx.db.transaction((tx) => {
      if (nameInUse(tx, input.name)) throw nameTaken(input.name);
      return tx.insert(people).values({ name: input.name }).returning(publicColumns).get();
    }),
  ),

  rename: publicProcedure.input(renamePersonInputSchema).mutation(({ ctx, input }) =>
    ctx.db.transaction((tx) => {
      requirePerson(tx, input.id);
      if (nameInUse(tx, input.name, input.id)) throw nameTaken(input.name);
      return tx.update(people).set({ name: input.name }).where(eq(people.id, input.id)).returning(publicColumns).get();
    }),
  ),

  // Gives the person a secret topic for their phone the first time, and the same one on every later call (no rotation).
  // The topic is shown only here, to set the phone up.
  reminderSetup: publicProcedure.input(idInputSchema).mutation(({ ctx, input }) => {
    if (!ctx.ntfyServer) throw new TRPCError({ code: "PRECONDITION_FAILED", message: messages.notificationsOff });
    const server = ctx.ntfyServer;
    return ctx.db.transaction((tx) => {
      requirePerson(tx, input.id);
      const existing = tx.select({ topic: people.notifyTopic }).from(people).where(eq(people.id, input.id)).get()?.topic;
      const topic = existing ?? newTopic();
      if (!existing) tx.update(people).set({ notifyTopic: topic }).where(and(eq(people.id, input.id), isNull(people.notifyTopic))).run();
      return { server, topic };
    });
  }),
});
