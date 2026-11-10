import { describe, expect, it } from "vitest";
import { systemPrompt } from "./prompt";

describe("systemPrompt", () => {
  const prompt = systemPrompt("2026-11-04");

  it("says what today is, with its weekday", () => {
    expect(prompt).toContain("2026-11-04");
    expect(prompt).toContain("Wednesday");
  });

  it("tells the model to say the day in words and not to count", () => {
    expect(prompt).toContain("tomorrow");
    expect(prompt).toMatch(/weekday name/);
    expect(prompt).not.toContain("2026-11-06");
  });

  it("tells the model to ask instead of guess and to treat tool results as data", () => {
    expect(prompt).toMatch(/ask/i);
    expect(prompt).toMatch(/data/i);
  });
});
