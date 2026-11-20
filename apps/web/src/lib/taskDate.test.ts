import { describe, expect, it } from "vitest";
import { dueDateFor } from "./taskDate";

const today = "2026-11-19";

describe("dueDateFor", () => {
  it("keeps a date that was typed", () => {
    expect(dueDateFor("2026-12-01", "08:00", "daily", today)).toBe("2026-12-01");
  });

  it("is today when the date is blank but there is a time", () => {
    expect(dueDateFor("", "08:00", "", today)).toBe(today);
  });

  it("is today when the date is blank but there is a repeat", () => {
    expect(dueDateFor("", "", "daily", today)).toBe(today);
  });

  it("is anytime when there is no date, time or repeat", () => {
    expect(dueDateFor("", "", "", today)).toBeNull();
  });
});
