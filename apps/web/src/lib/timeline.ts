import { timeOf, type DayItem } from "./dayItems";

export type TimelineRow<Task, Event> =
  { kind: "overdue"; value: Task } | { kind: "task"; value: Task } | { kind: "event"; value: Event } | { kind: "now" };

// A timed item earlier than `now` ("HH:MM") is past. An item with no time never is.
const isPast = (item: DayItem<{ dueTime: string | null }, { time: string | null }>, now: string) => {
  const time = timeOf(item);
  return time !== null && time < now;
};

// How many of a day's items (already in day order) come before `now`: the timed ones earlier than it.
export const countBefore = <Task extends { dueTime: string | null }, Event extends { time: string | null }>(
  items: readonly DayItem<Task, Event>[],
  now: string,
): number => items.filter((item) => isPast(item, now)).length;

// `items` are already in day order (see dayItems). Timed items before `now` sit above the marker, and
// everything else, including items with no time, sits below it.
export const timelineRows = <Task extends { dueTime: string | null }, Event extends { time: string | null }>(
  overdue: readonly Task[],
  items: readonly DayItem<Task, Event>[],
  now: string,
): TimelineRow<Task, Event>[] => [
  ...overdue.map((value): TimelineRow<Task, Event> => ({ kind: "overdue", value })),
  ...items.filter((item) => isPast(item, now)),
  { kind: "now" },
  ...items.filter((item) => !isPast(item, now)),
];
