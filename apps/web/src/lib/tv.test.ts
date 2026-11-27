import fc from "fast-check";
import { describe, expect, it } from "vitest";
import {
  EMPTY_REM,
  GAP_REM,
  HEADING_REM,
  MORE_REM,
  ROW_REM,
  allocateRows,
  dayLines,
  fit,
  leftToday,
  planDays,
  shortDay,
  upcomingRows,
} from "./tv";
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

  it("gives every section one row before the first one takes more, unless its floor is zero", () => {
    const blocks = [
      { count: 10, fixed: 3 },
      { count: 10, fixed: 3 },
      { count: 10, fixed: 3 },
    ];
    const [first = 0, second = 0, third = 0] = allocateRows(34, blocks);
    expect([second, third].every((rows) => rows >= 1)).toBe(true);
    expect(first).toBeGreaterThanOrEqual(second);
    const [, , last = 0] = allocateRows(34, [blocks[0]!, blocks[1]!, { ...blocks[2]!, floor: 0 }]);
    expect(last).toBeLessThan(third);
  });

  it("fills the earlier section completely before the later ones grow past that", () => {
    const [first = 0, second = 0] = allocateRows(36, [
      { count: 4, fixed: 3 },
      { count: 10, fixed: 3 },
    ]);
    expect(first).toBe(4);
    expect(second).toBeGreaterThan(1);
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

describe("dayLines", () => {
  const row = (date: string, id: number) => ({ date, item: task(id, null) });

  it("is one line a day: its first item and how many items the day holds", () => {
    const lines = dayLines([row("2026-11-28", 1), row("2026-11-28", 2), row("2026-11-28", 3), row("2026-11-30", 4)]);
    expect(lines.map((line) => [line.date, line.item.value.id, line.count])).toEqual([
      ["2026-11-28", 1, 3],
      ["2026-11-30", 4, 1],
    ]);
  });

  it("is empty when nothing is planned", () => {
    expect(dayLines([])).toEqual([]);
  });
});

describe("planDays", () => {
  const costOfDay = (rows: number, fixed: number) => fixed + rows * ROW_REM;
  const upcomingFixed = HEADING_REM + GAP_REM;

  it("shows every row of the three sections when there is room", () => {
    const plan = planDays(100, { today: 3, tomorrow: 3, upcomingRows: 7, upcomingDays: 4 });
    expect(plan).toEqual({ today: 3, tomorrow: 3, upcoming: 7, view: "rows" });
  });

  it("shows Today and Tomorrow in full before Upcoming gets anything", () => {
    // Exactly their room, and nothing over for Upcoming.
    const budget = costOfDay(6, HEADING_REM) + costOfDay(6, HEADING_REM + GAP_REM);
    const plan = planDays(budget, { today: 6, tomorrow: 6, upcomingRows: 12, upcomingDays: 5 });
    expect(plan).toMatchObject({ today: 6, tomorrow: 6, view: "hidden" });
  });

  it("gives Upcoming what is left: a line a day when its rows do not fit", () => {
    const budget =
      costOfDay(3, HEADING_REM) + costOfDay(3, HEADING_REM + GAP_REM) + upcomingFixed + 2 * ROW_REM + MORE_REM;
    const plan = planDays(budget, { today: 3, tomorrow: 3, upcomingRows: 12, upcomingDays: 5 });
    expect(plan).toEqual({ today: 3, tomorrow: 3, upcoming: 2, view: "lines" });
  });

  it("shrinks Upcoming to its heading and a count when there is no room for a line", () => {
    const budget = costOfDay(3, HEADING_REM) + costOfDay(3, HEADING_REM + GAP_REM) + upcomingFixed;
    const plan = planDays(budget, { today: 3, tomorrow: 3, upcomingRows: 12, upcomingDays: 5 });
    expect(plan).toMatchObject({ today: 3, tomorrow: 3, upcoming: 0, view: "count" });
  });

  it("shows nothing it cannot afford before the grid has been measured (no room, or no number)", () => {
    for (const budget of [0, -5, Number.NaN]) {
      expect(planDays(budget, { today: 3, tomorrow: 3, upcomingRows: 5, upcomingDays: 2 })).toEqual({
        today: 0,
        tomorrow: 0,
        upcoming: 0,
        view: "hidden",
      });
      expect(planDays(budget, { today: 0, tomorrow: 0, upcomingRows: 0, upcomingDays: 0 }).view).toBe("hidden");
    }
  });

  it("never shows more than exists", () => {
    fc.assert(
      fc.property(
        fc.record({ today: fc.nat(10), tomorrow: fc.nat(10), upcomingRows: fc.nat(20), upcomingDays: fc.nat(5) }),
        fc.double({ min: 0, max: 90, noNaN: true }),
        (sizes, budget) => {
          const days = Math.min(sizes.upcomingDays, sizes.upcomingRows);
          const plan = planDays(budget, { ...sizes, upcomingDays: days });
          expect(plan.today).toBeLessThanOrEqual(sizes.today);
          expect(plan.tomorrow).toBeLessThanOrEqual(sizes.tomorrow);
          expect(plan.upcoming).toBeLessThanOrEqual(plan.view === "lines" ? days : sizes.upcomingRows);
          if (plan.view === "lines") expect(plan.upcoming).toBeGreaterThan(0);
          if (plan.view === "count" || plan.view === "hidden") expect(plan.upcoming).toBe(0);
        },
      ),
    );
  });
});
