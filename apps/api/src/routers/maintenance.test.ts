import { describe, expect, it } from "vitest";
import { createDb } from "../db/client";
import { messages } from "../messages";
import { createCaller } from "./index";

const today = "2026-11-05";

const setup = () => createCaller({ db: createDb(":memory:") });

const addFilter = (api: ReturnType<typeof setup>, lastDoneOn: string | null = "2026-11-01") =>
  api.maintenance.add({ name: "Filter", every: 3, unit: "months", lastDoneOn, today });

describe("maintenance.add and list", () => {
  it("counts the due date from the day it was last done", async () => {
    const api = setup();
    await addFilter(api, "2026-11-01");
    const [item] = await api.maintenance.list({ today });
    expect(item).toMatchObject({ name: "Filter", every: 3, unit: "months", lastDoneOn: "2026-11-01", dueOn: "2027-02-01", status: "later" });
    expect(item?.daysUntil).toBe(88);
  });

  it("a last done date also becomes the first history row", async () => {
    const api = setup();
    const { id } = await addFilter(api, "2026-11-01");
    expect((await api.maintenance.history({ id })).map((row) => row.doneOn)).toEqual(["2026-11-01"]);
  });

  it("an item never done is due the day it was added, with a fixed date", async () => {
    const api = setup();
    await addFilter(api, null);
    const first = (await api.maintenance.list({ today }))[0];
    const later = (await api.maintenance.list({ today: "2026-11-20" }))[0];
    expect(first).toMatchObject({ lastDoneOn: null, dueOn: today, status: "due" });
    expect(later).toMatchObject({ dueOn: today, status: "overdue", daysUntil: -15 });
  });

  it("lists the most overdue first, then by due date", async () => {
    const api = setup();
    await api.maintenance.add({ name: "Later one", every: 6, unit: "months", lastDoneOn: "2026-11-01", today });
    await api.maintenance.add({ name: "Overdue one", every: 1, unit: "weeks", lastDoneOn: "2026-10-01", today });
    await api.maintenance.add({ name: "Soon one", every: 1, unit: "weeks", lastDoneOn: "2026-11-01", today });
    expect((await api.maintenance.list({ today })).map((item) => item.name)).toEqual(["Overdue one", "Soon one", "Later one"]);
  });

  it("never shows the note bookkeeping", async () => {
    const api = setup();
    await addFilter(api);
    expect(JSON.stringify(await api.maintenance.list({ today }))).not.toMatch(/notified/i);
  });

  it("refuses a name already used, whatever its case, and allows it again after removal", async () => {
    const api = setup();
    const { id } = await addFilter(api);
    await expect(api.maintenance.add({ name: "FILTER", every: 1, unit: "weeks", lastDoneOn: null, today })).rejects.toMatchObject({
      code: "CONFLICT",
      message: messages.maintenanceNameTaken("FILTER"),
    });
    await api.maintenance.remove({ id });
    await expect(api.maintenance.add({ name: "filter", every: 1, unit: "weeks", lastDoneOn: null, today })).resolves.toBeDefined();
  });

  it("rejects an interval or date outside the allowed range and writes nothing", async () => {
    const api = setup();
    await expect(api.maintenance.add({ name: "X", every: 0, unit: "weeks", lastDoneOn: null, today })).rejects.toThrow();
    await expect(api.maintenance.add({ name: "X", every: 1, unit: "weeks", lastDoneOn: "2026-11-06", today })).rejects.toThrow();
    expect(await api.maintenance.list({ today })).toEqual([]);
  });
});

