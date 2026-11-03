import { serve } from "@hono/node-server";
import { createApp } from "./app";
import { createDb } from "./db/client";
import { backfillGrocery } from "./groceries/backfill";

export type { AppRouter } from "./routers";

const port = Number(process.env.PORT ?? 3001);
const databasePath = process.env.DATABASE_PATH || "./homer.db";

const db = createDb(databasePath);
backfillGrocery(db);

serve({ fetch: createApp(db).fetch, port }, () => {
  console.log(`api listening on :${port}, database ${databasePath}`);
});
