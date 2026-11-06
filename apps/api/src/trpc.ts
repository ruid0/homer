import { initTRPC } from "@trpc/server";
import type { ChatClient } from "./ai/ollama";
import type { Db } from "./db/client";

export type AssistantDeps = { chat: ChatClient; now: () => Date };

// `assistant` is left out in tests that do not need the model.
// `ntfyServer` is null when notifications are off.
export type Context = { db: Db; assistant?: AssistantDeps; ntfyServer?: string | null; now?: () => Date };

const t = initTRPC.context<Context>().create();

export const router = t.router;
export const publicProcedure = t.procedure;
export const createCallerFactory = t.createCallerFactory;
