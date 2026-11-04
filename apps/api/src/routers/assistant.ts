import { TRPCError } from "@trpc/server";
import { and, asc, gt, inArray, isNull, max } from "drizzle-orm";
import { z } from "zod";
import { undoAction } from "../ai/journal";
import { runAssistant } from "../ai/loop";
import { OllamaUnreachable, type ChatMessage } from "../ai/ollama";
import type { Db } from "../db/client";
import { assistantActions, assistantMessages } from "../db/schema";
import { assistantCopy as copy } from "../messages";
import { publicProcedure, router } from "../trpc";

const pad = (value: number) => String(value).padStart(2, "0");
const localDate = (date: Date) => `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;

const sendInput = z.object({
  text: z.string().trim().min(1).max(2000),
  // The id of the last message when this screen was opened. The model sees only what came after it.
  after: z.number().int().min(0),
});

type MessageRow = typeof assistantMessages.$inferSelect;

const toView = (store: Db, rows: MessageRow[]) => {
  const ids = rows.flatMap((row) => row.actionIds);
  const actions = ids.length === 0 ? [] : store.select().from(assistantActions).where(inArray(assistantActions.id, ids)).all();
  return rows.map((row) => ({
    id: row.id,
    role: row.role,
    text: row.text,
    createdAt: row.createdAt,
    actions: row.actionIds.flatMap((id) => {
      const action = actions.find((candidate) => candidate.id === id);
      return action ? [{ id, tool: action.tool, undone: action.undoneAt !== null }] : [];
    }),
  }));
};

const shown = isNull(assistantMessages.clearedAt);

const screenMessages = (store: Db, after: number): ChatMessage[] =>
  store
    .select()
    .from(assistantMessages)
    .where(and(shown, gt(assistantMessages.id, after)))
    .orderBy(asc(assistantMessages.id))
    .all()
    .map((row) => ({ role: row.role, content: row.text }));

// One message at a time, so the chat reads in the order it was sent and the model sees the one before.
let queue: Promise<unknown> = Promise.resolve();
const inTurn = <T>(task: () => Promise<T>): Promise<T> => {
  const result = queue.then(task, task);
  queue = result.catch(() => undefined);
  return result;
};

export const assistantRouter = router({
  send: publicProcedure.input(sendInput).mutation(({ ctx, input }) => inTurn(async () => {
    const deps = ctx.assistant;
    if (!deps) throw new TRPCError({ code: "PRECONDITION_FAILED", message: copy.noModel });
    const store = ctx.db;
    try {
      const { reply, actionIds } = await runAssistant({
        db: store,
        chat: deps.chat,
        today: localDate(deps.now()),
        history: screenMessages(store, input.after),
        text: input.text,
      });
      const [, saved] = store
        .insert(assistantMessages)
        .values([
          { role: "user", text: input.text, actionIds: [] },
          { role: "assistant", text: reply, actionIds },
        ])
        .returning()
        .all();
      return { status: "reply" as const, message: toView(store, [saved!])[0]! };
    } catch (error) {
      if (error instanceof OllamaUnreachable) return { status: "unreachable" as const };
      throw error;
    }
  })),

  history: publicProcedure.query(({ ctx }) => {
    const store = ctx.db;
    return {
      messages: toView(store, store.select().from(assistantMessages).where(shown).orderBy(asc(assistantMessages.id)).all()),
      lastId: store.select({ id: max(assistantMessages.id) }).from(assistantMessages).get()?.id ?? 0,
    };
  }),

  undo: publicProcedure.input(z.object({ actionId: z.number().int() })).mutation(({ ctx, input }) => {
    const result = undoAction(ctx.db, input.actionId);
    if (result.ok) return { ok: true as const };
    const message =
      result.reason === "changed" ? copy.undoChanged(result.label) : result.reason === "undone" ? copy.undoneAlready : copy.undoMissing;
    return { ok: false as const, message };
  }),

  clear: publicProcedure.mutation(({ ctx }) => {
    ctx.db.update(assistantMessages).set({ clearedAt: new Date().toISOString() }).where(shown).run();
  }),

  status: publicProcedure.query(async ({ ctx }) => ({
    status: ctx.assistant ? await ctx.assistant.chat.status() : ("unreachable" as const),
  })),
});
