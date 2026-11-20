import { describe, expect, it, vi } from "vitest";
import { createDb } from "../db/client";
import type { Notification } from "../notify/ntfy";
import { createCaller } from "../routers";
import { maintenanceDue, sendMaintenance, startMaintenance } from "./maintenance";
import { readState } from "./state";

const at = (hour: number, minute = 0, day = 5) => new Date(2026, 10, day, hour, minute);
const TODAY = "2026-11-05";

const recorder = (result = true) => {
  const sent: Notification[] = [];
  return { sent, notify: async (note: Notification) => (sent.push(note), result) };
};

type Job = { name: string; lastDoneOn: string | null; every?: number };

// Every job is counted in weeks, so the last done date picks the due date: a week later for every = 1.
const withJobs = async (jobs: Job[], today = TODAY) => {
  const db = createDb(":memory:");
  const api = createCaller({ db });
  const added = await Promise.all(jobs.map((job) => api.maintenance.add({ every: 1, unit: "weeks", today, ...job })));
  return { db, api, ids: added.map((item) => item.id) };
};

const overdue = { name: "Job overdue", lastDoneOn: "2026-10-20" };
const dueToday = { name: "Job due", lastDoneOn: "2026-10-29" };
const soon = { name: "Job soon", lastDoneOn: "2026-10-31" };
const later = { name: "Job later", lastDoneOn: "2026-11-01", every: 4 };

describe("maintenanceDue", () => {
  it("is false before the time and true from it, until sent that day", () => {
    expect(maintenanceDue(at(7, 59), "08:00", null)).toBe(false);
    expect(maintenanceDue(at(8), "08:00", null)).toBe(true);
    expect(maintenanceDue(at(23), "08:00", "2026-11-04")).toBe(true);
    expect(maintenanceDue(at(23), "08:00", "2026-11-05")).toBe(false);
  });

  it("rejects a time that is not a clock time and names the setting", () => {
    expect(() => maintenanceDue(at(8), "early", null)).toThrow(/MAINTENANCE_TIME/);
  });
});

