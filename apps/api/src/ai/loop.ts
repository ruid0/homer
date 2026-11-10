import { addSaidTime, parseToolCall, takesTime, resolveToolDates, toolDefinitions } from "@homer/shared";
import type { Db } from "../db/client";
import { assistantCopy } from "../messages";
import type { ChatClient, ChatMessage, RawToolCall } from "./ollama";
import { refuseWrite, type Said } from "./guard";
import { systemPrompt } from "./prompt";
import { composeReply, isWriteTool, withChanges, type DoneChange } from "./report";
import { knownNames, runTool } from "./tools";

export const MAX_ROUNDS = 6;
const MAX_INVALID_RETRIES = 2;

type Input = { db: Db; chat: ChatClient; today: string; history: ChatMessage[]; text: string };
export type Outcome = { reply: string; actionIds: number[] };

const asContent = (value: unknown) => JSON.stringify(value);

type Step = { messages: ChatMessage[]; actionIds: number[]; done: DoneChange[]; skipped: Record<string, unknown>[]; invalid: number };

// Runs every call of one model turn. A bad call is answered with the reason so the model can fix it. Nothing is written for it.
const runCalls = async (db: Db, today: string, said: Said, calls: RawToolCall[]): Promise<Step> => {
  const known = await knownNames(db);
  const step: Step = { messages: [], actionIds: [], done: [], skipped: [], invalid: 0 };
  // A said time is filled in only when one call can take it. With a task and an event in one turn it is not clear whose it is.
  const fillsTime = calls.filter((call) => takesTime(call.name)).length === 1;
  for (const call of calls) {
    const parsed = parseToolCall(call.name, fillsTime ? addSaidTime(call.name, resolveToolDates(call.args, today), said.now) : resolveToolDates(call.args, today));
    if (!parsed.ok) {
      step.invalid += 1;
      step.messages.push({ role: "tool", toolName: call.name, content: asContent({ status: "error", message: parsed.error }) });
      continue;
    }
    const refusal = isWriteTool(parsed.call.name) ? refuseWrite(parsed.call, said, known) : null;
    if (refusal !== null) {
      step.skipped.push(refusal);
      step.messages.push({ role: "tool", toolName: call.name, content: asContent(refusal) });
      continue;
    }
    const { result, actionId } = await runTool(db, today, parsed.call);
    if (actionId !== null) {
      step.actionIds.push(actionId);
      step.done.push({ name: parsed.call.name, result });
    } else if (isWriteTool(parsed.call.name)) {
      step.skipped.push(result);
    }
    step.messages.push({ role: "tool", toolName: call.name, content: asContent(result) });
  }
  return step;
};

// The model's loop: ask, run what it calls, show it the results, until it answers in words.
export const runAssistant = async ({ db, chat, today, history, text }: Input): Promise<Outcome> => {
  const messages: ChatMessage[] = [{ role: "system", content: systemPrompt(today) }, ...history, { role: "user", content: text }];
  const said = { now: text, recent: [...history.filter(({ role }) => role === "user").map(({ content }) => content), text].join(" ") };
  const actionIds: number[] = [];
  const done: DoneChange[] = [];
  const skipped: Record<string, unknown>[] = [];
  let invalid = 0;
  let retriedEmpty = false;
  try {
    for (let round = 0; round < MAX_ROUNDS; round += 1) {
      const reply = await chat.chat(messages, toolDefinitions);
      // A model sometimes returns nothing at all. Ask once more before giving up.
      if (reply.toolCalls.length === 0 && reply.content.trim() === "" && !retriedEmpty) {
        retriedEmpty = true;
        continue;
      }
      if (reply.toolCalls.length === 0) {
        return { reply: composeReply({ done, skipped }, reply.content), actionIds };
      }
      const step = await runCalls(db, today, said, reply.toolCalls);
      actionIds.push(...step.actionIds);
      done.push(...step.done);
      skipped.push(...step.skipped);
      invalid += step.invalid;
      if (invalid > MAX_INVALID_RETRIES) return { reply: withChanges({ done }, assistantCopy.gaveUp), actionIds };
      messages.push({ role: "assistant", content: reply.content, toolCalls: reply.toolCalls }, ...step.messages);
    }
    return { reply: withChanges({ done }, assistantCopy.tooManySteps), actionIds };
  } catch (error) {
    // Changes already made stay undoable from the chat, so report them instead of losing them.
    // Any failure counts: a database error in round two must not hide what round one already changed.
    if (actionIds.length > 0) return { reply: withChanges({ done }, assistantCopy.interrupted), actionIds };
    throw error;
  }
};
