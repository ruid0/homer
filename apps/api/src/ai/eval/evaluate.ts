import { addSaidTime, parseToolCall, resolveToolDates } from "@homer/shared";
import { createDb } from "../../db/client";
import { createCaller } from "../../routers/index";
import { runAssistant } from "../loop";
import type { ChatClient } from "../ollama";
import type { ObservedCall } from "./checks";
import { EVAL_TODAY, type GoldenCase } from "./golden";

export type CaseResult = {
  id: string;
  passed: boolean;
  reason: string | null;
  ms: number;
  reply: string;
  calls: ObservedCall[];
};

const asArgs = (name: string, args: unknown, text: string): Record<string, unknown> => {
  // The same day-word and time resolution as the loop, so the recorded arguments are what the tool actually received.
  const parsed = parseToolCall(name, addSaidTime(name, resolveToolDates(args, EVAL_TODAY), text));
  return parsed.ok ? (parsed.call.args as Record<string, unknown>) : {};
};

// Runs one case on a fresh database and says whether the model did what was expected.
export const evaluateCase = async (golden: GoldenCase, chat: ChatClient): Promise<CaseResult> => {
  const db = createDb(":memory:");
  const api = createCaller({ db });
  await golden.seed?.(api);
  const calls: ObservedCall[] = [];
  const recording: ChatClient = {
    ...chat,
    chat: async (messages, tools) => {
      const reply = await chat.chat(messages, tools);
      calls.push(...reply.toolCalls.map((call) => ({ name: call.name, args: asArgs(call.name, call.args, golden.prompt) })));
      return reply;
    },
  };
  const started = performance.now();
  try {
    const { reply, actionIds } = await runAssistant({ db, chat: recording, today: EVAL_TODAY, history: [], text: golden.prompt });
    const reason = await golden.check({ reply, calls, writes: actionIds.length, api });
    return { id: golden.id, passed: reason === null, reason, ms: performance.now() - started, reply, calls };
  } catch (error) {
    return { id: golden.id, passed: false, reason: String(error), ms: performance.now() - started, reply: "", calls };
  }
};

const percentile = (sorted: number[], share: number) => sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * share))] ?? 0;

const median = (sorted: number[]) => {
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? ((sorted[middle - 1] ?? 0) + (sorted[middle] ?? 0)) / 2 : (sorted[middle] ?? 0);
};

export const summarize = (results: CaseResult[]) => {
  const times = results.map((result) => result.ms).sort((a, b) => a - b);
  const passed = results.filter((result) => result.passed).length;
  return {
    passed,
    total: results.length,
    rate: results.length === 0 ? 0 : passed / results.length,
    medianMs: median(times),
    p90Ms: percentile(times, 0.9),
  };
};
