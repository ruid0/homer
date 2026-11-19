import { describe, expect, it } from "vitest";
import { lastDoneOn } from "./lastDone";

describe("lastDoneOn", () => {
  it("is null when the job needs doing now", () => {
    expect(lastDoneOn("now", "2026-11-09", "2026-10-01")).toBeNull();
  });

  it("counts today, a week ago and a month ago from today", () => {
    expect(lastDoneOn("today", "2026-11-09", "")).toBe("2026-11-09");
    expect(lastDoneOn("week", "2026-11-09", "")).toBe("2026-11-02");
    expect(lastDoneOn("month", "2026-11-09", "")).toBe("2026-10-09");
  });

  it("clamps a month ago to the last day of a shorter month", () => {
    expect(lastDoneOn("month", "2026-03-31", "")).toBe("2026-02-28");
  });

  it("counts a month ago across a year boundary and from a leap-year March", () => {
    expect(lastDoneOn("month", "2026-01-01", "")).toBe("2025-12-01");
    expect(lastDoneOn("month", "2028-03-01", "")).toBe("2028-02-01");
    expect(lastDoneOn("month", "2028-03-31", "")).toBe("2028-02-29");
  });

  it("takes the picked date as given", () => {
    expect(lastDoneOn("date", "2026-11-09", "2026-09-15")).toBe("2026-09-15");
  });
});