describe("sendMaintenance", () => {
  it("sends one count of what is overdue, due today and due this week, with no names, and opens Upkeep", async () => {
    const { db } = await withJobs([overdue, dueToday, soon, later]);
    const { sent, notify } = recorder();
    expect(await sendMaintenance(db, notify, "topic-a", at(8))).toBe("sent");
    expect(sent).toEqual([
      {
        topic: "topic-a",
        title: "HOMER",
        message: "Maintenance: 1 overdue, 1 due today, 1 due this week.",
        path: "/upkeep",
      },
    ]);
    expect(readState(db, "maintenance.sentOn")).toBe(TODAY);
  });

  it("leaves out the stages that are empty", async () => {
    const { db } = await withJobs([soon, { ...soon, name: "Job soon two" }]);
    const { sent, notify } = recorder();
    await sendMaintenance(db, notify, "topic-a", at(8));
    expect(sent[0]?.message).toBe("Maintenance: 2 due this week.");
  });

  it("says nothing when nothing is due or near, and counts the day as done", async () => {
    const { db } = await withJobs([later]);
    const { sent, notify } = recorder();
    expect(await sendMaintenance(db, notify, "topic-a", at(8))).toBe("quiet");
    expect(sent).toEqual([]);
    expect(readState(db, "maintenance.sentOn")).toBe(TODAY);
  });

  it("does not repeat a stage for the same due date, even on a later day", async () => {
    const { db } = await withJobs([overdue, soon]);
    const { sent, notify } = recorder();
    await sendMaintenance(db, notify, "topic-a", at(8));
    expect(await sendMaintenance(db, notify, "topic-a", at(8, 5))).toBe("quiet");
    expect(await sendMaintenance(db, notify, "topic-a", at(8, 0, 6))).toBe("quiet");
    expect(sent).toHaveLength(1);
  });

  it("announces a job again as due once it was told as soon, and then not again", async () => {
    const { db } = await withJobs([soon]);
    const { sent, notify } = recorder();
    await sendMaintenance(db, notify, "topic-a", at(8));
    await sendMaintenance(db, notify, "topic-a", at(8, 0, 7));
    expect(sent.map((note) => note.message)).toEqual(["Maintenance: 1 due this week.", "Maintenance: 1 due today."]);
    expect(await sendMaintenance(db, notify, "topic-a", at(8, 0, 8))).toBe("quiet");
  });

  it("tells a never-done job once, the day it is added, and not every morning after", async () => {
    const { db } = await withJobs([{ name: "Job new", lastDoneOn: null }]);
    const { sent, notify } = recorder();
    await sendMaintenance(db, notify, "topic-a", at(8));
    await sendMaintenance(db, notify, "topic-a", at(8, 0, 6));
    await sendMaintenance(db, notify, "topic-a", at(8, 0, 9));
    expect(sent.map((note) => note.message)).toEqual(["Maintenance: 1 due today."]);
  });

  it("skips a snoozed job, and tells it on the day the snooze ends", async () => {
    const { db, api, ids } = await withJobs([overdue]);
    await api.maintenance.snooze({ id: ids[0] ?? 0, until: "2026-11-07", today: TODAY });
    const { sent, notify } = recorder();
    expect(await sendMaintenance(db, notify, "topic-a", at(8))).toBe("quiet");
    expect(await sendMaintenance(db, notify, "topic-a", at(8, 0, 6))).toBe("quiet");
    expect(sent).toEqual([]);
    expect(await sendMaintenance(db, notify, "topic-a", at(8, 0, 7))).toBe("sent");
    expect(sent.map((note) => note.message)).toEqual(["Maintenance: 1 overdue."]);
  });

  it("does not tell a removed job", async () => {
    const { db, api, ids } = await withJobs([overdue]);
    await api.maintenance.remove({ id: ids[0] ?? 0 });
    const { sent, notify } = recorder();
    expect(await sendMaintenance(db, notify, "topic-a", at(8))).toBe("quiet");
    expect(sent).toEqual([]);
  });

  it("tells a job again once marking it done moves its due date: first as soon, then as due", async () => {
    const { db, api, ids } = await withJobs([dueToday]);
    const { sent, notify } = recorder();
    await sendMaintenance(db, notify, "topic-a", at(8));
    await api.maintenance.markDone({ id: ids[0] ?? 0, doneOn: TODAY, today: TODAY });
    expect(await sendMaintenance(db, notify, "topic-a", at(8, 0, 6))).toBe("sent");
    expect(await sendMaintenance(db, notify, "topic-a", at(8, 0, 12))).toBe("sent");
    expect(sent.map((note) => note.message)).toEqual([
      "Maintenance: 1 due today.",
      "Maintenance: 1 due this week.",
      "Maintenance: 1 due today.",
    ]);
  });

  it("does not remember the day or the jobs when the send failed, so the next try sends them", async () => {
    const { db } = await withJobs([overdue, soon]);
    expect(await sendMaintenance(db, recorder(false).notify, "topic-a", at(8))).toBe("failed");
    expect(readState(db, "maintenance.sentOn")).toBeNull();
    const { sent, notify } = recorder();
    expect(await sendMaintenance(db, notify, "topic-a", at(8, 5))).toBe("sent");
    expect(sent[0]?.message).toBe("Maintenance: 1 overdue, 1 due this week.");
  });
});

describe("startMaintenance", () => {
  const options = (db: ReturnType<typeof createDb>, notify: ReturnType<typeof recorder>["notify"], hour: number) => ({
    time: "08:00",
    topic: "topic-a",
    notify,
    now: () => at(hour),
    log: vi.fn(),
  });

  it("sends at start when the time has passed and it was not sent today, and only once", async () => {
    const { db } = await withJobs([overdue]);
    const { sent, notify } = recorder();
    startMaintenance(db, options(db, notify, 9))?.stop();
    await vi.waitFor(() => expect(sent).toHaveLength(1));
    startMaintenance(db, options(db, notify, 9))?.stop();
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(sent).toHaveLength(1);
  });

  it("waits for the time when started before it", async () => {
    const { db } = await withJobs([overdue]);
    const { sent, notify } = recorder();
    startMaintenance(db, options(db, notify, 3))?.stop();
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(sent).toEqual([]);
  });

  it("logs a failed send as a failure, not as a quiet day", async () => {
    const { db } = await withJobs([overdue]);
    const settings = options(db, recorder(false).notify, 9);
    startMaintenance(db, settings)?.stop();
    await vi.waitFor(() => expect(settings.log).toHaveBeenCalled());
    expect(settings.log).toHaveBeenCalledWith(expect.stringContaining("could not be sent"));
  });

  it("logs a bad time and does not throw", () => {
    const { db } = { db: createDb(":memory:") };
    const log = vi.fn();
    expect(startMaintenance(db, { time: "early", topic: "t", notify: recorder().notify, log })).toBeNull();
    expect(log).toHaveBeenCalledWith(expect.stringContaining("MAINTENANCE_TIME"));
  });
});
