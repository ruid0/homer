import { describe, expect, it } from "vitest";
import { dayHeading } from "./dayHeading";

describe("dayHeading", () => {
  it.each([
    ["2026-11-03", "Today, Tuesday 3 Nov"],
    ["2026-11-04", "Tomorrow, Wednesday 4 Nov"],
    ["2026-11-08", "Sunday 8 Nov"],
    ["2026-12-31", "Thursday 31 Dec"],
  ])("%s reads %s when today is 2026-11-03", (date, text) => {
    expect(dayHeading(date, "2026-11-03")).toBe(text);
  });

  it("names tomorrow across a month end", () => {
    expect(dayHeading("2026-12-01", "2026-11-30")).toBe("Tomorrow, Tuesday 1 Dec");
  });
});
