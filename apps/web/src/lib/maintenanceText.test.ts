import { describe, expect, it } from "vitest";
import { collapsesLater, dueWords, laterNote, longDate, needsDoing, rowChips, shortDate } from "./maintenanceText";

const base = { lastDoneOn: "2026-11-01", dueOn: "2027-02-01" };

describe("dueWords", () => {
  it.each([
    [{ status: "overdue", daysUntil: -12 }, "12 days overdue"],
    [{ status: "overdue", daysUntil: -1 }, "1 day overdue"],
    [{ status: "due", daysUntil: 0 }, "Due today"],
    [{ status: "soon", daysUntil: 1 }, "Due tomorrow"],
    [{ status: "soon", daysUntil: 5 }, "Due in 5 days"],
    [{ status: "later", daysUntil: 60 }, "Due 1 Feb"],
    [{ status: "later", daysUntil: 61 }, "Due in 2 months"],
    [{ status: "later", daysUntil: 88 }, "Due in 3 months"],
    [{ status: "later", daysUntil: 330 }, "Due in 11 months"],
  ] as const)("%j reads %s", (when, words) => {
    expect(dueWords({ ...base, ...when })).toBe(words);
  });

  it("tells a due date a year or more away with its year, so it is not read as last year", () => {
    expect(dueWords({ lastDoneOn: "2026-11-05", dueOn: "2027-11-05", status: "later", daysUntil: 365 })).toBe("Due 5 Nov 2027");
  });

  it("says an item never done is not done yet, whatever its due date", () => {
    expect(dueWords({ lastDoneOn: null, dueOn: "2026-11-05", status: "due", daysUntil: 0 })).toBe("Not done yet");
    expect(dueWords({ lastDoneOn: null, dueOn: "2026-11-05", status: "overdue", daysUntil: -9 })).toBe("Not done yet");
  });
});

describe("rowChips", () => {
  it("names the cycle, singular or plural, and the last done date when there is one", () => {
    const when = { dueOn: "2027-02-10", daysUntil: 97 };
    expect(rowChips({ every: 3, unit: "months", lastDoneOn: "2026-11-10", ...when })).toEqual(["Every 3 months", "Last done 10 Nov"]);
    expect(rowChips({ every: 1, unit: "weeks", lastDoneOn: null, ...when })).toEqual(["Every week"]);
    expect(rowChips({ every: 1, unit: "years", lastDoneOn: null, ...when })).toEqual(["Every year"]);
  });

  it("adds the year to a last done date that is not in this year", () => {
    // Today is 2027-01-05 here (due date minus days until).
    const when = { dueOn: "2027-02-10", daysUntil: 36 };
    expect(rowChips({ every: 3, unit: "months", lastDoneOn: "2026-11-10", ...when })[1]).toBe("Last done 10 Nov 2026");
    expect(rowChips({ every: 3, unit: "months", lastDoneOn: "2027-01-02", ...when })[1]).toBe("Last done 2 Jan");
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

describe("the Later section", () => {
  it("stays open at 5 rows and collapses from 6", () => {
    expect([0, 1, 5].map(collapsesLater)).toEqual([false, false, false]);
    expect([6, 8, 20].map(collapsesLater)).toEqual([true, true, true]);
  });

  it("names the next job and when, so a closed Later still says what is coming", () => {
    expect(laterNote({ name: "Smoke alarm batteries", lastDoneOn: "2026-09-14", dueOn: "2027-03-14", status: "later", daysUntil: 125 })).toBe(
      "Next: Smoke alarm batteries, due in 4 months.",
    );
    expect(laterNote({ name: "Gutters", lastDoneOn: "2026-10-01", dueOn: "2026-12-20", status: "later", daysUntil: 41 })).toBe("Next: Gutters, due 20 Dec.");
  });
});
