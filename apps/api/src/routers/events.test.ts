import { describe, expect, it } from "vitest";
import { createDb } from "../db/client";
import { messages } from "../messages";
import { createCaller } from "./index";

const setup = () => createCaller({ db: createDb(":memory:") });

const dentist = { title: "Dentist", date: "2026-11-05", time: "14:30" };

describe("events.add", () => {
  it("adds an event with a title and a date", async () => {
    const event = await setup().events.add({ title: "  Parents' evening ", date: "2026-11-05" });
    expect(event).toMatchObject({ title: "Parents' evening", date: "2026-11-05", time: null, removedAt: null });
  });

  it("adds an event with a time", async () => {
    expect(await setup().events.add(dentist)).toMatchObject(dentist);
  });

  it("rejects a blank title, a missing date and a date that is not real", async () => {
    const api = setup();
    await expect(api.events.add({ title: " ", date: "2026-11-05" })).rejects.toMatchObject({ code: "BAD_REQUEST" });
    await expect(api.events.add({ title: "Dentist" } as never)).rejects.toMatchObject({ code: "BAD_REQUEST" });
    await expect(api.events.add({ title: "Dentist", date: "2026-02-30" })).rejects.toMatchObject({
      code: "BAD_REQUEST",
    });
  });
});

describe("events with a person", () => {
  it("adds an event for a person", async () => {
    const api = setup();
    const sam = await api.people.add({ name: "Sam" });
    const event = await api.events.add({ ...dentist, personId: sam.id });
    expect(event).toMatchObject({ title: "Dentist", personId: sam.id });
    expect(await api.events.add(dentist)).toMatchObject({ personId: null });
  });

  it("rejects a person that does not exist", async () => {
    const api = setup();
    await expect(api.events.add({ ...dentist, personId: 99 })).rejects.toMatchObject({
      code: "NOT_FOUND",
      message: messages.personNotFound,
    });
    const event = await api.events.add(dentist);
    await expect(api.events.update({ id: event.id, ...dentist, personId: 99 })).rejects.toMatchObject({
      code: "NOT_FOUND",
      message: messages.personNotFound,
    });
  });

  it("changes the person on update, and clears it when left out", async () => {
    const api = setup();
    const sam = await api.people.add({ name: "Sam" });
    const event = await api.events.add(dentist);
    expect(await api.events.update({ id: event.id, ...dentist, personId: sam.id })).toMatchObject({ personId: sam.id });
    expect(await api.events.update({ id: event.id, ...dentist })).toMatchObject({ personId: null });
  });
});

describe("events.update", () => {
  it("replaces the whole event, so a time left out is cleared", async () => {
    const api = setup();
    const event = await api.events.add(dentist);
    const updated = await api.events.update({ id: event.id, title: "Dentist", date: "2026-11-06" });
    expect(updated).toMatchObject({ id: event.id, date: "2026-11-06", time: null });
  });

  it("fails for an unknown or removed event, and changes nothing on a bad update", async () => {
    const api = setup();
    await expect(api.events.update({ id: 99, ...dentist })).rejects.toMatchObject({
      code: "NOT_FOUND",
      message: messages.eventRemoved,
    });
    const event = await api.events.add(dentist);
    await expect(api.events.update({ id: event.id, title: " ", date: "2026-11-06" })).rejects.toMatchObject({
      code: "BAD_REQUEST",
    });
    const view = await api.schedule.view({ today: "2026-11-05", days: 1 });
    expect(view.days[0]?.events).toMatchObject([{ id: event.id, title: "Dentist", time: "14:30" }]);
    await api.events.remove({ id: event.id });
    await expect(api.events.update({ id: event.id, ...dentist })).rejects.toMatchObject({ code: "NOT_FOUND" });
  });
});

describe("events.remove", () => {
  it("hides the event but keeps the row", async () => {
    const db = createDb(":memory:");
    const api = createCaller({ db });
    const event = await api.events.add(dentist);
    await api.events.remove({ id: event.id });
    const view = await api.schedule.view({ today: "2026-11-05", days: 1 });
    expect(view.days[0]?.events).toEqual([]);
    expect(db.$client.prepare("select removed_at from events where id = ?").get(event.id)).toMatchObject({
      removed_at: expect.any(String),
    });
  });

  it("fails for an unknown or already removed event", async () => {
    const api = setup();
    await expect(api.events.remove({ id: 99 })).rejects.toMatchObject({ code: "NOT_FOUND" });
    const event = await api.events.add(dentist);
    await api.events.remove({ id: event.id });
    await expect(api.events.remove({ id: event.id })).rejects.toMatchObject({
      code: "NOT_FOUND",
      message: messages.eventRemoved,
    });
  });
});

describe("schedule.view with events", () => {
  it("puts each event on its day, ordered by time with untimed last", async () => {
    const api = setup();
    await api.events.add({ title: "Untimed", date: "2026-11-05" });
    await api.events.add({ title: "Late", date: "2026-11-05", time: "18:00" });
    await api.events.add({ title: "Early", date: "2026-11-05", time: "08:00" });
    await api.events.add({ title: "Tomorrow", date: "2026-11-06" });
    const view = await api.schedule.view({ today: "2026-11-05", days: 2 });
    expect(view.days.map((day) => day.events.map((event) => event.title))).toEqual([
      ["Early", "Late", "Untimed"],
      ["Tomorrow"],
    ]);
  });

  it("leaves out events before today, after the range and removed ones", async () => {
    const api = setup();
    await api.events.add({ title: "Yesterday", date: "2026-11-04" });
    await api.events.add({ title: "Far away", date: "2026-12-25" });
    const gone = await api.events.add({ title: "Gone", date: "2026-11-05" });
    await api.events.remove({ id: gone.id });
    const view = await api.schedule.view({ today: "2026-11-05", days: 3 });
    expect(view.days.flatMap((day) => day.events)).toEqual([]);
    expect(view.overdue).toEqual([]);
  });

  it("shows the person's name on their events", async () => {
    const api = setup();
    const sam = await api.people.add({ name: "Sam" });
    await api.events.add({ ...dentist, personId: sam.id });
    await api.events.add({ title: "Party", date: "2026-11-05" });
    const view = await api.schedule.view({ today: "2026-11-05", days: 1 });
    expect(view.days[0]?.events).toMatchObject([
      { title: "Dentist", personName: "Sam" },
      { title: "Party", personName: null },
    ]);
  });

  it("filters events by person, leaving out events nobody is assigned to", async () => {
    const api = setup();
    const sam = await api.people.add({ name: "Sam" });
    const alex = await api.people.add({ name: "Alex" });
    await api.events.add({ ...dentist, personId: sam.id });
    await api.events.add({ title: "Alex's", date: "2026-11-05", personId: alex.id });
    await api.events.add({ title: "Party", date: "2026-11-05" });
    const onlySam = await api.schedule.view({ today: "2026-11-05", days: 1, personId: sam.id });
    expect(onlySam.days[0]?.events.map((event) => event.title)).toEqual(["Dentist"]);
    const everyone = await api.schedule.view({ today: "2026-11-05", days: 1 });
    expect(everyone.days[0]?.events).toHaveLength(3);
  });
});
