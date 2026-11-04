import { describe, expect, it } from "vitest";
import { timeOfDay } from "./clock";

describe("timeOfDay", () => {
  it("pads hours and minutes", () => {
    expect(timeOfDay(new Date(2026, 10, 3, 9, 5))).toBe("09:05");
  });

  it("uses the 24-hour clock", () => {
    expect(timeOfDay(new Date(2026, 10, 3, 18, 30))).toBe("18:30");
  });

  it("reads midnight as 00:00", () => {
    expect(timeOfDay(new Date(2026, 10, 3, 0, 0))).toBe("00:00");
  });
});
