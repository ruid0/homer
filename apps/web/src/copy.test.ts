import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { findInlineText } from "./inlineText";

const root = join(import.meta.dirname, "../../..");
const copyFiles = ["copy.ts", "messages.ts", "inlineText.ts"];

const sourceFiles = (dir: string): string[] =>
  readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return sourceFiles(path);
    const isSource = /\.tsx?$/.test(entry.name) && !entry.name.includes(".test.");
    return isSource && !copyFiles.includes(entry.name) ? [path] : [];
  });

const folders = ["apps/web/src", "apps/api/src", "packages/shared/src"].map((folder) => join(root, folder));

describe("findInlineText", () => {
  it.each([
    ["<p>Hello</p>", true],
    ["<p>\n  Hello there\n</p>", true],
    ["<p>Hello {name}</p>", true],
    ["<p>{count} items left</p>", true],
    ['<input label="Name" />', true],
    ["<input aria-label='Name' />", true],
    ["<input aria-label={`Edit ${name}`} />", true],
    ['<p>{"Hi there"}</p>', true],
    ['window.confirm("Remove it?")', false],
    ['setError("Enter a quantity")', false],
    ['const unit = x ?? "Units"', false],
    ["throw new Error(`Name ${n} is taken`)", false],
  ])("flags %j", (source, isTsx) => {
    expect(findInlineText(source, isTsx).length).toBeGreaterThan(0);
  });

  it.each([
    "<p>{copy.items.empty}</p>",
    '<button className="flex gap-3">{copy.common.save}</button>',
    "const [a, setA] = useState<Item | null>(null);",
    'import { copy } from "../copy";',
    "const code = { code: \"NOT_FOUND\" };",
    "// Note: Hello there",
    "const sorted = items.map((item) => item.name);",
  ])("ignores %j", (source) => {
    expect(findInlineText(source, true)).toEqual([]);
  });
});

describe("user-facing text", () => {
  it.each(folders.flatMap(sourceFiles))("%s has no inline text", (file) => {
    expect(findInlineText(readFileSync(file, "utf8"), file.endsWith(".tsx"))).toEqual([]);
  });
});
