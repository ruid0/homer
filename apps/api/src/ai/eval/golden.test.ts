import { describe, expect, it } from "vitest";
import { scriptedChat, say, useTool } from "../fakeChat";
import { evaluateCase, summarize } from "./evaluate";
import { goldenCases } from "./golden";

describe("the golden set", () => {
  it("has at least 20 cases with their own ids", () => {
    expect(goldenCases.length).toBeGreaterThanOrEqual(20);
    expect(new Set(goldenCases.map((golden) => golden.id)).size).toBe(goldenCases.length);
  });

  it("covers the acceptance prompts", () => {
    const prompts = goldenCases.map((golden) => golden.prompt);
    expect(prompts).toContain("We're out of salt");
    expect(prompts).toContain("Remind me to call the plumber Friday");
    expect(prompts).toContain("What do we need?");
  });

  it.each(goldenCases.map((golden) => [golden.id, golden] as const))("%s passes with the ideal answer", async (_id, golden) => {
    const result = await evaluateCase(golden, scriptedChat(golden.ideal));
    expect(result.reason).toBeNull();
    expect(result.passed).toBe(true);
  });

  it.each(goldenCases.filter((golden) => golden.needsAction).map((golden) => [golden.id, golden] as const))(
    "%s fails when the model does nothing",
    async (_id, golden) => {
      const result = await evaluateCase(golden, scriptedChat([say("Okay.")]));
      expect(result.passed).toBe(false);
    },
  );

  it.each(goldenCases.filter((golden) => !golden.needsAction && golden.id !== "chat").map((golden) => [golden.id, golden] as const))(
    "%s fails when the model changes something it should not",
    async (_id, golden) => {
      const wrong = scriptedChat([useTool("add_event", { title: "x", date: "2026-11-05" }), say("Done.")]);
      expect((await evaluateCase(golden, wrong)).passed).toBe(false);
    },
  );

  it("fails a case when the model errors", async () => {
    const result = await evaluateCase(goldenCases[0]!, scriptedChat([new Error("boom")]));
    expect(result).toMatchObject({ passed: false });
  });
});

describe("summarize", () => {
  it("gives the pass rate and the reply times", () => {
    const result = (ms: number, passed: boolean) => ({ id: "x", passed, reason: null, ms, reply: "", calls: [] });
    expect(summarize([result(100, true), result(300, true), result(200, false), result(900, true)])).toMatchObject({
      passed: 3,
      total: 4,
      rate: 0.75,
      medianMs: 250,
    });
  });
});
