import { trpcServer } from "@hono/trpc-server";
import { Hono } from "hono";
import type { Db } from "./db/client";
import { appRouter } from "./routers";
import type { AssistantDeps } from "./trpc";

export const createApp = (db: Db, assistant?: AssistantDeps) =>
  new Hono()
    // Docker Compose asks this to know the api is up.
    .get("/health", (c) => c.text("ok"))
    .use("/trpc/*", trpcServer({ router: appRouter, createContext: () => ({ db, assistant }) }));
