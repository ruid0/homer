import { expect, test, type Page } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { seedItem, seedPerson } from "./scratch";

const newItem = async (request: Parameters<typeof seedItem>[0]) => {
  const name = `Sheet ${randomUUID().slice(0, 8)}`;
  await seedItem(request, name);
  return name;
};

const openEdit = async (page: Page, name: string) => {
  await page.goto("/items");
  await page.getByRole("button", { name: `Edit ${name}` }).click();
  return page.getByRole("dialog");
};

const inView = async (page: Page, box: { x: number; y: number; width: number; height: number } | null) => {
  const size = page.viewportSize();
  expect(box).not.toBeNull();
  expect(box!.y).toBeGreaterThanOrEqual(0);
  expect(box!.y + box!.height).toBeLessThanOrEqual(size!.height);
};

test.describe("the page behind a dialog", () => {
  test("does not scroll while a dialog is open, and is where it was after it closes", async ({ page, request }) => {
    const name = await newItem(request);
    await page.goto("/items");
    await page.evaluate(() => {
      document.body.style.minHeight = "3000px";
      window.scrollTo(0, 400);
    });
    await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(400);
    // A click through the page would scroll the button into view first, so the page is asked to click it where it is.
    await page.getByRole("button", { name: `Edit ${name}` }).evaluate((button) => (button as HTMLElement).click());
    await expect(page.getByRole("dialog")).toBeVisible();
    expect(await page.evaluate(() => getComputedStyle(document.body).position)).toBe("fixed");
    // The page is held where it was, not jumped to the top.
    expect(await page.evaluate(() => document.body.getBoundingClientRect().top)).toBe(-400);
    await page.mouse.move(5, 5);
    await page.mouse.wheel(0, 600);
    expect(await page.evaluate(() => document.body.getBoundingClientRect().top)).toBe(-400);
    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await expect.poll(() => page.evaluate(() => getComputedStyle(document.body).position)).toBe("static");
    await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(400);
  });
});

test.describe("on a mouse and keyboard screen", () => {
  test("the first field takes focus when the dialog opens", async ({ page, request }) => {
    const name = await newItem(request);
    const dialog = await openEdit(page, name);
    await expect(dialog.getByLabel("Name")).toBeFocused();
  });
});

test.describe("on a touch screen", () => {
  test.use({ viewport: { width: 375, height: 667 }, hasTouch: true, isMobile: true });

  test("no field takes focus on its own, so the keyboard stays down and the title is in view", async ({ page, request }) => {
    const name = await newItem(request);
    expect(await page.evaluate(() => matchMedia("(pointer: coarse)").matches)).toBe(true);
    const dialog = await openEdit(page, name);
    await expect(dialog.getByRole("heading", { name: `Edit ${name}` })).toBeInViewport({ ratio: 1 });
    // The title has focus (so a screen reader reads it), and no field does.
    expect(await page.evaluate(() => document.activeElement?.tagName)).toBe("H2");
    await expect(dialog.getByLabel("Name")).toBeInViewport({ ratio: 1 });
  });

  test("a tap on a field still focuses it", async ({ page, request }) => {
    const name = await newItem(request);
    const dialog = await openEdit(page, name);
    await dialog.getByLabel("Name").tap();
    await expect(dialog.getByLabel("Name")).toBeFocused();
  });

  test("with only 360px of height (the keyboard up), the title, the first field and Save are all on screen", async ({ page, request }) => {
    const name = await newItem(request);
    await page.setViewportSize({ width: 375, height: 360 });
    // Measured at rest, not while the sheet is still sliding in.
    await page.emulateMedia({ reducedMotion: "reduce" });
    const dialog = await openEdit(page, name);
    await expect(dialog.getByRole("heading", { name: `Edit ${name}` })).toBeInViewport({ ratio: 1 });
    await expect(dialog.getByLabel("Name")).toBeInViewport({ ratio: 1 });
    await expect(dialog.getByRole("button", { name: "Save" })).toBeInViewport({ ratio: 1 });
    expect(await dialog.evaluate((element) => element.scrollTop)).toBe(0);
    await inView(page, await dialog.boundingBox());
  });

  for (const [label, path, opener, title] of [
    ["Add item", "/items", "Add item", "Add item"],
    ["Add task", "/schedule", "Add task", "Add task"],
  ] as const) {
    test(`${label} at 360px high shows its title, first field and Save without scrolling`, async ({ page }) => {
      await page.setViewportSize({ width: 375, height: 360 });
      await page.emulateMedia({ reducedMotion: "reduce" });
      await page.goto(path);
      await page.getByRole("button", { name: opener }).first().click();
      const dialog = page.getByRole("dialog");
      await expect(dialog.getByRole("heading", { name: title })).toBeInViewport({ ratio: 1 });
      await expect(dialog.getByRole("textbox").first()).toBeInViewport({ ratio: 1 });
      await expect(dialog.getByRole("button", { name: "Save" })).toBeInViewport({ ratio: 1 });
      expect(await dialog.evaluate((element) => element.scrollTop)).toBe(0);
    });
  }

  // Rename person and Restock set autoFocus on their field in JSX, a different path from Edit item, so each is checked on its own.
  test("Add event, Restock and Rename person start on the title and keep Save in view at 360px high", async ({ page, request }) => {
    await page.setViewportSize({ width: 375, height: 360 });
    await page.emulateMedia({ reducedMotion: "reduce" });
    const item = await newItem(request);
    await seedPerson(request);
    const cases: [string, string, string, string][] = [
      ["/schedule", "Add event", "Add event", "Save"],
      ["/items", `Bought it: ${item}`, "", "Save"],
      ["/people", "Rename", "", "Save"],
    ];
    for (const [path, opener, title] of cases.map(([a, b, c]) => [a, b, c] as const)) {
      await page.goto(path);
      await page.getByRole("button", { name: opener }).first().click();
      const dialog = page.getByRole("dialog");
      await expect(dialog).toBeVisible();
      if (title) await expect(dialog.getByRole("heading", { name: title })).toBeInViewport({ ratio: 1 });
      expect(await page.evaluate(() => document.activeElement?.tagName)).toBe("H2");
      await expect(dialog.getByRole("button", { name: "Save" })).toBeInViewport({ ratio: 1 });
      await page.keyboard.press("Escape");
      await expect(dialog).toHaveCount(0);
    }
  });
});
