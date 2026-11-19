import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("index.css", () => {
  it("closes every brace it opens", () => {
    const css = readFileSync(new URL("./index.css", import.meta.url), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
    const opened = css.split("{").length - 1;
    const closed = css.split("}").length - 1;
    expect(closed).toBe(opened);
  });
});
