import { describe, expect, it, vi } from "vitest";
import { createDb } from "../db/client";
import type { Notification } from "../notify/ntfy";
import { createCaller } from "../routers";
import { endOfDayDue, sendEndOfDay, startEndOfDay } from "./endOfDay";
import { readState } from "./state";

const at = (hour: number, minute = 0, day = 5) => new Date(2026, 10, day, hour, minute);

const withTask = async () => {
  const db = createDb(":memory:");
  await createCaller({ db }).tasks.add({ title: "Task A", dueDate: "2026-11-05" });
  return db;
};

const recorder = (result = true) => {
  const sent: Notification[] = [];
  return { sent, notify: async (note: Notification) => (sent.push(note), result) };
};

describe("endOfDayDue", () => {
  it("is false before the time and true from it, until sent that day", () => {
    expect(endOfDayDue(at(19, 59), "20:00", null)).toBe(false);
    expect(endOfDayDue(at(20), "20:00", null)).toBe(true);
    expect(endOfDayDue(at(23), "20:00", "2026-11-04")).toBe(true);
    expect(endOfDayDue(at(23), "20:00", "2026-11-05")).toBe(false);
  });

  it("rejects a time that is not a clock time and names the setting", () => {
    expect(() => endOfDayDue(at(20), "late", null)).toThrow(/END_OF_DAY_TIME/);
  });
});

describe("sendEndOfDay", () => {
  it("sends a count to the topic with no names in it, and remembers the day", async () => {
    const db = await withTask();
    const { sent, notify } = recorder();
    expect(await sendEndOfDay(db, notify, "topic-a", at(20))).toBe("sent");
    expect(sent).toEqual([{ topic: "topic-a", title: "HOMER", message: "Today: 1 task left.", path: "/" }]);
    expect(readState(db, "endOfDay.sentOn")).toBe("2026-11-05");
  });

  it("sends nothing on a quiet day, and counts the day as done", async () => {
    const db = createDb(":memory:");
    const { sent, notify } = recorder();
    expect(await sendEndOfDay(db, notify, "topic-a", at(20))).toBe("quiet");
    expect(sent).toEqual([]);
    expect(readState(db, "endOfDay.sentOn")).toBe("2026-11-05");
  });

  it("does not remember the day when the send failed, so it can be tried again", async () => {
    const db = await withTask();
    expect(await sendEndOfDay(db, recorder(false).notify, "topic-a", at(20))).toBe("failed");
    expect(readState(db, "endOfDay.sentOn")).toBeNull();
  });
});

describe("startEndOfDay", () => {
  it("sends at start when the time has passed and it was not sent today, and only once", async () => {
    const db = await withTask();
    const { sent, notify } = recorder();
    const options = { time: "20:00", topic: "topic-a", notify, now: () => at(21), log: vi.fn() };
    startEndOfDay(db, options)?.stop();
    await vi.waitFor(() => expect(sent).toHaveLength(1));
    startEndOfDay(db, options)?.stop();
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(sent).toHaveLength(1);
  });

  it("logs a failed send as a failure, not as a quiet day", async () => {
    const db = await withTask();
    const log = vi.fn();
    startEndOfDay(db, { time: "20:00", topic: "topic-a", notify: recorder(false).notify, now: () => at(21), log })?.stop();
    await vi.waitFor(() => expect(log).toHaveBeenCalled());
    expect(log.mock.calls[0]?.[0]).toMatch(/could not be sent/);
  });

  it("sends again on a later day after the earlier day was recorded", async () => {
    const db = await withTask();
    await createCaller({ db }).tasks.add({ title: "Task B", dueDate: "2026-11-06" });
    const { sent, notify } = recorder();
    await sendEndOfDay(db, notify, "topic-a", at(20));
    expect(endOfDayDue(at(20, 0, 6), "20:00", readState(db, "endOfDay.sentOn"))).toBe(true);
    await sendEndOfDay(db, notify, "topic-a", at(20, 0, 6));
    expect(sent.map((note) => note.message)).toEqual(["Today: 1 task left.", "Today: 2 tasks left."]);
  });

  it("waits when the time has not come", async () => {
    const db = await withTask();
    const { sent, notify } = recorder();
    startEndOfDay(db, { time: "20:00", topic: "topic-a", notify, now: () => at(9), log: vi.fn() })?.stop();
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(sent).toEqual([]);
  });

  it("logs and carries on when the time is invalid", () => {
    const log = vi.fn();
    expect(startEndOfDay(createDb(":memory:"), { time: "late", topic: "t", notify: recorder().notify, log })).toBeNull();
    expect(log.mock.calls[0]?.[0]).toMatch(/END_OF_DAY_TIME/);
  });
});
