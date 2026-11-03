import { describe, expect, it } from "vitest";
import { dayItems } from "./dayItems";

const task = (id: number, title: string, dueTime: string | null) => ({ id, title, dueTime });
const event = (id: number, title: string, time: string | null) => ({ id, title, time });

describe("dayItems", () => {
  it("merges tasks and events by time, with untimed last", () => {
    const items = dayItems(
      [task(1, "Bins", "18:00"), task(2, "Call", null)],
      [event(1, "Dentist", "09:00"), event(2, "Party", null)],
    );
    expect(items.map((item) => `${item.kind}:${item.value.title}`)).toEqual([
      "event:Dentist",
      "task:Bins",
      "event:Party",
      "task:Call",
    ]);
  });

  it("puts an event before a task at the same time", () => {
    const items = dayItems([task(1, "Bins", "09:00")], [event(1, "Dentist", "09:00")]);
    expect(items.map((item) => item.kind)).toEqual(["event", "task"]);
  });

  it("is empty for an empty day", () => {
    expect(dayItems([], [])).toEqual([]);
  });
});
