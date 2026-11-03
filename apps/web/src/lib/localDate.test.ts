import { describe, expect, it } from "vitest";
import { localDate } from "./localDate";

describe("localDate", () => {
  it("reads the local calendar day, not the UTC one", () => {
    expect(localDate(new Date(2026, 10, 3, 23, 59))).toBe("2026-11-03");
    expect(localDate(new Date(2026, 0, 5, 0, 1))).toBe("2026-01-05");
  });
});
