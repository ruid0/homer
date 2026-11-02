import { serve } from "@hono/node-server";
import { createApp } from "./app";
import { createDb } from "./db/client";

export type { AppRouter } from "./routers";

const port = Number(process.env.PORT ?? 3001);
const databasePath = process.env.DATABASE_PATH || "./homer.db";

serve({ fetch: createApp(createDb(databasePath)).fetch, port }, () => {
  console.log(`api listening on :${port}, database ${databasePath}`);
});
