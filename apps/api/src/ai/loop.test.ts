import { describe, expect, it } from "vitest";
import { createDb } from "../db/client";
import { createCaller } from "../routers/index";
import { scriptedChat, say, useTool } from "./fakeChat";
import { snapshot, undoAction } from "./journal";
import { OllamaUnreachable } from "./ollama";
import { MAX_ROUNDS, runAssistant } from "./loop";

const today = "2026-11-04";
const setup = () => {
  const db = createDb(":memory:");
  return { db, api: createCaller({ db }) };
};
const salt = { name: "Salt", unit: "bag", quantity: 2, daysPerUnit: null, lowThresholdDays: 7 };

describe("runAssistant", () => {
  it("returns a text-only reply and records no action", async () => {
    const { db } = setup();
    const chat = scriptedChat([say("Hello!")]);
    const done = await runAssistant({ db, chat, today, history: [], text: "Hi" });
    expect(done).toEqual({ reply: "Hello!", actionIds: [] });
    expect(chat.calls[0]![0]).toMatchObject({ role: "system" });
    expect(chat.calls[0]!.at(-1)).toEqual({ role: "user", content: "Hi" });
  });

  it("runs a tool, sends the result back and returns the final reply with the action", async () => {
    const { db, api } = setup();
    await api.inventory.create(salt);
    const before = snapshot(db);
    const chat = scriptedChat([useTool("mark_out", { name: "salt" }), say("Marked salt as out.")]);
    const done = await runAssistant({ db, chat, today, history: [], text: "We're out of salt" });
    expect(done.reply).toBe("Marked salt as out.");
    expect(done.actionIds).toHaveLength(1);
    const second = chat.calls[1]!;
    expect(second.at(-2)).toMatchObject({ role: "assistant", toolCalls: [{ name: "mark_out" }] });
    expect(second.at(-1)).toMatchObject({ role: "tool", toolName: "mark_out" });
    expect(JSON.parse((second.at(-1) as { content: string }).content)).toMatchObject({ status: "done" });
    expect(undoAction(db, done.actionIds[0]!)).toEqual({ ok: true });
    expect(snapshot(db)).toEqual(before);
  });

  it("passes the screen's earlier messages to the model", async () => {
    const { db } = setup();
    const chat = scriptedChat([say("ok")]);
    await runAssistant({
      db,
      chat,
      today,
      history: [
        { role: "user", content: "Earlier question" },
        { role: "assistant", content: "Earlier answer" },
      ],
      text: "Next",
    });
    expect(chat.calls[0]!.slice(1).map((message) => message.content)).toEqual(["Earlier question", "Earlier answer", "Next"]);
  });

  it("tells the model what was wrong with invalid arguments, and lets it try again", async () => {
    const { db, api } = setup();
    await api.inventory.create(salt);
    const chat = scriptedChat([useTool("restock_item", { name: "salt", quantity: -1 }), useTool("restock_item", { name: "salt", quantity: 2 }), say("Added 2.")]);
    const done = await runAssistant({ db, chat, today, history: [], text: "Bought 2 salt" });
    expect(done.reply).toBe("Added 2.");
    const retry = chat.calls[1]!.at(-1) as { content: string };
    expect(retry.content).toContain("quantity");
    expect(done.actionIds).toHaveLength(1);
  });

  it("gives up after two invalid retries and writes nothing", async () => {
    const { db, api } = setup();
    await api.inventory.create(salt);
    const bad = useTool("restock_item", { name: "salt", quantity: -1 });
    const chat = scriptedChat([bad, bad, bad, say("never reached")]);
    const done = await runAssistant({ db, chat, today, history: [], text: "x" });
    expect(done.actionIds).toEqual([]);
    expect(done.reply).not.toBe("never reached");
    expect(done.reply.length).toBeGreaterThan(0);
    expect((await api.inventory.list())[0]).toMatchObject({ quantity: 2 });
  });

  it("stops after the round limit", async () => {
    const { db } = setup();
    const chat = scriptedChat(Array.from({ length: MAX_ROUNDS + 3 }, () => useTool("list_items", {})));
    const done = await runAssistant({ db, chat, today, history: [], text: "loop" });
    expect(chat.calls).toHaveLength(MAX_ROUNDS);
    expect(done.reply.length).toBeGreaterThan(0);
  });

  it("asks once more after an empty reply", async () => {
    const { db } = setup();
    const chat = scriptedChat([say(""), say("Here you go.")]);
    const done = await runAssistant({ db, chat, today, history: [], text: "x" });
    expect(done.reply).toBe("Here you go.");
    expect(chat.calls).toHaveLength(2);
  });

  it("answers a second empty reply with a line, not silence", async () => {
    const { db } = setup();
    const done = await runAssistant({ db, chat: scriptedChat([say(""), say("")]), today, history: [], text: "x" });
    expect(done.reply.length).toBeGreaterThan(0);
  });

  it("runs an unknown tool as an error the model sees", async () => {
    const { db } = setup();
    const chat = scriptedChat([useTool("delete_everything", {}), say("Sorry.")]);
    const done = await runAssistant({ db, chat, today, history: [], text: "x" });
    expect(done.reply).toBe("Sorry.");
    expect((chat.calls[1]!.at(-1) as { content: string }).content).toContain("delete_everything");
  });

  it("lets Ollama being unreachable through", async () => {
    const { db } = setup();
    const chat = scriptedChat([new OllamaUnreachable("down")]);
    await expect(runAssistant({ db, chat, today, history: [], text: "x" })).rejects.toBeInstanceOf(OllamaUnreachable);
  });

  it("keeps and reports the actions made before the model went away", async () => {
    const { db, api } = setup();
    await api.inventory.create(salt);
    const chat = scriptedChat([useTool("mark_out", { name: "salt" }), new OllamaUnreachable("down")]);
    const done = await runAssistant({ db, chat, today, history: [], text: "x" });
    expect(done.actionIds).toHaveLength(1);
    expect(done.reply.length).toBeGreaterThan(0);
    expect((await api.inventory.list())[0]).toMatchObject({ quantity: 0 });
  });

  it("keeps and reports the actions made before any other failure", async () => {
    const { db, api } = setup();
    await api.inventory.create(salt);
    const chat = scriptedChat([useTool("mark_out", { name: "salt" }), new Error("disk full")]);
    const done = await runAssistant({ db, chat, today, history: [], text: "x" });
    expect(done.actionIds).toHaveLength(1);
  });
});
