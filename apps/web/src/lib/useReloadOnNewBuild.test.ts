import { describe, expect, it } from "vitest";
import { buildOf } from "./useReloadOnNewBuild";

describe("buildOf", () => {
  it("is the same for the same scripts in any order", () => {
    expect(buildOf(["/assets/a-1.js", "/assets/b-2.js"])).toBe(buildOf(["/assets/b-2.js", "/assets/a-1.js"]));
  });

  it("changes when a script file name changes", () => {
    expect(buildOf(["/assets/index-1.js"])).not.toBe(buildOf(["/assets/index-2.js"]));
  });

  it("leaves out the dev tools' own scripts", () => {
    expect(buildOf(["/@vite/client", "/src/main.tsx"])).toBe(buildOf(["/src/main.tsx"]));
  });

  it("is empty when there are no scripts", () => {
    expect(buildOf([])).toBe("");
  });
});
