import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { dayItems } from "./dayItems";
import { timelineRows, type TimelineRow } from "./timeline";

const task = (id: number, title: string, dueTime: string | null) => ({ id, title, dueTime });
const event = (id: number, title: string, time: string | null) => ({ id, title, time });

const labels = (rows: TimelineRow<ReturnType<typeof task>, ReturnType<typeof event>>[]) =>
  rows.map((row) => (row.kind === "now" ? "now" : `${row.kind}:${row.value.title}`));

describe("timelineRows", () => {
  it("lists overdue first, then the day, with the Now marker between earlier and later items", () => {
    const rows = timelineRows(
      [task(1, "Call plumber", null)],
      dayItems([task(2, "Bins", "18:00")], [event(1, "Standup", "08:00"), event(2, "Dentist", "11:30")]),
      "09:41",
    );
    expect(labels(rows)).toEqual([
      "overdue:Call plumber",
      "event:Standup",
      "now",
      "event:Dentist",
      "task:Bins",
    ]);
  });

  it("keeps untimed items after the marker", () => {
    const rows = timelineRows([], dayItems([task(1, "Wash", null)], [event(1, "Dentist", "08:00")]), "09:41");
    expect(labels(rows)).toEqual(["event:Dentist", "now", "task:Wash"]);
  });

  it("puts an item exactly at the current time after the marker", () => {
    const rows = timelineRows([], dayItems([], [event(1, "Dentist", "09:41")]), "09:41");
    expect(labels(rows)).toEqual(["now", "event:Dentist"]);
  });

  it("still shows the marker when there is nothing today", () => {
    expect(labels(timelineRows([], [], "09:41"))).toEqual(["now"]);
    expect(labels(timelineRows([task(1, "Call", null)], [], "09:41"))).toEqual(["overdue:Call", "now"]);
  });

  it("has one marker, splits timed items around now, and keeps day order", () => {
    const time = fc
      .tuple(fc.integer({ min: 0, max: 23 }), fc.integer({ min: 0, max: 59 }))
      .map(([h, m]) => `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`);
    const maybeTime = fc.option(time, { nil: null });
    const isEarlier = (value: string | null, now: string) => value !== null && value < now;

    fc.assert(
      fc.property(
        fc.array(maybeTime, { maxLength: 6 }),
        fc.array(maybeTime, { maxLength: 6 }),
        time,
        (taskTimes, eventTimes, now) => {
          const items = dayItems(
            taskTimes.map((dueTime, id) => task(id, `t${id}`, dueTime)),
            eventTimes.map((at, id) => event(id, `e${id}`, at)),
          );
          const rows = timelineRows([], items, now);
          const marker = rows.findIndex((row) => row.kind === "now");
          const timeOfRow = (row: (typeof rows)[number]) =>
            row.kind === "task" ? row.value.dueTime : row.kind === "event" ? row.value.time : null;

          expect(rows.filter((row) => row.kind === "now")).toHaveLength(1);
          expect(rows.slice(0, marker).every((row) => isEarlier(timeOfRow(row), now))).toBe(true);
          expect(rows.slice(marker + 1).every((row) => !isEarlier(timeOfRow(row), now))).toBe(true);
          expect(rows.filter((row) => row.kind !== "now").map(timeOfRow)).toEqual(
            [...items.map((item) => (item.kind === "task" ? item.value.dueTime : item.value.time))].sort(
              (a, b) => (a ?? "99:99") < (b ?? "99:99") ? -1 : (a ?? "99:99") > (b ?? "99:99") ? 1 : 0,
            ),
          );
        },
      ),
    );
  });
});
