import { compareSchedule } from "@homer/shared";

type Timed = { time: string | null };

export type DayItem<Task, Event> =
  | { kind: "task"; value: Task }
  | { kind: "event"; value: Event };

const timeOf = <Task extends { dueTime: string | null }, Event extends Timed>(item: DayItem<Task, Event>) =>
  item.kind === "task" ? item.value.dueTime : item.value.time;

// Both lists are for one day, so the date is a placeholder and only the time orders them.
const entryAt = <Task extends { dueTime: string | null }, Event extends Timed>(item: DayItem<Task, Event>) => ({
  date: "",
  time: timeOf(item),
  overdue: false,
});

export const dayItems = <Task extends { dueTime: string | null }, Event extends Timed>(
  tasks: readonly Task[],
  events: readonly Event[],
): DayItem<Task, Event>[] =>
  [
    ...events.map((value): DayItem<Task, Event> => ({ kind: "event", value })),
    ...tasks.map((value): DayItem<Task, Event> => ({ kind: "task", value })),
  ].sort((a, b) => compareSchedule(entryAt(a), entryAt(b)));
