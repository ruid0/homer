import { timelineRows, type TimelineRow } from "./timeline";
import type { DayItem } from "./dayItems";

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
