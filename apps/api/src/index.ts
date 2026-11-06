import { serve } from "@hono/node-server";
import { createApp } from "./app";
import { createOllamaClient } from "./ai/ollama";
import { createDb } from "./db/client";
import { backfillGrocery } from "./groceries/backfill";
import { startBackups } from "./jobs/backups";
import { startDepletion } from "./jobs/depletion";
import { startEndOfDay } from "./jobs/endOfDay";
import { startRoutineReminders } from "./jobs/routineReminders";
import { householdNotifications } from "./notify/household";

export type { AppRouter } from "./routers";

const port = Number(process.env.PORT ?? 3001);
const databasePath = process.env.DATABASE_PATH || "./homer.db";

const db = createDb(databasePath);
backfillGrocery(db);

const household = householdNotifications(process.env);

startDepletion(db, { time: process.env.DEPLETION_TIME || "05:30", onListed: household?.announceListed });
if (household) {
  startEndOfDay(db, { time: process.env.END_OF_DAY_TIME || "20:00", topic: household.topic, notify: household.notify });
  startRoutineReminders(db, { notify: household.notify });
}
startBackups(db, { dir: process.env.BACKUP_DIR || "./backups", time: process.env.BACKUP_TIME || "06:00" });

const chat = createOllamaClient({
  host: process.env.OLLAMA_HOST || "http://127.0.0.1:11434",
  model: process.env.LOCAL_TEXT_MODEL || "qwen3.5:9b",
  think: process.env.LOCAL_LLM_THINK !== "false",
  timeoutMs: Number(process.env.LOCAL_LLM_TIMEOUT_MS) || 300_000,
});

serve({ fetch: createApp(db, { chat, now: () => new Date() }, household?.server ?? null).fetch, port }, () => {
  console.log(`api listening on :${port}, database ${databasePath}`);
});
