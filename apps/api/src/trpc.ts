import { initTRPC } from "@trpc/server";
import { schemaMessages } from "@homer/shared";
import { ZodError } from "zod";
import { issueMessages } from "./issues";
import type { ChatClient } from "./ai/ollama";
import type { Db } from "./db/client";

export type AssistantDeps = { chat: ChatClient; now: () => Date };

// `assistant` is left out in tests that do not need the model.
// `ntfyServer` is null when notifications are off.
export type Context = { db: Db; assistant?: AssistantDeps; ntfyServer?: string | null; now?: () => Date };

const written = new Set<string>(Object.values(schemaMessages));

// A refused input says what to fix when every issue has a message the schemas wrote for people.
// Anything else keeps the default shape, which at least names the field.
const t = initTRPC.context<Context>().create({
  errorFormatter: ({ shape, error }) =>
    error.cause instanceof ZodError && error.cause.issues.every((issue) => written.has(issue.message))
      ? { ...shape, message: issueMessages(error.cause) }
      : shape,
});

export const router = t.router;
export const publicProcedure = t.procedure;
export const createCallerFactory = t.createCallerFactory;
