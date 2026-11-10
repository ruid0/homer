import { describe, expect, it } from "vitest";
import { createDb } from "../db/client";
import { messages } from "../messages";
import { createCaller } from "./index";

const setup = () => createCaller({ db: createDb(":memory:") });

const weekly = { title: "Bins", dueDate: "2026-11-02", dueTime: "07:30", repeat: "weekly" as const };

describe("tasks.add", () => {
  it("adds a task with only a title", async () => {
    const task = await setup().tasks.add({ title: "  Call the plumber " });
    expect(task).toMatchObject({
      title: "Call the plumber",
      dueDate: null,
      dueTime: null,
      repeat: null,
      personId: null,
      doneAt: null,
      removedAt: null,
    });
  });

  it("adds a task with a date, time, repeat and person", async () => {
    const api = setup();
    const sam = await api.people.add({ name: "Sam" });
    const task = await api.tasks.add({ ...weekly, personId: sam.id });
    expect(task).toMatchObject({ ...weekly, personId: sam.id });
  });

  it("rejects a blank title, and a time or repeat with no due date", async () => {
    const api = setup();
    await expect(api.tasks.add({ title: "  " })).rejects.toMatchObject({ code: "BAD_REQUEST" });
    await expect(api.tasks.add({ title: "Bins", dueTime: "07:30" })).rejects.toMatchObject({ code: "BAD_REQUEST" });
    await expect(api.tasks.add({ title: "Bins", repeat: "daily" })).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });

  it("rejects a person that does not exist", async () => {
    await expect(setup().tasks.add({ title: "Bins", personId: 99 })).rejects.toMatchObject({
      code: "NOT_FOUND",
      message: messages.personNotFound,
    });
  });
});

describe("tasks.update", () => {
  it("replaces the whole task, so a field left out is cleared", async () => {
    const api = setup();
    const sam = await api.people.add({ name: "Sam" });
    const task = await api.tasks.add({ ...weekly, personId: sam.id });
    const updated = await api.tasks.update({ id: task.id, title: "Bins out" });
    expect(updated).toMatchObject({ title: "Bins out", dueDate: null, dueTime: null, repeat: null, personId: null });
  });

  it("reschedules a task", async () => {
    const api = setup();
    const task = await api.tasks.add(weekly);
    const updated = await api.tasks.update({ id: task.id, ...weekly, dueDate: "2026-11-05" });
    expect(updated.dueDate).toBe("2026-11-05");
  });

  it("rejects a bad update without changing the task", async () => {
    const api = setup();
    const task = await api.tasks.add(weekly);
    await expect(api.tasks.update({ id: task.id, title: "Bins", repeat: "daily" })).rejects.toMatchObject({
      code: "BAD_REQUEST",
    });
    await expect(api.tasks.update({ id: task.id, ...weekly, personId: 99 })).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
    const view = await api.schedule.view({ today: "2026-11-02", days: 1 });
    expect(view.days[0]?.tasks).toMatchObject([{ id: task.id, title: "Bins", repeat: "weekly" }]);
  });

  it("fails for an unknown, done or removed task", async () => {
    const api = setup();
    await expect(api.tasks.update({ id: 99, title: "Bins" })).rejects.toMatchObject({
      code: "NOT_FOUND",
      message: messages.taskClosed,
    });
    const done = await api.tasks.add({ title: "Done" });
    await api.tasks.complete({ id: done.id, today: "2026-11-02" });
    await expect(api.tasks.update({ id: done.id, title: "Done again" })).rejects.toMatchObject({ code: "NOT_FOUND" });
    const gone = await api.tasks.add({ title: "Gone" });
    await api.tasks.remove({ id: gone.id });
    await expect(api.tasks.update({ id: gone.id, title: "Gone again" })).rejects.toMatchObject({ code: "NOT_FOUND" });
  });
});

