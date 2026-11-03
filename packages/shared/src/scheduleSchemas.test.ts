import { describe, expect, it } from "vitest";
import {
  completeTaskInputSchema,
  dateSchema,
  eventInputSchema,
  personInputSchema,
  scheduleViewInputSchema,
  taskInputSchema,
  timeSchema,
  updateTaskInputSchema,
} from "./schemas";

describe("dateSchema", () => {
  it.each(["2026-11-03", "2028-02-29", "2026-12-31"])("accepts %s", (value) => {
    expect(dateSchema.safeParse(value).success).toBe(true);
  });

  it.each(["2026-02-30", "2027-02-29", "2026-13-01", "2026-1-3", "03-11-2026", "tomorrow", ""])(
    "rejects %j",
    (value) => {
      expect(dateSchema.safeParse(value).success).toBe(false);
    },
  );
});

describe("timeSchema", () => {
  it.each(["00:00", "09:30", "23:59"])("accepts %s", (value) => {
    expect(timeSchema.safeParse(value).success).toBe(true);
  });

  it.each(["24:00", "9:30", "12:60", "noon", ""])("rejects %j", (value) => {
    expect(timeSchema.safeParse(value).success).toBe(false);
  });
});

describe("personInputSchema", () => {
  it("trims the name and rejects a blank one", () => {
    expect(personInputSchema.parse({ name: "  Sam " })).toEqual({ name: "Sam" });
    expect(personInputSchema.safeParse({ name: "   " }).success).toBe(false);
  });
});

describe("taskInputSchema", () => {
  it("needs only a title, and leaves the rest empty", () => {
    expect(taskInputSchema.parse({ title: " Call the plumber " })).toEqual({
      title: "Call the plumber",
      dueDate: null,
      dueTime: null,
      repeat: null,
      personId: null,
    });
  });

  it("accepts a date, time, repeat and person together", () => {
    const task = { title: "Bins", dueDate: "2026-11-02", dueTime: "07:30", repeat: "weekly", personId: 2 };
    expect(taskInputSchema.parse(task)).toEqual(task);
  });

  it("rejects a blank title", () => {
    expect(taskInputSchema.safeParse({ title: "  " }).success).toBe(false);
  });

  it("rejects a time or a repeat without a due date, and says which field to fix", () => {
    const withTime = taskInputSchema.safeParse({ title: "Bins", dueTime: "07:30" });
    const withRepeat = taskInputSchema.safeParse({ title: "Bins", repeat: "daily" });
    expect(withTime.success).toBe(false);
    expect(withRepeat.success).toBe(false);
    expect(withTime.error?.issues[0]?.path).toEqual(["dueDate"]);
  });

  it("rejects an unknown repeat and a bad date", () => {
    const base = { title: "Bins", dueDate: "2026-11-02" };
    expect(taskInputSchema.safeParse({ ...base, repeat: "yearly" }).success).toBe(false);
    expect(taskInputSchema.safeParse({ ...base, dueDate: "2026-02-30" }).success).toBe(false);
  });
});

describe("updateTaskInputSchema", () => {
  it("needs the id and applies the same rules", () => {
    expect(updateTaskInputSchema.safeParse({ title: "Bins" }).success).toBe(false);
    expect(updateTaskInputSchema.safeParse({ id: 1, title: "Bins", repeat: "daily" }).success).toBe(false);
    expect(updateTaskInputSchema.parse({ id: 1, title: "Bins" })).toMatchObject({ id: 1, dueDate: null });
  });
});

describe("eventInputSchema", () => {
  it("needs a title and a date, and the time is optional", () => {
    expect(eventInputSchema.parse({ title: "Dentist", date: "2026-11-10" })).toEqual({
      title: "Dentist",
      date: "2026-11-10",
      time: null,
    });
    expect(eventInputSchema.safeParse({ title: "Dentist" }).success).toBe(false);
    expect(eventInputSchema.parse({ title: "Dentist", date: "2026-11-10", time: "14:30" }).time).toBe("14:30");
  });
});

describe("completeTaskInputSchema", () => {
  it("needs the id and today's date", () => {
    expect(completeTaskInputSchema.parse({ id: 3, today: "2026-11-03" })).toEqual({ id: 3, today: "2026-11-03" });
    expect(completeTaskInputSchema.safeParse({ id: 3 }).success).toBe(false);
  });
});

describe("scheduleViewInputSchema", () => {
  it("accepts today, a number of days and an optional person", () => {
    expect(scheduleViewInputSchema.parse({ today: "2026-11-03", days: 7 })).toEqual({ today: "2026-11-03", days: 7 });
    expect(scheduleViewInputSchema.parse({ today: "2026-11-03", days: 1, personId: 2 }).personId).toBe(2);
  });

  it("limits days to 1 through 31", () => {
    const view = { today: "2026-11-03" };
    expect(scheduleViewInputSchema.safeParse({ ...view, days: 0 }).success).toBe(false);
    expect(scheduleViewInputSchema.safeParse({ ...view, days: 32 }).success).toBe(false);
    expect(scheduleViewInputSchema.safeParse({ ...view, days: 1.5 }).success).toBe(false);
    expect(scheduleViewInputSchema.safeParse({ ...view, days: 31 }).success).toBe(true);
  });
});
