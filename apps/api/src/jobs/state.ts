import { eq } from "drizzle-orm";
import type { Db } from "../db/client";
import { jobState } from "../db/schema";

export const readState = (db: Pick<Db, "select">, key: string): string | null =>
  db.select().from(jobState).where(eq(jobState.key, key)).get()?.value ?? null;

export const writeState = (db: Pick<Db, "insert">, key: string, value: string): void => {
  db.insert(jobState).values({ key, value }).onConflictDoUpdate({ target: jobState.key, set: { value } }).run();
};
