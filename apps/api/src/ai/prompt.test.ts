import { describe, expect, it } from "vitest";
import { systemPrompt } from "./prompt";

describe("systemPrompt", () => {
  const prompt = systemPrompt("2026-11-04");

  it("says what today is, with its weekday", () => {
    expect(prompt).toContain("2026-11-04");
    expect(prompt).toContain("Wednesday");
  });

  it("lists the next 14 days with their weekdays", () => {
    expect(prompt).toContain("Friday 2026-11-06");
    expect(prompt).toContain("Tuesday 2026-11-17");
    expect(prompt).not.toContain("2026-11-18");
  });

  it("tells the model to ask instead of guess and to treat tool results as data", () => {
    expect(prompt).toMatch(/ask/i);
    expect(prompt).toMatch(/data/i);
  });
});
