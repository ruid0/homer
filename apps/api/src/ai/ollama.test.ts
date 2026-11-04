import { toolDefinitions } from "@homer/shared";
import { describe, expect, it } from "vitest";
import { OllamaUnreachable, createOllamaClient } from "./ollama";

const reply = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });

const client = (fetchImpl: typeof fetch, timeoutMs = 1000) =>
  createOllamaClient({ host: "http://ollama.test", model: "m1", think: false, timeoutMs, fetch: fetchImpl });

describe("chat", () => {
  it("sends the messages, the tools and the model, without streaming", async () => {
    let seen: { url: string; body: any } | null = null;
    const chat = client(async (url, init) => {
      seen = { url: String(url), body: JSON.parse(String(init?.body)) };
      return reply({ message: { role: "assistant", content: "Hi" } });
    });
    const result = await chat.chat([{ role: "user", content: "Hello" }], toolDefinitions);
    expect(result).toEqual({ content: "Hi", toolCalls: [] });
    expect(seen!.url).toBe("http://ollama.test/api/chat");
    expect(seen!.body).toMatchObject({ model: "m1", stream: false, think: false, messages: [{ role: "user", content: "Hello" }] });
    expect(seen!.body.tools).toHaveLength(toolDefinitions.length);
    expect(seen!.body.tools[0]).toMatchObject({ type: "function", function: { name: toolDefinitions[0]!.name } });
  });

  it("reads tool calls, whether the arguments are an object or a string", async () => {
    const chat = client(async () =>
      reply({
        message: {
          role: "assistant",
          content: "",
          tool_calls: [
            { function: { name: "mark_out", arguments: { name: "salt" } } },
            { function: { name: "list_items", arguments: "{}" } },
          ],
        },
      }),
    );
    const result = await chat.chat([{ role: "user", content: "x" }], []);
    expect(result.toolCalls).toEqual([
      { name: "mark_out", args: { name: "salt" } },
      { name: "list_items", args: "{}" },
    ]);
  });

  it("sends earlier tool calls and results back in Ollama's shape", async () => {
    let body: any;
    const chat = client(async (_url, init) => {
      body = JSON.parse(String(init?.body));
      return reply({ message: { role: "assistant", content: "ok" } });
    });
    await chat.chat(
      [
        { role: "assistant", content: "", toolCalls: [{ name: "list_items", args: "{}" }] },
        { role: "tool", toolName: "list_items", content: "{}" },
      ],
      [],
    );
    expect(body.messages).toEqual([
      { role: "assistant", content: "", tool_calls: [{ function: { name: "list_items", arguments: {} } }] },
      { role: "tool", tool_name: "list_items", content: "{}" },
    ]);
  });

  it("is unreachable when the connection fails, the status is bad or it times out", async () => {
    const down = client(async () => {
      throw new TypeError("fetch failed");
    });
    await expect(down.chat([], [])).rejects.toBeInstanceOf(OllamaUnreachable);
    const bad = client(async () => reply({ error: "boom" }, 500));
    await expect(bad.chat([], [])).rejects.toBeInstanceOf(OllamaUnreachable);
    const garbled = client(async () => new Response("not json", { status: 200 }));
    await expect(garbled.chat([], [])).rejects.toBeInstanceOf(OllamaUnreachable);
    const slow = client((_url, init) => new Promise((_resolve, reject) => init?.signal?.addEventListener("abort", () => reject(new Error("aborted")))), 20);
    await expect(slow.chat([], [])).rejects.toBeInstanceOf(OllamaUnreachable);
  });
});

describe("status", () => {
  it("is ready when the model is installed", async () => {
    const chat = client(async () => reply({ models: [{ name: "m1" }] }));
    expect(await chat.status()).toBe("ready");
  });

  it("says when the model is missing", async () => {
    const chat = client(async () => reply({ models: [{ name: "other" }] }));
    expect(await chat.status()).toBe("no_model");
  });

  it("says when Ollama is not running", async () => {
    const chat = client(async () => {
      throw new TypeError("fetch failed");
    });
    expect(await chat.status()).toBe("unreachable");
  });
});
