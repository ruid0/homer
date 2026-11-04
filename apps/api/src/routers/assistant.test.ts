import { describe, expect, it } from "vitest";
import { createDb } from "../db/client";
import { scriptedChat, say, useTool } from "../ai/fakeChat";
import { OllamaUnreachable } from "../ai/ollama";
import { createCaller } from "./index";

const salt = { name: "Salt", unit: "bag", quantity: 2, daysPerUnit: null, lowThresholdDays: 7 };
const now = () => new Date(2026, 10, 4, 9, 0);

const setup = (script: Parameters<typeof scriptedChat>[0] = []) => {
  const db = createDb(":memory:");
  const chat = scriptedChat(script);
  const api = createCaller({ db, assistant: { chat, now } });
  return { db, chat, api };
};

describe("assistant.send", () => {
  it("stores the question and the reply, and links the reply to its actions", async () => {
    const { api } = setup([useTool("mark_out", { name: "salt" }), say("Marked salt as out.")]);
    await api.inventory.create(salt);
    const done = await api.assistant.send({ text: "We're out of salt", after: 0 });
    expect(done).toMatchObject({ status: "reply", message: { role: "assistant", text: "Marked salt as out.", actions: [{ tool: "mark_out", undone: false }] } });
    const { messages } = await api.assistant.history();
    expect(messages.map((message) => [message.role, message.text])).toEqual([
      ["user", "We're out of salt"],
      ["assistant", "Marked salt as out."],
    ]);
  });

  it("tells the model about the date", async () => {
    const { api, chat } = setup([say("ok")]);
    await api.assistant.send({ text: "hi", after: 0 });
    expect(JSON.stringify(chat.calls[0]![0])).toContain("2026-11-04");
  });

  it("shows the model only the messages after the screen started", async () => {
    const { api, chat } = setup([say("one"), say("two"), say("three")]);
    await api.assistant.send({ text: "first", after: 0 });
    const { lastId } = await api.assistant.history();
    await api.assistant.send({ text: "second", after: lastId });
    const sent = chat.calls[1]!.slice(1).map((message) => message.content);
    expect(sent).toEqual(["second"]);
    await api.assistant.send({ text: "third", after: lastId });
    expect(chat.calls[2]!.slice(1).map((message) => message.content)).toEqual(["second", "two", "third"]);
  });

  it("says Ollama is unreachable and stores nothing", async () => {
    const { api } = setup([new OllamaUnreachable("down")]);
    expect(await api.assistant.send({ text: "hi", after: 0 })).toEqual({ status: "unreachable" });
    expect((await api.assistant.history()).messages).toEqual([]);
  });

  it("rejects an empty message", async () => {
    const { api } = setup();
    await expect(api.assistant.send({ text: "   ", after: 0 })).rejects.toThrow();
  });
});

describe("assistant.undo", () => {
  it("undoes an action and shows it as undone", async () => {
    const { api } = setup([useTool("mark_out", { name: "salt" }), say("Done.")]);
    await api.inventory.create(salt);
    const sent = await api.assistant.send({ text: "out of salt", after: 0 });
    const actionId = sent.status === "reply" ? sent.message.actions[0]!.id : 0;
    expect(await api.assistant.undo({ actionId })).toEqual({ ok: true });
    expect((await api.inventory.list())[0]).toMatchObject({ quantity: 2 });
    expect((await api.assistant.history()).messages.at(-1)!.actions[0]!.undone).toBe(true);
  });

  it("explains a refusal in a line", async () => {
    const { api } = setup([useTool("mark_out", { name: "salt" }), say("Done.")]);
    const { id } = await api.inventory.create(salt);
    const sent = await api.assistant.send({ text: "out of salt", after: 0 });
    await api.inventory.restock({ itemId: id, quantity: 1 });
    const actionId = sent.status === "reply" ? sent.message.actions[0]!.id : 0;
    expect(await api.assistant.undo({ actionId })).toMatchObject({ ok: false, message: expect.stringContaining("Salt") });
  });
});

describe("assistant.clear and status", () => {
  it("clears the history without deleting rows", async () => {
    const { api } = setup([say("a")]);
    await api.assistant.send({ text: "hi", after: 0 });
    await api.assistant.clear();
    expect((await api.assistant.history()).messages).toEqual([]);
  });

  it("reports what the model client says", async () => {
    const { api } = setup();
    expect(await api.assistant.status()).toEqual({ status: "ready" });
  });
});
