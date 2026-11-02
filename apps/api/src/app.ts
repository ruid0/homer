import { trpcServer } from "@hono/trpc-server";
import { Hono } from "hono";
import type { Db } from "./db/client";
import { appRouter } from "./routers";

export const createApp = (db: Db) =>
  new Hono().use("/trpc/*", trpcServer({ router: appRouter, createContext: () => ({ db }) }));
