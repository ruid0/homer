import { assistantCopy } from "../messages";
import type { ChatClient, ChatMessage, ChatReply } from "./ollama";

export const say = (content: string): ChatReply => ({ content, toolCalls: [] });
export const useTool = (name: string, args: unknown): ChatReply => ({ content: "", toolCalls: [{ name, args }] });

// A model that plays back a script, one entry per call. An Error in the script is thrown. Used by tests only.
export const scriptedChat = (script: readonly (ChatReply | Error)[]): ChatClient & { calls: ChatMessage[][] } => {
  const calls: ChatMessage[][] = [];
  return {
    calls,
    chat: async (messages) => {
      calls.push([...messages]);
      const next = script[calls.length - 1];
      if (next === undefined) throw new Error(assistantCopy.scriptEnded);
      if (next instanceof Error) throw next;
      return next;
    },
    status: async () => "ready",
  };
};
