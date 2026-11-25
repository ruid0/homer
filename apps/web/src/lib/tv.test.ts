import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { fit, leftToday } from "./tv";
import type { DayItem } from "./dayItems";

type Task = { id: number; dueTime: string | null };
type Event = { id: number; time: string | null };

const task = (id: number, dueTime: string | null): DayItem<Task, Event> => ({ kind: "task", value: { id, dueTime } });
const event = (id: number, time: string | null): DayItem<Task, Event> => ({ kind: "event", value: { id, time } });

describe("leftToday", () => {
  it("keeps late tasks and open tasks whose time has passed, drops past events and the marker", () => {
    const rows = leftToday<Task, Event>(
      [{ id: 9, dueTime: null }],
      [event(1, "08:00"), task(5, "09:00"), task(2, "12:00"), task(3, null), event(4, "19:00")],
      "12:00",
    );
    expect(rows.map((row) => [row.kind, row.value.id])).toEqual([
      ["overdue", 9],
      ["task", 5],
      ["task", 2],
      ["task", 3],
      ["event", 4],
    ]);
  });

  it("is empty when only past events are left", () => {
    expect(leftToday<Task, Event>([], [event(1, "08:00")], "09:00")).toEqual([]);
  });
});

describe("fit", () => {
  it("shows everything that fits", () => {
    expect(fit([1, 2, 3], 3)).toEqual({ shown: [1, 2, 3], more: 0 });
  });

  it("cuts a longer list and counts what is left out, even when it is one", () => {
    expect(fit([1, 2, 3, 4], 3)).toEqual({ shown: [1, 2, 3], more: 1 });
    expect(fit([1, 2, 3, 4, 5], 3)).toEqual({ shown: [1, 2, 3], more: 2 });
  });

  it("never loses a row: shown plus more is the whole list, and shown never passes the limit", () => {
    fc.assert(
      fc.property(fc.array(fc.integer()), fc.integer({ min: 1, max: 12 }), (rows, max) => {
        const { shown, more } = fit(rows, max);
        expect(shown.length + more).toBe(rows.length);
        expect(shown.length).toBeLessThanOrEqual(max);
        expect(shown).toEqual(rows.slice(0, shown.length));
      }),
    );
  });
});
