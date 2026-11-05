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
    expect(done.reply).toBe("Marked Salt as out and added it to groceries.");
    expect(done.actionIds).toHaveLength(1);
    const second = chat.calls[1]!;
    expect(second.at(-2)).toMatchObject({ role: "assistant", toolCalls: [{ name: "mark_out" }] });
    expect(second.at(-1)).toMatchObject({ role: "tool", toolName: "mark_out" });
    expect(JSON.parse((second.at(-1) as { content: string }).content)).toMatchObject({ status: "done" });
    expect(undoAction(db, done.actionIds[0]!)).toEqual({ ok: true });
    expect(snapshot(db)).toEqual(before);
  });

  it("works out a day said in words, so the model never counts days", async () => {
    const { db, api } = setup();
    const chat = scriptedChat([useTool("add_task", { title: "Call the plumber", dueDate: "friday" }), say("Added.")]);
    const done = await runAssistant({ db, chat, today, history: [], text: "Remind me Friday" });
    expect(done.actionIds).toHaveLength(1);
    expect((await api.schedule.view({ today, days: 3 })).days[2]!.tasks[0]).toMatchObject({ dueDate: "2026-11-06" });
  });

  it("never shows a claim of change when nothing changed", async () => {
    const { db } = setup();
    const chat = scriptedChat([say("I've added the dentist appointment for Anna.")]);
    const done = await runAssistant({ db, chat, today, history: [], text: "Dentist Thursday" });
    expect(done.actionIds).toEqual([]);
    expect(done.reply).toBe("I didn't change anything. Try saying it again.");
  });

  it("writes the report itself, keeping only the model's closing question", async () => {
    const { db, api } = setup();
    await api.inventory.create(salt);
    const chat = scriptedChat([useTool("mark_out", { name: "salt" }), say("Wonderful, all sorted! Anything else?")]);
    const done = await runAssistant({ db, chat, today, history: [], text: "out of salt" });
    expect(done.reply).toBe("Marked Salt as out and added it to groceries.\nAnything else?");
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
    expect(done.reply).toBe("Restocked Salt: added 2 bag, now 4.");
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

  it("writes nothing when the model picks one of several matches, and says so", async () => {
    const { db, api } = setup();
    await api.inventory.create({ ...salt, name: "Oat milk" });
    await api.inventory.create({ ...salt, name: "Soy milk" });
    const chat = scriptedChat([useTool("mark_out", { name: "Oat milk" }), say("Which milk is out, oat or soy?")]);
    const done = await runAssistant({ db, chat, today, history: [], text: "We're out of milk" });
    expect(done.actionIds).toHaveLength(0);
    expect(done.reply).toContain("?");
    expect((await api.inventory.list()).map(({ quantity }) => quantity)).toEqual([2, 2]);
  });

  it("writes nothing for a delete request", async () => {
    const { db, api } = setup();
    await api.inventory.create({ ...salt, name: "Milk" });
    const chat = scriptedChat([useTool("mark_out", { name: "Milk" }), say("I can't delete items.")]);
    const done = await runAssistant({ db, chat, today, history: [], text: "Delete the milk" });
    expect(done.actionIds).toHaveLength(0);
    expect((await api.inventory.list())[0]).toMatchObject({ quantity: 2 });
  });

  it("keeps and reports the actions made before the model went away", async () => {
    const { db, api } = setup();
    await api.inventory.create(salt);
    const chat = scriptedChat([useTool("mark_out", { name: "salt" }), new OllamaUnreachable("down")]);
    const done = await runAssistant({ db, chat, today, history: [], text: "out of salt" });
    expect(done.actionIds).toHaveLength(1);
    expect(done.reply.length).toBeGreaterThan(0);
    expect((await api.inventory.list())[0]).toMatchObject({ quantity: 0 });
  });

  it("keeps and reports the actions made before any other failure", async () => {
    const { db, api } = setup();
    await api.inventory.create(salt);
    const chat = scriptedChat([useTool("mark_out", { name: "salt" }), new Error("disk full")]);
    const done = await runAssistant({ db, chat, today, history: [], text: "out of salt" });
    expect(done.actionIds).toHaveLength(1);
  });

  it("still reports a change when the model then goes away", async () => {
    const { db, api } = setup();
    await api.inventory.create(salt);
    const chat = scriptedChat([useTool("mark_out", { name: "salt" }), new OllamaUnreachable("down")]);
    const done = await runAssistant({ db, chat, today, history: [], text: "out of salt" });
    expect(done.reply.startsWith("Marked Salt as out and added it to groceries.")).toBe(true);
  });

  it("reports the failed call of a turn next to the one that worked", async () => {
    const { db, api } = setup();
    await api.inventory.create(salt);
    const chat = scriptedChat([
      { content: "", toolCalls: [{ name: "mark_out", args: { name: "salt" } }, { name: "mark_out", args: { name: "flour" } }] },
      say("Marked salt. Flour is not tracked."),
    ]);
    const done = await runAssistant({ db, chat, today, history: [], text: "out of salt and flour" });
    expect(done.reply).toBe("Marked Salt as out and added it to groceries.\nflour isn't tracked, so nothing changed for it.");
  });
});