describe("maintenance.update and remove", () => {
  it("changes the name and interval and moves the due date, keeping the last done date", async () => {
    const api = setup();
    const { id } = await addFilter(api, "2026-11-01");
    await api.maintenance.update({ id, name: "Furnace filter", every: 1, unit: "months" });
    expect((await api.maintenance.list({ today }))[0]).toMatchObject({ name: "Furnace filter", lastDoneOn: "2026-11-01", dueOn: "2026-12-01" });
  });

  it("refuses a rename onto another open item's name, but not onto its own", async () => {
    const api = setup();
    const { id } = await addFilter(api);
    await api.maintenance.add({ name: "Salt", every: 1, unit: "months", lastDoneOn: null, today });
    await expect(api.maintenance.update({ id, name: "salt", every: 3, unit: "months" })).rejects.toMatchObject({ code: "CONFLICT" });
    await expect(api.maintenance.update({ id, name: "FILTER", every: 3, unit: "months" })).resolves.toBeDefined();
  });

  it("removing hides the item but keeps its history, and a second remove says it is gone", async () => {
    const api = setup();
    const { id } = await addFilter(api);
    await api.maintenance.remove({ id });
    expect(await api.maintenance.list({ today })).toEqual([]);
    expect((await api.maintenance.history({ id })).length).toBe(1);
    await expect(api.maintenance.remove({ id })).rejects.toMatchObject({ code: "NOT_FOUND", message: messages.maintenanceGone });
    await expect(api.maintenance.update({ id, name: "A", every: 1, unit: "weeks" })).rejects.toMatchObject({ code: "NOT_FOUND" });
  });
});

