import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { resolveDateWord, resolveToolDates } from "./dateWords";
import { weekdayOf } from "./schedule";

const today = "2026-11-04"; // a Wednesday

describe("resolveDateWord", () => {
  it.each([
    ["today", "2026-11-04"],
    ["tomorrow", "2026-11-05"],
    ["Friday", "2026-11-06"],
    ["friday", "2026-11-06"],
    ["on Friday", "2026-11-06"],
    ["this friday", "2026-11-06"],
    ["  Monday ", "2026-11-09"],
    ["wednesday", "2026-11-11"],
    ["sun", "2026-11-08"],
    ["Tue", "2026-11-10"],
    ["tues", "2026-11-10"],
    ["thurs", "2026-11-05"],
    ["on this friday", "2026-11-06"],
    ["Friday.", "2026-11-06"],
    ["tomorrow,", "2026-11-05"],
  ])("turns %j into %s", (word, expected) => {
    expect(resolveDateWord(word, today)).toBe(expected);
  });

  it("leaves a real date alone", () => {
    expect(resolveDateWord("2026-12-25", today)).toBe("2026-12-25");
  });

  it.each(["next friday", "friday next week", "someday", "", "soon"])("leaves %j for the schema to reject", (word) => {
    expect(resolveDateWord(word, today)).toBe(word);
  });

  it("always lands 1 to 7 days ahead on the weekday named", () => {
    const names = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 6 }), fc.integer({ min: 0, max: 400 }), (weekday, offset) => {
        const from = new Date(Date.UTC(2026, 0, 1 + offset)).toISOString().slice(0, 10);
        const date = resolveDateWord(names[weekday]!, from);
        expect(weekdayOf(date)).toBe(weekday);
        const ahead = (Date.parse(date) - Date.parse(from)) / 86_400_000;
        expect(ahead).toBeGreaterThanOrEqual(1);
        expect(ahead).toBeLessThanOrEqual(7);
      }),
    );
  });
});

describe("resolveToolDates", () => {
  it("resolves the date fields and leaves the rest alone", () => {
    expect(resolveToolDates({ title: "Friday drinks", dueDate: "friday", dueTime: "18:00" }, today)).toEqual({
      title: "Friday drinks",
      dueDate: "2026-11-06",
      dueTime: "18:00",
    });
    expect(resolveToolDates({ title: "x", date: "tomorrow" }, today)).toEqual({ title: "x", date: "2026-11-05" });
    expect(resolveToolDates({ from: "today", to: "sunday" }, today)).toEqual({ from: "2026-11-04", to: "2026-11-08" });
  });

  it("reads arguments sent as a JSON string", () => {
    expect(resolveToolDates('{"title":"x","dueDate":"tomorrow"}', today)).toEqual({ title: "x", dueDate: "2026-11-05" });
  });

  it("passes through what it cannot read", () => {
    expect(resolveToolDates("{not json", today)).toBe("{not json");
    expect(resolveToolDates(null, today)).toBeNull();
    expect(resolveToolDates({ dueDate: null }, today)).toEqual({ dueDate: null });
  });
});
