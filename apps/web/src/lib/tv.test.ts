import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { allocateRows, EMPTY_REM, MORE_REM, ROW_REM, fit, leftToday, shortDay, upcomingRows } from "./tv";
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

describe("upcomingRows", () => {
  it("lists each day in turn, its items in time order, and leaves out empty days", () => {
    const rows = upcomingRows<Task, Event>([
      { date: "2026-11-28", tasks: [{ id: 1, dueTime: "15:00" }], events: [{ id: 2, time: "08:00" }] },
      { date: "2026-11-29", tasks: [], events: [] },
      { date: "2026-11-30", tasks: [{ id: 3, dueTime: null }], events: [] },
    ]);
    expect(rows.map((row) => [row.date, row.item.kind, row.item.value.id])).toEqual([
      ["2026-11-28", "event", 2],
      ["2026-11-28", "task", 1],
      ["2026-11-30", "task", 3],
    ]);
  });

  it("keeps every item, whatever the days hold", () => {
    fc.assert(
      fc.property(fc.array(fc.tuple(fc.nat(5), fc.nat(5)), { maxLength: 6 }), (counts) => {
        const days = counts.map(([tasks, events], at) => ({
          date: `2026-11-${String(20 + at)}`,
          tasks: Array.from({ length: tasks }, (_, id) => ({ id, dueTime: null })),
          events: Array.from({ length: events }, (_, id) => ({ id, time: null })),
        }));
        expect(upcomingRows<Task, Event>(days)).toHaveLength(counts.reduce((sum, [a, b]) => sum + a + b, 0));
      }),
    );
  });
});

describe("shortDay", () => {
  it("names a day by its first three letters and its number", () => {
    expect(shortDay("2026-11-28")).toBe("Sat 28");
    expect(shortDay("2026-12-01")).toBe("Tue 1");
  });
});

describe("allocateRows", () => {
  const spent = (blocks: { count: number; fixed: number }[], shown: number[]) =>
    blocks.reduce(
      (sum, block, at) =>
        sum +
        block.fixed +
        (block.count === 0 ? EMPTY_REM : (shown[at] ?? 0) * ROW_REM) +
        ((shown[at] ?? 0) < block.count ? MORE_REM : 0),
      0,
    );

  it("shows everything when there is room", () => {
    expect(
      allocateRows(100, [
        { count: 3, fixed: 2 },
        { count: 0, fixed: 2 },
        { count: 4, fixed: 2 },
      ]),
    ).toEqual([3, 0, 4]);
  });

  it("gives every section a couple of rows before the first one takes more", () => {
    const blocks = [
      { count: 10, fixed: 3 },
      { count: 10, fixed: 3 },
      { count: 10, fixed: 3 },
    ];
    const [first = 0, second = 0, third = 0] = allocateRows(34, blocks);
    expect([second, third].every((rows) => rows >= 2)).toBe(true);
    expect(first).toBeGreaterThanOrEqual(second);
  });

  it("fills the earlier section completely before the later ones grow past that", () => {
    const [first = 0, second = 0] = allocateRows(36, [
      { count: 4, fixed: 3 },
      { count: 10, fixed: 3 },
    ]);
    expect(first).toBe(4);
    expect(second).toBeGreaterThan(2);
  });

  it("gives the room a short section does not need to a longer one", () => {
    const [first = 0, second = 0] = allocateRows(30, [
      { count: 1, fixed: 3 },
      { count: 20, fixed: 3 },
    ]);
    expect(first).toBe(1);
    expect(second).toBeGreaterThan(first);
  });

  it("never spends more than the budget when the headings alone fit, and never shows more than exist", () => {
    fc.assert(
      fc.property(
        fc.array(fc.record({ count: fc.nat(12), fixed: fc.double({ min: 2, max: 5, noNaN: true }) }), {
          minLength: 1,
          maxLength: 4,
        }),
        fc.double({ min: 0, max: 60, noNaN: true }),
        (blocks, budget) => {
          const shown = allocateRows(budget, blocks);
          const floor = spent(
            blocks,
            blocks.map(() => 0),
          );
          if (floor <= budget) expect(spent(blocks, shown)).toBeLessThanOrEqual(budget);
          shown.forEach((rows, at) => expect(rows).toBeLessThanOrEqual(blocks[at]?.count ?? 0));
        },
      ),
    );
  });
});
