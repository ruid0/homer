import { describe, expect, it } from "vitest";
import { dueWords, longDate, needsDoing, rowDetails, shortDate } from "./maintenanceText";

const base = { lastDoneOn: "2026-11-01", dueOn: "2027-02-01" };

describe("dueWords", () => {
  it.each([
    [{ status: "overdue", daysUntil: -12 }, "12 days overdue"],
    [{ status: "overdue", daysUntil: -1 }, "1 day overdue"],
    [{ status: "due", daysUntil: 0 }, "Due today"],
    [{ status: "soon", daysUntil: 1 }, "Due tomorrow"],
    [{ status: "soon", daysUntil: 5 }, "Due in 5 days"],
    [{ status: "later", daysUntil: 88 }, "Due 1 Feb"],
  ] as const)("%j reads %s", (when, words) => {
    expect(dueWords({ ...base, ...when })).toBe(words);
  });

  it("says an item never done is not done yet, whatever its due date", () => {
    expect(dueWords({ lastDoneOn: null, dueOn: "2026-11-05", status: "due", daysUntil: 0 })).toBe("Not done yet");
    expect(dueWords({ lastDoneOn: null, dueOn: "2026-11-05", status: "overdue", daysUntil: -9 })).toBe("Not done yet");
  });
});

describe("rowDetails", () => {
  it("names the cycle, singular or plural, and the last done date when there is one", () => {
    expect(rowDetails({ every: 3, unit: "months", lastDoneOn: "2026-11-10" })).toEqual(["Every 3 months", "last done 10 Nov"]);
    expect(rowDetails({ every: 1, unit: "weeks", lastDoneOn: null })).toEqual(["Every week"]);
    expect(rowDetails({ every: 1, unit: "years", lastDoneOn: null })).toEqual(["Every year"]);
  });
});

describe("dates and sections", () => {
  it("formats a date the way people say it, with no time zone shift", () => {
    expect(shortDate("2026-11-10")).toBe("10 Nov");
    expect(longDate("2026-11-10")).toBe("10 Nov 2026");
  });

  it("needs doing unless it is later", () => {
    expect(["overdue", "due", "soon"].every((status) => needsDoing(status as "soon"))).toBe(true);
    expect(needsDoing("later")).toBe(false);
  });
});
