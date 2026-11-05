import type { createCaller } from "../../routers/index";

export type ObservedCall = { name: string; args: Record<string, unknown> };

export type Observed = {
  reply: string;
  calls: ObservedCall[];
  // Changes the assistant made, counted from the journal.
  writes: number;
  api: ReturnType<typeof createCaller>;
};

// A check returns why it failed, or null when it passed.
export type Check = (observed: Observed) => Promise<string | null> | string | null;

type Matcher = string | number | RegExp | null;

const matches = (actual: unknown, wanted: Matcher): boolean => {
  if (wanted === null) return actual === null || actual === undefined;
  if (wanted instanceof RegExp) return typeof actual === "string" && wanted.test(actual);
  if (typeof wanted === "number") return actual === wanted;
  return typeof actual === "string" && actual.toLowerCase().includes(wanted.toLowerCase());
};

const describeCall = ({ name, args }: ObservedCall) => `${name}(${JSON.stringify(args)})`;

// The model called this tool with arguments that fit. Strings match when they contain the wanted text, ignoring case.
export const calls =
  (name: string, wanted: Record<string, Matcher> = {}): Check =>
  ({ calls: made }) => {
    const sameTool = made.filter((call) => call.name === name);
    if (sameTool.length === 0) return `expected ${name}, got ${made.map(describeCall).join(", ") || "no tool calls"}`;
    const fits = sameTool.some((call) => Object.entries(wanted).every(([key, matcher]) => matches(call.args[key], matcher)));
    return fits ? null : `${name} had the wrong arguments: ${sameTool.map(describeCall).join(", ")}`;
  };

export const changesNothing: Check = ({ writes, calls: made }) =>
  writes === 0 ? null : `expected no changes, but made ${writes}: ${made.map(describeCall).join(", ")}`;

// Exactly one change, so a right answer with an extra wrong write alongside it still fails.
export const oneChange: Check = ({ writes, calls: made }) =>
  writes === 1 ? null : `expected one change, made ${writes}: ${made.map(describeCall).join(", ")}`;

// Any question counts, so a case that needs a particular question also checks the reply with `mentions`.
export const asks: Check = ({ reply }) => (reply.includes("?") ? null : `expected a question, got: ${reply}`);

export const mentions =
  (...words: string[]): Check =>
  ({ reply }) => {
    const missing = words.filter((word) => !reply.toLowerCase().includes(word.toLowerCase()));
    return missing.length === 0 ? null : `reply does not mention ${missing.join(", ")}: ${reply}`;
  };

export const callsNoWriteTool =
  (...names: string[]): Check =>
  ({ calls: made }) => {
    const bad = made.filter((call) => names.includes(call.name));
    return bad.length === 0 ? null : `should not have called ${bad.map(describeCall).join(", ")}`;
  };

// Every check must pass. The first failure is the reason.
export const all =
  (...checks: Check[]): Check =>
  async (observed) => {
    for (const check of checks) {
      const reason = await check(observed);
      if (reason !== null) return reason;
    }
    return null;
  };

export const state =
  (describe: string, test: (api: Observed["api"]) => Promise<boolean>): Check =>
  async ({ api }) =>
    (await test(api)) ? null : `state is wrong: ${describe}`;
