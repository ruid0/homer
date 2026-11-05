import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const web = join(import.meta.dirname, "..");
const publicFile = (path: string) => join(web, "public", path);
const manifest = JSON.parse(readFileSync(publicFile("manifest.webmanifest"), "utf8")) as {
  display: string;
  start_url: string;
  icons: { src: string; sizes: string; purpose: string }[];
};
const page = readFileSync(join(web, "index.html"), "utf8");

describe("installable app", () => {
  it("opens like an app, from the home page", () => {
    expect(manifest.display).toBe("standalone");
    expect(manifest.start_url).toBe("/");
  });

  it("has the icon sizes phones and tablets ask for, including a maskable one", () => {
    const sizes = manifest.icons.map(({ sizes: size }) => size);
    expect(sizes).toEqual(expect.arrayContaining(["192x192", "512x512"]));
    expect(manifest.icons.some(({ purpose }) => purpose === "maskable")).toBe(true);
  });

  it("points only at files that exist", () => {
    for (const { src } of manifest.icons) expect(existsSync(publicFile(src)), src).toBe(true);
    const linked = [...page.matchAll(/href="\/([^"/]+\.(?:webmanifest|png|svg))"/g)].map((match) => match[1]!);
    expect(linked).toEqual(expect.arrayContaining(["manifest.webmanifest", "apple-touch-icon.png"]));
    for (const file of linked) expect(existsSync(publicFile(file)), file).toBe(true);
  });

  it("has icons whose real size matches what the manifest says", () => {
    // A PNG stores its width and height as two 32-bit numbers at byte 16.
    const sizeOf = (file: string) => {
      const bytes = readFileSync(publicFile(file));
      return `${bytes.readUInt32BE(16)}x${bytes.readUInt32BE(20)}`;
    };
    for (const { src, sizes } of manifest.icons) expect(sizeOf(src), src).toBe(sizes);
    expect(sizeOf("apple-touch-icon.png")).toBe("180x180");
  });

  it("sets the bar color for light and dark", () => {
    expect(page).toContain('media="(prefers-color-scheme: light)"');
    expect(page).toContain('media="(prefers-color-scheme: dark)"');
  });
});
