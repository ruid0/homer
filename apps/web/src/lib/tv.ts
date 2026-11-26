import { copy } from "../copy";
import { dayItems, type DayItem } from "./dayItems";
import { timelineRows, type TimelineRow } from "./timeline";

// The TV shows what is left: late tasks first, then today's tasks (one still open after its time stays), then the events
// that have not happened yet. A past event is gone, and there is no Now marker: the big clock says what time it is.
export const leftToday = <Task extends { dueTime: string | null }, Event extends { time: string | null }>(
  overdue: readonly Task[],
  items: readonly DayItem<Task, Event>[],
  now: string,
): Exclude<TimelineRow<Task, Event>, { kind: "now" }>[] => {
  const rows = timelineRows(overdue, items, now);
  const marker = rows.findIndex((row) => row.kind === "now");
  return rows.flatMap((row, at) => (row.kind === "now" || (row.kind === "event" && at < marker) ? [] : [row]));
};

// The screen has no scroll, so a list is cut to what fits and the rest is counted.
export const fit = <T>(rows: readonly T[], max: number): { shown: T[]; more: number } => ({
  shown: rows.slice(0, max),
  more: Math.max(0, rows.length - max),
});

export type UpcomingRow<Task, Event> = { date: string; item: DayItem<Task, Event> };

// The days after tomorrow as one list: each day in turn, its items in time order. A day with nothing adds no rows.
export const upcomingRows = <Task extends { dueTime: string | null }, Event extends { time: string | null }>(
  days: readonly { date: string; tasks: readonly Task[]; events: readonly Event[] }[],
): UpcomingRow<Task, Event>[] =>
  days.flatMap((day) => dayItems(day.tasks, day.events).map((item) => ({ date: day.date, item })));

// "Sat 28": enough to tell the days of the coming week apart.
export const shortDay = (date: string): string => {
  const parsed = new Date(`${date}T00:00:00Z`);
  // The short names start on Monday, and a date's weekday number starts on Sunday.
  const weekday = copy.routine.weekdaysShort[(parsed.getUTCDay() + 6) % 7] ?? "";
  return copy.tv.upcomingDay(weekday, parsed.getUTCDate());
};

// What a section costs on the screen, in rem, to match its classes: a row is one line of 1.75rem with 0.375rem above
// and below, the "+N more" line and a list's empty message are each a line with padding. The safe-margin test in the
// browser fails if these drift from the CSS.
export const ROW_REM = 2.5;
export const MORE_REM = 2;
export const EMPTY_REM = 2.75;
export const HEADING_REM = 2.75;
export const GAP_REM = 2;

export type Block = {
  count: number;
  // What the section costs whatever it shows: its heading, the gap above it and any closing note.
  fixed: number;
};

const costOf = (block: Block, rows: number): number =>
  block.fixed + (block.count === 0 ? EMPTY_REM : rows * ROW_REM) + (rows < block.count ? MORE_REM : 0);

// Every section shows at least this many rows before an earlier one takes more, so a busy Today cannot hide the rest.
const FLOOR_ROWS = 2;

// How many rows each section of a column shows in the room it has. Each section first gets its couple of rows, in turns.
// What is left goes to the sections in order: the first is filled before the second grows past its couple.
export const allocateRows = (budget: number, blocks: readonly Block[]): number[] => {
  const total = (shown: readonly number[]) => blocks.reduce((sum, block, at) => sum + costOf(block, shown[at] ?? 0), 0);
  const addRow = (shown: number[], at: number, limit: number): number[] => {
    if ((shown[at] ?? 0) >= limit) return shown;
    const next = shown.map((rows, index) => (index === at ? rows + 1 : rows));
    return total(next) <= budget ? next : shown;
  };
  const fill = (shown: number[], at: number, limit: number): number[] => {
    const next = addRow(shown, at, limit);
    return next === shown ? shown : fill(next, at, limit);
  };
  const inTurns = (shown: number[]): number[] => {
    const next = blocks.reduce((rows, block, at) => addRow(rows, at, Math.min(block.count, FLOOR_ROWS)), shown);
    return next.some((rows, at) => rows !== shown[at]) ? inTurns(next) : shown;
  };
  return blocks.reduce((rows, block, at) => fill(rows, at, block.count), inTurns(blocks.map(() => 0)));
};
