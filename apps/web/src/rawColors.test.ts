import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { findRawColors } from "./rawColors";

const sourceFiles = (dir: string): string[] =>
  readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return sourceFiles(path);
    const isSource = /\.tsx?$/.test(entry.name) && !entry.name.includes(".test.") && entry.name !== "rawColors.ts";
    return isSource ? [path] : [];
  });

describe("findRawColors", () => {
  it.each([
    'className="text-stone-600"',
    'className="dark:bg-stone-900"',
    'className="hover:bg-stone-100"',
    'className="dark:focus-visible:outline-stone-100"',
    'className="bg-white"',
    'className="text-red-700 dark:text-red-400"',
    'className="border-amber-400"',
    'className="border-t-red-500"',
    'className="border-x-stone-300"',
    'className="from-stone-100 to-stone-200"',
    'className="ring-offset-stone-100"',
    'className="inset-ring-stone-300"',
    'className="text-mauve-600"',
    'className="bg-[#fff]"',
    'className="text-[color:var(--x)]"',
    'className="border-[rgb(0,0,0)]"',
  ])("flags %j", (source) => {
    expect(findRawColors(source).length).toBeGreaterThan(0);
  });

  it.each([
    'className="text-muted"',
    'className="bg-card border-line"',
    'className="text-late hover:bg-hover"',
    'className="text-white-ish"',
    'className="min-h-11 rounded-lg px-4 text-base font-medium"',
    'className="text-warn dark:opacity-80"',
    'className="border-t border-line"',
    'className="w-[min(28rem,calc(100vw-2rem))]"',
    'className="text-[length:1rem]"',
  ])("leaves %j alone", (source) => {
    expect(findRawColors(source)).toEqual([]);
  });
});

describe("the app's source", () => {
  // Scans the .ts and .tsx files. index.css is where the palette is allowed, and index.html has no colours.
  it("uses colour tokens, never raw palette colours", () => {
    const found = sourceFiles(join(import.meta.dirname, ".")).flatMap((file) => {
      const colors = findRawColors(readFileSync(file, "utf8"));
      return colors.length > 0 ? [`${file}: ${colors.join(", ")}`] : [];
    });
    expect(found).toEqual([]);
  });
});
