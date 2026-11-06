import { describe, expect, it } from "vitest";
import { createDb } from "../db/client";
import { messages } from "../messages";
import { createCaller } from "./index";

const server = "https://ntfy.example";

const setup = async (ntfyServer: string | null = server) => {
  const api = createCaller({ db: createDb(":memory:"), ntfyServer });
  const person = await api.people.add({ name: "Person A" });
  const row = await api.routines.addItem({ personId: person.id, name: "Row A", targetPerDay: 2 });
  return { api, person, row };
};

describe("people.reminderSetup", () => {
  it("gives a long secret topic once and the same one again", async () => {
    const { api, person } = await setup();
    const first = await api.people.reminderSetup({ id: person.id });
    expect(first.server).toBe(server);
    expect(first.topic).toMatch(/^homer-[0-9a-f]{32}$/);
    expect(await api.people.reminderSetup({ id: person.id })).toEqual(first);
  });

  it("gives each person their own topic", async () => {
    const { api, person } = await setup();
    const other = await api.people.add({ name: "Person B" });
    const [a, b] = [await api.people.reminderSetup({ id: person.id }), await api.people.reminderSetup({ id: other.id })];
    expect(a.topic).not.toBe(b.topic);
  });

  it("refuses when notifications are off, and for a person who does not exist", async () => {
    const off = await setup(null);
    await expect(off.api.people.reminderSetup({ id: off.person.id })).rejects.toMatchObject({
      code: "PRECONDITION_FAILED",
      message: messages.notificationsOff,
    });
    const { api } = await setup();
    await expect(api.people.reminderSetup({ id: 99 })).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("never shows the topic in the people list, a rename or an add, only whether reminders are on", async () => {
    const { api, person } = await setup();
    expect((await api.people.list())[0]).toMatchObject({ remindersOn: false });
    const { topic } = await api.people.reminderSetup({ id: person.id });
    const renamed = await api.people.rename({ id: person.id, name: "Person C" });
    const added = await api.people.add({ name: "Person D" });
    const everything = JSON.stringify([await api.people.list(), renamed, added]);
    expect(everything).not.toContain(topic);
    expect(everything).not.toContain("notifyTopic");
    expect((await api.people.list()).find((p) => p.id === person.id)).toMatchObject({ remindersOn: true });
  });
});

describe("people.notificationsOn", () => {
  it("says whether the household has notifications set up", async () => {
    expect(await (await setup()).api.people.notificationsOn()).toBe(true);
    expect(await (await setup(null)).api.people.notificationsOn()).toBe(false);
  });
});

describe("routines.addReminder", () => {
  it("needs reminders turned on for the person", async () => {
    const { api, row } = await setup();
    await expect(api.routines.addReminder({ itemId: row.id, text: "in an hour", repeatDaily: false })).rejects.toMatchObject({
      code: "PRECONDITION_FAILED",
      message: messages.remindersOff,
    });
  });

  it("adds a one-off reminder from a relative time", async () => {
    const { api, person, row } = await setup();
    await api.people.reminderSetup({ id: person.id });
    const before = Date.now();
    const reminder = await api.routines.addReminder({ itemId: row.id, text: "in an hour", repeatDaily: false });
    expect(reminder.dailyTime).toBeNull();
    const delay = Date.parse(reminder.fireAt) - before;
    expect(delay).toBeGreaterThan(59 * 60_000 - 60_000);
    expect(delay).toBeLessThanOrEqual(60 * 60_000 + 1000);
  });

  it("adds a one-off and a daily reminder from a clock time", async () => {
    const { api, person, row } = await setup();
    await api.people.reminderSetup({ id: person.id });
    const once = await api.routines.addReminder({ itemId: row.id, text: "at 13:30", repeatDaily: false });
    const daily = await api.routines.addReminder({ itemId: row.id, text: "1:30pm", repeatDaily: true });
    expect(once.dailyTime).toBeNull();
    expect(daily.dailyTime).toBe("13:30");
    expect(new Date(daily.fireAt).getHours()).toBe(13);
  });

  it("refuses text it does not understand and a daily reminder without a clock time", async () => {
    const { api, person, row } = await setup();
    await api.people.reminderSetup({ id: person.id });
    await expect(api.routines.addReminder({ itemId: row.id, text: "soon", repeatDaily: false })).rejects.toMatchObject({
      code: "BAD_REQUEST",
      message: messages.reminderWhenUnknown,
    });
    await expect(api.routines.addReminder({ itemId: row.id, text: "in an hour", repeatDaily: true })).rejects.toMatchObject({
      code: "BAD_REQUEST",
      message: messages.reminderDailyNeedsClock,
    });
  });

  it("refuses a removed row", async () => {
    const { api, person, row } = await setup();
    await api.people.reminderSetup({ id: person.id });
    await api.routines.removeItem({ id: row.id });
    await expect(api.routines.addReminder({ itemId: row.id, text: "13:30", repeatDaily: false })).rejects.toMatchObject({ code: "NOT_FOUND" });
  });
});

describe("routines.reminders and removeReminder", () => {
  it("lists a person's open reminders in time order and drops removed ones and removed rows", async () => {
    const { api, person, row } = await setup();
    await api.people.reminderSetup({ id: person.id });
    const later = await api.routines.addReminder({ itemId: row.id, text: "in 3 hours", repeatDaily: false });
    const sooner = await api.routines.addReminder({ itemId: row.id, text: "in 30 minutes", repeatDaily: false });
    const gone = await api.routines.addReminder({ itemId: row.id, text: "in 2 hours", repeatDaily: false });
    await api.routines.removeReminder({ id: gone.id });
    const list = await api.routines.reminders({ personId: person.id });
    expect(list.map((reminder) => reminder.id)).toEqual([sooner.id, later.id]);
    expect(Object.keys(list[0]!).sort()).toEqual(["dailyTime", "fireAt", "id", "itemId"]);
    await api.routines.removeItem({ id: row.id });
    expect(await api.routines.reminders({ personId: person.id })).toEqual([]);
  });

  it("refuses to remove a reminder twice", async () => {
    const { api, person, row } = await setup();
    await api.people.reminderSetup({ id: person.id });
    const reminder = await api.routines.addReminder({ itemId: row.id, text: "in an hour", repeatDaily: false });
    await api.routines.removeReminder({ id: reminder.id });
    await expect(api.routines.removeReminder({ id: reminder.id })).rejects.toMatchObject({ code: "NOT_FOUND", message: messages.reminderGone });
  });
});