describe("tasks.complete", () => {
  it("marks a task done and creates nothing for a task that does not repeat", async () => {
    const api = setup();
    const task = await api.tasks.add({ title: "Call", dueDate: "2026-11-02" });
    expect(await api.tasks.complete({ id: task.id, today: "2026-11-02" })).toEqual({ next: null });
    const view = await api.schedule.view({ today: "2026-11-02", days: 7 });
    expect([...view.overdue, ...view.days.flatMap((day) => day.tasks), ...view.undated]).toEqual([]);
  });

  it("completes a task with no due date", async () => {
    const api = setup();
    const task = await api.tasks.add({ title: "Call" });
    expect(await api.tasks.complete({ id: task.id, today: "2026-11-02" })).toEqual({ next: null });
  });

  it("brings a weekly task due Monday and completed Wednesday back the following Monday", async () => {
    const api = setup();
    const sam = await api.people.add({ name: "Sam" });
    const task = await api.tasks.add({ ...weekly, personId: sam.id });
    const { next } = await api.tasks.complete({ id: task.id, today: "2026-11-04" });
    expect(next).toMatchObject({ ...weekly, dueDate: "2026-11-09", personId: sam.id, doneAt: null });
    expect(next?.id).not.toBe(task.id);
  });

  it("lands after today when a repeating task is completed late", async () => {
    const api = setup();
    const task = await api.tasks.add({ title: "Bins", dueDate: "2026-11-02", repeat: "weekly" });
    const { next } = await api.tasks.complete({ id: task.id, today: "2026-11-25" });
    expect(next?.dueDate).toBe("2026-11-30");
  });

  it("creates only one next task when two people tap Done", async () => {
    const api = setup();
    const task = await api.tasks.add(weekly);
    await api.tasks.complete({ id: task.id, today: "2026-11-02" });
    await expect(api.tasks.complete({ id: task.id, today: "2026-11-02" })).rejects.toMatchObject({
      code: "NOT_FOUND",
      message: messages.taskClosed,
    });
    const view = await api.schedule.view({ today: "2026-11-02", days: 14 });
    expect(view.days.flatMap((day) => day.tasks)).toHaveLength(1);
  });

  it("fails for an unknown or removed task", async () => {
    const api = setup();
    await expect(api.tasks.complete({ id: 99, today: "2026-11-02" })).rejects.toMatchObject({ code: "NOT_FOUND" });
    const task = await api.tasks.add({ title: "Gone" });
    await api.tasks.remove({ id: task.id });
    await expect(api.tasks.complete({ id: task.id, today: "2026-11-02" })).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("rejects a date that is not a real date", async () => {
    const api = setup();
    const task = await api.tasks.add({ title: "Call" });
    await expect(api.tasks.complete({ id: task.id, today: "2026-02-30" })).rejects.toMatchObject({
      code: "BAD_REQUEST",
    });
  });
});

describe("tasks.remove", () => {
  it("hides the task and keeps the row", async () => {
    const db = createDb(":memory:");
    const api = createCaller({ db });
    const task = await api.tasks.add({ title: "Call", dueDate: "2026-11-02" });
    await api.tasks.remove({ id: task.id });
    const view = await api.schedule.view({ today: "2026-11-02", days: 1 });
    expect(view.days[0]?.tasks).toEqual([]);
    expect(db.$client.prepare("select removed_at from tasks where id = ?").get(task.id)).toMatchObject({
      removed_at: expect.any(String),
    });
  });

  it("fails for an unknown, done or already removed task", async () => {
    const api = setup();
    await expect(api.tasks.remove({ id: 99 })).rejects.toMatchObject({ code: "NOT_FOUND" });
    const task = await api.tasks.add({ title: "Call" });
    await api.tasks.remove({ id: task.id });
    await expect(api.tasks.remove({ id: task.id })).rejects.toMatchObject({ code: "NOT_FOUND" });
  });
});

describe("schedule.view", () => {
  const today = "2026-11-03";

  it("is empty when there are no tasks", async () => {
    expect(await setup().schedule.view({ today, days: 2 })).toEqual({
      overdue: [],
      days: [
        { date: "2026-11-03", tasks: [], events: [] },
        { date: "2026-11-04", tasks: [], events: [] },
      ],
      undated: [],
    });
  });

  it("lists overdue tasks first, oldest first, with how many days overdue", async () => {
    const api = setup();
    await api.tasks.add({ title: "Newer", dueDate: "2026-11-02" });
    await api.tasks.add({ title: "Older", dueDate: "2026-10-30" });
    await api.tasks.add({ title: "Today", dueDate: today });
    const view = await api.schedule.view({ today, days: 1 });
    expect(view.overdue).toMatchObject([
      { title: "Older", daysOverdue: 4 },
      { title: "Newer", daysOverdue: 1 },
    ]);
    expect(view.days[0]?.tasks).toMatchObject([{ title: "Today" }]);
  });

  it("is not overdue on the due date, even with a time that has passed", async () => {
    const api = setup();
    await api.tasks.add({ title: "Early", dueDate: today, dueTime: "06:00" });
    const view = await api.schedule.view({ today, days: 1 });
    expect(view.overdue).toEqual([]);
    expect(view.days[0]?.tasks).toHaveLength(1);
  });

  it("orders a day by time, with tasks without a time last", async () => {
    const api = setup();
    await api.tasks.add({ title: "Anytime", dueDate: today });
    await api.tasks.add({ title: "Evening", dueDate: today, dueTime: "18:00" });
    await api.tasks.add({ title: "Morning", dueDate: today, dueTime: "07:00" });
    const titles = (await api.schedule.view({ today, days: 1 })).days[0]?.tasks.map((task) => task.title);
    expect(titles).toEqual(["Morning", "Evening", "Anytime"]);
  });

  it("groups tasks by day and leaves out days beyond the range", async () => {
    const api = setup();
    await api.tasks.add({ title: "Tomorrow", dueDate: "2026-11-04" });
    await api.tasks.add({ title: "Day three", dueDate: "2026-11-05" });
    await api.tasks.add({ title: "Too far", dueDate: "2026-11-06" });
    const view = await api.schedule.view({ today, days: 3 });
    expect(view.days.map((day) => [day.date, day.tasks.map((task) => task.title)])).toEqual([
      ["2026-11-03", []],
      ["2026-11-04", ["Tomorrow"]],
      ["2026-11-05", ["Day three"]],
    ]);
  });

  it("lists tasks with no due date separately", async () => {
    const api = setup();
    await api.tasks.add({ title: "Call the plumber" });
    expect((await api.schedule.view({ today, days: 1 })).undated).toMatchObject([{ title: "Call the plumber" }]);
  });

  it("filters tasks by person and shows the person's name", async () => {
    const api = setup();
    const sam = await api.people.add({ name: "Sam" });
    const alex = await api.people.add({ name: "Alex" });
    await api.tasks.add({ title: "Sam's", dueDate: today, personId: sam.id });
    await api.tasks.add({ title: "Alex's", dueDate: "2026-11-01", personId: alex.id });
    await api.tasks.add({ title: "Nobody's", dueDate: today });
    await api.tasks.add({ title: "Sam's loose one", personId: sam.id });
    const all = await api.schedule.view({ today, days: 1 });
    expect(all.days[0]?.tasks.find((task) => task.title === "Sam's")).toMatchObject({ personName: "Sam" });
    expect(all.days[0]?.tasks.find((task) => task.title === "Nobody's")).toMatchObject({ personName: null });
    const onlySam = await api.schedule.view({ today, days: 1, personId: sam.id });
    expect(onlySam.overdue).toEqual([]);
    expect(onlySam.days[0]?.tasks.map((task) => task.title)).toEqual(["Sam's"]);
    expect(onlySam.undated.map((task) => task.title)).toEqual(["Sam's loose one"]);
  });

  it("leaves out done and removed tasks", async () => {
    const api = setup();
    const done = await api.tasks.add({ title: "Done", dueDate: today });
    const gone = await api.tasks.add({ title: "Gone", dueDate: today });
    await api.tasks.complete({ id: done.id, today });
    await api.tasks.remove({ id: gone.id });
    expect((await api.schedule.view({ today, days: 1 })).days[0]?.tasks).toEqual([]);
  });

  it("rejects a bad date and a range outside 1 to 31 days", async () => {
    const api = setup();
    await expect(api.schedule.view({ today: "2026-02-30", days: 1 })).rejects.toMatchObject({ code: "BAD_REQUEST" });
    await expect(api.schedule.view({ today, days: 0 })).rejects.toMatchObject({ code: "BAD_REQUEST" });
    await expect(api.schedule.view({ today, days: 32 })).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });
});
