import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { addSaidTime, timeInText } from "./timeWords";

describe("timeInText", () => {
  it.each([
    ["remind Ben at 18:00", "18:00"],
    ["dentist at 6pm", "18:00"],
    ["call at 6:30 pm", "18:30"],
    ["meeting 9:05", "09:05"],
    ["lunch at 12 pm", "12:00"],
    ["wake at 12am", "00:00"],
    ["on 2026-11-05", null],
    ["at 25:00", null],
    ["from 9:00 to 10:00", null],
    ["bought 3 milk", null],
    ["at 13pm", null],
  ])("reads %j as %j", (text, time) => {
    expect(timeInText(text)).toBe(time);
  });
});

describe("addSaidTime", () => {
  it("fills a time the model left out", () => {
    expect(addSaidTime("add_task", { title: "x", dueDate: "2026-11-05" }, "at 18:00")).toEqual({ title: "x", dueDate: "2026-11-05", dueTime: "18:00" });
    expect(addSaidTime("add_event", { title: "x", date: "2026-11-05", time: null }, "at 6pm")).toEqual({ title: "x", date: "2026-11-05", time: "18:00" });
  });

  it("keeps a time the model gave, and other tools alone", () => {
    expect(addSaidTime("add_task", { dueDate: "2026-11-05", dueTime: "17:00" }, "at 18:00")).toEqual({ dueDate: "2026-11-05", dueTime: "17:00" });
    expect(addSaidTime("mark_out", { name: "x" }, "at 18:00")).toEqual({ name: "x" });
  });
});

describe("timeInText edge cases", () => {
  it.each([
    ["from 9 to 10pm", null],
    ["9-10pm", null],
    ["between 5 and 6pm", null],
    ["at 6PM", "18:00"],
    ["at 6 : 30", null],
    ["at 6pm or 18:00", "18:00"],
    ["at 12:00 pm", "12:00"],
    ["at 12:30 am", "00:30"],
    ["at 0:30", "00:30"],
    ["on 2026-11-05 10:00", "10:00"],
    ["17:00 amsterdam", "17:00"],
    ["10:30 amazing", "10:30"],
    ["1.5pm", null],
    ["6.30pm", null],
  ])("reads %j as %j", (text, time) => {
    expect(timeInText(text)).toBe(time);
  });

  it("round-trips any 24-hour time and any 12-hour time with am or pm", () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 23 }), fc.integer({ min: 0, max: 59 }), (hour, minute) => {
        const text = `at ${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
        expect(timeInText(text)).toBe(text.slice(3));
      }),
    );
    fc.assert(
      fc.property(fc.integer({ min: 1, max: 12 }), fc.constantFrom("am", "pm"), (hour, meridiem) => {
        expect(timeInText(`at ${hour}${meridiem}`)).toMatch(/^([01]\d|2[0-3]):00$/);
      }),
    );
  });
});

describe("addSaidTime needs a day", () => {
  it("leaves an undated call alone", () => {
    expect(addSaidTime("add_task", { title: "x" }, "at 18:00")).toEqual({ title: "x" });
  });

  it("fills an event that has a date", () => {
    expect(addSaidTime("add_event", { title: "x", date: "2026-11-05" }, "at 18:00")).toEqual({ title: "x", date: "2026-11-05", time: "18:00" });
  });

  it("keeps a time of its own and tolerates odd args", () => {
    expect(addSaidTime("add_event", { date: "2026-11-05", time: "09:00" }, "at 18:00")).toEqual({ date: "2026-11-05", time: "09:00" });
    expect(addSaidTime("add_task", null, "at 18:00")).toBeNull();
    expect(addSaidTime("add_task", [1], "at 18:00")).toEqual([1]);
  });
});