describe("maintenance.markDone and undoDone", () => {
  it("counts the next due date from the day it was done, even when done late", async () => {
    const api = setup();
    const { id } = await addFilter(api, "2026-02-01");
    await api.maintenance.markDone({ id, doneOn: "2026-11-05", today });
    expect((await api.maintenance.list({ today }))[0]).toMatchObject({ lastDoneOn: "2026-11-05", dueOn: "2027-02-05" });
  });

  it("a done date earlier than the latest is kept in the history and leaves the due date alone", async () => {
    const api = setup();
    const { id } = await addFilter(api, "2026-11-01");
    const { doneId } = await api.maintenance.markDone({ id, doneOn: "2026-09-15", today });
    expect(doneId).toBeGreaterThan(0);
    expect((await api.maintenance.list({ today }))[0]?.lastDoneOn).toBe("2026-11-01");
    expect((await api.maintenance.history({ id })).map((row) => row.doneOn)).toEqual(["2026-11-01", "2026-09-15"]);
  });

  it("refuses a future date, a date over a year back, and a removed item", async () => {
    const api = setup();
    const { id } = await addFilter(api);
    await expect(api.maintenance.markDone({ id, doneOn: "2026-11-06", today })).rejects.toThrow();
    await expect(api.maintenance.markDone({ id, doneOn: "2025-11-04", today })).rejects.toThrow();
    await api.maintenance.remove({ id });
    await expect(api.maintenance.markDone({ id, doneOn: today, today })).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("refuses a second done on a day that is already marked, and says so", async () => {
    const api = setup();
    const { id } = await addFilter(api, "2026-11-01");
    await expect(api.maintenance.markDone({ id, doneOn: "2026-11-01", today })).rejects.toMatchObject({
      code: "CONFLICT",
      message: messages.maintenanceAlreadyDone("Filter", false),
    });
    await api.maintenance.markDone({ id, doneOn: today, today });
    await expect(api.maintenance.markDone({ id, doneOn: today, today })).rejects.toMatchObject({
      message: "Filter is already marked done today.",
    });
    expect(await api.maintenance.history({ id })).toHaveLength(2);
  });

  it("undo removes exactly that done record and puts the previous date back", async () => {
    const api = setup();
    const { id } = await addFilter(api, "2026-11-01");
    const first = await api.maintenance.markDone({ id, doneOn: "2026-11-03", today });
    const second = await api.maintenance.markDone({ id, doneOn: "2026-11-05", today });
    await api.maintenance.undoDone({ doneId: second.doneId });
    expect((await api.maintenance.list({ today }))[0]?.lastDoneOn).toBe("2026-11-03");
    await expect(api.maintenance.undoDone({ doneId: second.doneId })).rejects.toMatchObject({
      code: "NOT_FOUND",
      message: messages.maintenanceDoneGone,
    });
    expect((await api.maintenance.list({ today }))[0]?.lastDoneOn).toBe("2026-11-03");
    await api.maintenance.undoDone({ doneId: first.doneId });
    expect((await api.maintenance.list({ today }))[0]?.lastDoneOn).toBe("2026-11-01");
  });

  it("undoing the only done date makes the item never done again, due on the day it was added", async () => {
    const api = setup();
    const { id } = await addFilter(api, null);
    const { doneId } = await api.maintenance.markDone({ id, doneOn: today, today });
    await api.maintenance.undoDone({ doneId });
    expect((await api.maintenance.list({ today }))[0]).toMatchObject({ lastDoneOn: null, dueOn: today });
  });

  it("undoing an older backdated record does not change the last done date", async () => {
    const api = setup();
    const { id } = await addFilter(api, "2026-11-01");
    const { doneId } = await api.maintenance.markDone({ id, doneOn: "2026-09-15", today });
    await api.maintenance.undoDone({ doneId });
    expect((await api.maintenance.list({ today }))[0]?.lastDoneOn).toBe("2026-11-01");
  });

  it("history lists the done dates newest first, with ids", async () => {
    const api = setup();
    const { id } = await addFilter(api, "2026-10-01");
    await api.maintenance.markDone({ id, doneOn: "2026-11-05", today });
    const history = await api.maintenance.history({ id });
    expect(history.map((row) => row.doneOn)).toEqual(["2026-11-05", "2026-10-01"]);
    expect(history.every((row) => row.id > 0)).toBe(true);
  });

  it("an item that is removed cannot have a done date undone, and its history stays readable", async () => {
    const api = setup();
    const { id } = await addFilter(api, "2026-11-01");
    const { doneId } = await api.maintenance.markDone({ id, doneOn: "2026-11-03", today });
    await api.maintenance.remove({ id });
    await expect(api.maintenance.undoDone({ doneId })).rejects.toMatchObject({ code: "NOT_FOUND", message: messages.maintenanceGone });
    expect((await api.maintenance.history({ id })).map((row) => row.doneOn)).toEqual(["2026-11-03", "2026-11-01"]);
    expect(await api.maintenance.history({ id: 999 })).toEqual([]);
  });
});

describe("maintenance edges", () => {
  it("accepts a date exactly a year back for add and done, and no further", async () => {
    const api = setup();
    const { id } = await addFilter(api, null);
    await expect(api.maintenance.markDone({ id, doneOn: "2025-11-05", today })).resolves.toBeDefined();
    await expect(addFilter(api, "2025-11-04")).rejects.toThrow();
  });

  it("refuses a rename onto an open item's name but allows a removed item's name", async () => {
    const api = setup();
    const gone = await api.maintenance.add({ name: "Old name", every: 1, unit: "weeks", lastDoneOn: null, today });
    await api.maintenance.remove({ id: gone.id });
    const { id } = await addFilter(api);
    await expect(api.maintenance.update({ id, name: "old name", every: 3, unit: "months" })).resolves.toBeDefined();
  });

  it("a failed add leaves nothing behind", async () => {
    const api = setup();
    await addFilter(api);
    await expect(api.maintenance.add({ name: "filter", every: 1, unit: "weeks", lastDoneOn: "2026-11-01", today })).rejects.toMatchObject({
      code: "CONFLICT",
    });
    const [only] = await api.maintenance.list({ today });
    expect(await api.maintenance.list({ today })).toHaveLength(1);
    expect(await api.maintenance.history({ id: only!.id + 1 })).toEqual([]);
  });

  it("no answer carries the note bookkeeping", async () => {
    const api = setup();
    const { id } = await addFilter(api);
    const done = await api.maintenance.markDone({ id, doneOn: today, today });
    const undone = await api.maintenance.undoDone({ doneId: done.doneId });
    const everything = JSON.stringify([await api.maintenance.history({ id }), done, undone, await api.maintenance.update({ id, name: "F", every: 1, unit: "weeks" })]);
    expect(everything).not.toMatch(/notified/i);
  });
});
