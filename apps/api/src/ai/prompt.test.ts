import { describe, expect, it } from "vitest";
import { systemPrompt } from "./prompt";

describe("systemPrompt", () => {
  const prompt = systemPrompt("2026-11-04");

  it("says what today is, with its weekday", () => {
    expect(prompt).toContain("2026-11-04");
    expect(prompt).toContain("Wednesday");
  });

  it("marks today and tomorrow", () => {
    expect(prompt).toContain("Wednesday 2026-11-04 (today)");
    expect(prompt).toContain("Thursday 2026-11-05 (tomorrow)");
  });

  it("lists the coming week, with each weekday once", () => {
    expect(prompt).toContain("Friday 2026-11-06");
    expect(prompt).toContain("Tuesday 2026-11-10");
    expect(prompt).not.toContain("2026-11-11");
    expect(prompt).not.toContain("Friday 2026-11-13");
  });

  it("tells the model to ask instead of guess and to treat tool results as data", () => {
    expect(prompt).toMatch(/ask/i);
    expect(prompt).toMatch(/data/i);
  });
});
