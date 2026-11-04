import type { ToolDefinition } from "@homer/shared";
import { assistantCopy } from "../messages";

export type RawToolCall = { name: string; args: unknown };

export type ChatMessage =
  | { role: "system" | "user"; content: string }
  | { role: "assistant"; content: string; toolCalls?: RawToolCall[] }
  | { role: "tool"; toolName: string; content: string };

export type ChatReply = { content: string; toolCalls: RawToolCall[] };

export type ModelStatus = "ready" | "no_model" | "unreachable";

// The loop only knows this interface, so tests use a scripted fake and nothing else touches the network.
export type ChatClient = {
  chat: (messages: ChatMessage[], tools: readonly ToolDefinition[]) => Promise<ChatReply>;
  status: () => Promise<ModelStatus>;
};

export class OllamaUnreachable extends Error {}

type Options = { host: string; model: string; think: boolean; timeoutMs: number; fetch?: typeof fetch };

// Ollama wants arguments as an object, and some models send them as a JSON string.
const argumentsObject = (args: unknown): unknown => {
  if (typeof args !== "string") return args;
  try {
    return JSON.parse(args);
  } catch {
    return {};
  }
};

const toWire = (message: ChatMessage) => {
  if (message.role === "tool") return { role: "tool", tool_name: message.toolName, content: message.content };
  if (message.role === "assistant" && message.toolCalls?.length) {
    return {
      role: "assistant",
      content: message.content,
      tool_calls: message.toolCalls.map(({ name, args }) => ({ function: { name, arguments: argumentsObject(args) } })),
    };
  }
  return message;
};

const toolSpec = ({ name, description, parameters }: ToolDefinition) => ({
  type: "function",
  function: { name, description, parameters },
});

type WireReply = { message?: { content?: string; tool_calls?: { function: { name: string; arguments: unknown } }[] } };

export const createOllamaClient = ({ host, model, think, timeoutMs, fetch: fetchImpl = fetch }: Options): ChatClient => {
  // The body is read inside the same limit, so a reply that stalls or is not JSON is also "unreachable".
  const request = async <T>(path: string, init: RequestInit, limitMs: number): Promise<T> => {
    try {
      const response = await fetchImpl(`${host}${path}`, { ...init, signal: AbortSignal.timeout(limitMs) });
      if (!response.ok) throw new OllamaUnreachable(assistantCopy.badStatus(response.status));
      return (await response.json()) as T;
    } catch (error) {
      throw error instanceof OllamaUnreachable ? error : new OllamaUnreachable(String(error));
    }
  };

  return {
    chat: async (messages, tools) => {
      const body = { model, stream: false, think, messages: messages.map(toWire), tools: tools.map(toolSpec) };
      const { message } = await request<WireReply>(
        "/api/chat",
        { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) },
        timeoutMs,
      );
      return {
        content: message?.content ?? "",
        toolCalls: (message?.tool_calls ?? []).map((call) => ({ name: call.function.name, args: call.function.arguments })),
      };
    },

    status: async () => {
      try {
        const { models = [] } = await request<{ models?: { name?: string }[] }>("/api/tags", {}, Math.min(timeoutMs, 3000));
        const known = models.map((entry) => entry.name ?? "");
        return known.some((name) => name === model || name === `${model}:latest`) ? "ready" : "no_model";
      } catch {
        return "unreachable";
      }
    },
  };
};
