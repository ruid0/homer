import { describe, expect, it } from "vitest";
import { createDb } from "../db/client";
import { routineReminders } from "../db/schema";
import type { Notification } from "../notify/ntfy";
import { createCaller } from "../routers";
import { MAX_LATE_MINUTES, sendDueReminders } from "./routineReminders";

const at = (hour: number, minute = 0, day = 5) => new Date(2026, 10, day, hour, minute);

const setup = async (target = 1) => {
  const db = createDb(":memory:");
  const api = createCaller({ db, ntfyServer: "https://ntfy.example" });
  const person = await api.people.add({ name: "Person A" });
  const { topic } = await api.people.reminderSetup({ id: person.id });
  const row = await api.routines.addItem({ personId: person.id, name: "Row A", targetPerDay: target });
  return { db, api, person, row, topic };
};

const recorder = (result = true) => {
  const sent: Notification[] = [];
  return { sent, notify: async (note: Notification) => (sent.push(note), result) };
};

const rows = (db: ReturnType<typeof createDb>) => db.select().from(routineReminders).all();

const addAt = (db: ReturnType<typeof createDb>, itemId: number, fireAt: Date, dailyTime: string | null = null) =>
  db.insert(routineReminders).values({ routineItemId: itemId, fireAt: fireAt.toISOString(), dailyTime }).run();

describe("sendDueReminders", () => {
  it("sends one generic note to the person's own topic when a row is not done, and finishes a one-off reminder", async () => {
    const { db, row, topic, person } = await setup();
    addAt(db, row.id, at(13, 30));
    const { sent, notify } = recorder();
    expect(await sendDueReminders(db, notify, at(13, 30))).toBe(1);
    expect(sent).toEqual([{ topic, title: "HOMER", message: "Routine: 1 row not done.", path: `/people/${person.id}/routine` }]);
    expect(rows(db)[0]?.removedAt).not.toBeNull();
    expect(await sendDueReminders(db, notify, at(13, 31))).toBe(0);
  });

  it("never puts a row name in the text", async () => {
    const { db, row } = await setup();
    addAt(db, row.id, at(13, 30));
    const { sent, notify } = recorder();
    await sendDueReminders(db, notify, at(13, 30));
    expect(JSON.stringify(sent)).not.toMatch(/Row A|Person A/);
  });

  it("waits until the time and sends nothing when the row is already at its target", async () => {
    const { db, api, row } = await setup(2);
    addAt(db, row.id, at(13, 30));
    const { sent, notify } = recorder();
    expect(await sendDueReminders(db, notify, at(13, 29))).toBe(0);
    await api.routines.setCount({ itemId: row.id, date: "2026-11-05", today: "2026-11-05", count: 2 });
    expect(await sendDueReminders(db, notify, at(13, 30))).toBe(0);
    expect(sent).toEqual([]);
    expect(rows(db)[0]?.removedAt).not.toBeNull();
  });

  it("sends one note for several due reminders of the same person and counts the rows", async () => {
    const { db, api, person, row } = await setup();
    const other = await api.routines.addItem({ personId: person.id, name: "Row B" });
    addAt(db, row.id, at(13, 30));
    addAt(db, other.id, at(13, 30));
    addAt(db, other.id, at(13, 25));
    const { sent, notify } = recorder();
    await sendDueReminders(db, notify, at(13, 30));
    expect(sent.map((note) => note.message)).toEqual(["Routine: 2 rows not done."]);
  });

  it("keeps a reminder when the send fails, and drops it once it is too late", async () => {
    const { db, row } = await setup();
    addAt(db, row.id, at(13, 30));
    expect(await sendDueReminders(db, recorder(false).notify, at(13, 31))).toBe(0);
    expect(rows(db)[0]?.removedAt).toBeNull();
    const late = recorder();
    await sendDueReminders(db, late.notify, at(13, 30 + MAX_LATE_MINUTES + 1));
    expect(late.sent).toEqual([]);
    expect(rows(db)[0]?.removedAt).not.toBeNull();
  });

  it("moves a daily reminder to the next day's time and does not send again the same day", async () => {
    const { db, row } = await setup();
    addAt(db, row.id, at(13, 30), "13:30");
    const { sent, notify } = recorder();
    await sendDueReminders(db, notify, at(13, 30));
    expect(new Date(rows(db)[0]!.fireAt)).toEqual(at(13, 30, 6));
    expect(rows(db)[0]?.removedAt).toBeNull();
    await sendDueReminders(db, notify, at(15));
    expect(sent).toHaveLength(1);
  });

  it("skips a daily reminder that was missed by a long time and sets the next one", async () => {
    const { db, row } = await setup();
    addAt(db, row.id, at(13, 30, 3), "13:30");
    const { sent, notify } = recorder();
    await sendDueReminders(db, notify, at(9, 0, 5));
    expect(sent).toEqual([]);
    expect(new Date(rows(db)[0]!.fireAt)).toEqual(at(13, 30, 5));
  });

  it("a failed send for one person does not stop another person's note", async () => {
    const { db, api, row } = await setup();
    const other = await api.people.add({ name: "Person B" });
    const otherTopic = (await api.people.reminderSetup({ id: other.id })).topic;
    const otherRow = await api.routines.addItem({ personId: other.id, name: "Row B" });
    addAt(db, row.id, at(13, 30));
    addAt(db, otherRow.id, at(13, 30));
    const sent: Notification[] = [];
    const notify = async (note: Notification) => (note.topic === otherTopic ? (sent.push(note), true) : false);
    expect(await sendDueReminders(db, notify, at(13, 30))).toBe(1);
    expect(sent).toHaveLength(1);
    expect(rows(db).find((r) => r.routineItemId === row.id)?.removedAt).toBeNull();
    expect(rows(db).find((r) => r.routineItemId === otherRow.id)?.removedAt).not.toBeNull();
  });

  it("closes a due reminder quietly for a person with no topic", async () => {
    const { db, api } = await setup();
    const bare = await api.people.add({ name: "Person B" });
    const bareRow = await api.routines.addItem({ personId: bare.id, name: "Row B" });
    addAt(db, bareRow.id, at(13, 30));
    const { sent, notify } = recorder();
    expect(await sendDueReminders(db, notify, at(13, 30))).toBe(0);
    expect(sent).toEqual([]);
    expect(rows(db)[0]?.removedAt).not.toBeNull();
  });

  it("ignores a reminder on a row that was removed", async () => {
    const { db, api, row } = await setup();
    addAt(db, row.id, at(13, 30));
    await api.routines.removeItem({ id: row.id });
    const { sent, notify } = recorder();
    await sendDueReminders(db, notify, at(13, 30));
    expect(sent).toEqual([]);
  });
});
