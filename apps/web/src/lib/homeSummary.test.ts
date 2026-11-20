import { describe, expect, it } from "vitest";
import { homeSummary } from "./homeSummary";

describe("homeSummary", () => {
  it("lists what is left, in the order tasks, jobs, items", () => {
    expect(homeSummary({ tasks: 2, events: 1, jobs: 1, low: 3 })).toBe(
      "2 tasks left · 1 event to come · 1 job due · 3 running low",
    );
  });

  it("uses the singular for one", () => {
    expect(homeSummary({ tasks: 1, events: 1, jobs: 1, low: 1 })).toBe(
      "1 task left · 1 event to come · 1 job due · 1 running low",
    );
  });

  it("leaves out what is zero", () => {
    expect(homeSummary({ tasks: 0, events: 0, jobs: 2, low: 0 })).toBe("2 jobs due");
  });

  it("says so when there is nothing left", () => {
    expect(homeSummary({ tasks: 0, events: 0, jobs: 0, low: 0 })).toBe("Nothing left today.");
  });
});
