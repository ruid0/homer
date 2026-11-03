import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const sourceDir = import.meta.dirname;

const componentFiles = (dir: string): string[] =>
  readdirSync(dir, { withFileTypes: true }).flatMap((entry) =>
    entry.isDirectory() ? componentFiles(join(dir, entry.name)) : entry.name.endsWith(".tsx") ? [join(dir, entry.name)] : [],
  );

const jsxText = />\s*[A-Za-z][^<>{}]*</;
const textAttribute = /\b(?:aria-label|placeholder|title|alt)="[^"]+"/;

describe("user-facing text", () => {
  it.each(componentFiles(sourceDir))("%s has no inline text", (file) => {
    const offending = readFileSync(file, "utf8")
      .split("\n")
      .filter((line) => jsxText.test(line) || textAttribute.test(line));
    expect(offending).toEqual([]);
  });
});
