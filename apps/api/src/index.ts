import { serve } from "@hono/node-server";
import { createApp } from "./app";
import { createOllamaClient } from "./ai/ollama";
import { createDb } from "./db/client";
import { backfillGrocery } from "./groceries/backfill";

export type { AppRouter } from "./routers";

const port = Number(process.env.PORT ?? 3001);
const databasePath = process.env.DATABASE_PATH || "./homer.db";

const db = createDb(databasePath);
backfillGrocery(db);

const chat = createOllamaClient({
  host: process.env.OLLAMA_HOST || "http://127.0.0.1:11434",
  model: process.env.LOCAL_TEXT_MODEL || "qwen3.5:9b",
  think: process.env.LOCAL_LLM_THINK !== "false",
  timeoutMs: Number(process.env.LOCAL_LLM_TIMEOUT_MS) || 300_000,
});

serve({ fetch: createApp(db, { chat, now: () => new Date() }).fetch, port }, () => {
  console.log(`api listening on :${port}, database ${databasePath}`);
});
