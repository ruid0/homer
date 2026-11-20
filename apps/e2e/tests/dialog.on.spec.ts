import { expect, test, type Page } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { seedItem } from "./scratch";

const newItem = async (request: Parameters<typeof seedItem>[0]) => {
  const name = `Click out ${randomUUID().slice(0, 8)}`;
  await seedItem(request, name);
  return name;
};

const openEdit = async (page: Page, name: string) => {
  await page.goto("/items");
  await page.getByRole("button", { name: `Edit ${name}` }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  return dialog;
};

// The dimmed page behind a dialog: the top left corner of the window is always outside it.
const OUTSIDE = { x: 4, y: 4 };

test.describe("clicking outside a dialog", () => {
  test("closes it, and focus goes back to the button that opened it", async ({ page, request }) => {
    const name = await newItem(request);
    const dialog = await openEdit(page, name);
    await page.mouse.click(OUTSIDE.x, OUTSIDE.y);
    await expect(dialog).toHaveCount(0);
    await expect(page.getByRole("button", { name: `Edit ${name}` })).toBeFocused();
  });

  test("closes the Add item dialog too", async ({ page }) => {
    await page.goto("/items");
    await page.getByRole("button", { name: "Add item" }).first().click();
    await expect(page.getByRole("dialog")).toBeVisible();
    await page.mouse.click(OUTSIDE.x, OUTSIDE.y);
    await expect(page.getByRole("dialog")).toHaveCount(0);
  });

  test("does not close it when the click is on the dialog: its title, a field or its own padding", async ({
    page,
    request,
  }) => {
    const name = await newItem(request);
    const dialog = await openEdit(page, name);
    await dialog.getByRole("heading").click();
    await dialog.getByRole("textbox", { name: "Name" }).click();
    const box = await dialog.boundingBox();
    await page.mouse.click((box?.x ?? 0) + 12, (box?.y ?? 0) + 12);
    await expect(dialog).toBeVisible();
  });

  test("does not close it when a press starts inside and lets go outside, like selecting text in a field", async ({
    page,
    request,
  }) => {
    const name = await newItem(request);
    const dialog = await openEdit(page, name);
    const field = await dialog.getByRole("textbox", { name: "Name" }).boundingBox();
    await page.mouse.move((field?.x ?? 0) + 10, (field?.y ?? 0) + 10);
    await page.mouse.down();
    await page.mouse.move(OUTSIDE.x, OUTSIDE.y);
    await page.mouse.up();
    await expect(dialog).toBeVisible();
  });

  test("does not close it when a press starts outside and lets go inside", async ({ page, request }) => {
    const name = await newItem(request);
    const dialog = await openEdit(page, name);
    const title = await dialog.getByRole("heading").boundingBox();
    await page.mouse.move(OUTSIDE.x, OUTSIDE.y);
    await page.mouse.down();
    await page.mouse.move((title?.x ?? 0) + 10, (title?.y ?? 0) + 5);
    await page.mouse.up();
    await expect(dialog).toBeVisible();
  });

  test("throws away what was typed and saves nothing, the same as Cancel", async ({ page, request }) => {
    const name = await newItem(request);
    const dialog = await openEdit(page, name);
    await dialog.getByRole("textbox", { name: "Name" }).fill("Changed by mistake");
    await page.mouse.click(OUTSIDE.x, OUTSIDE.y);
    await expect(dialog).toHaveCount(0);
    await expect(page.getByText(name, { exact: true })).toBeVisible();
    await expect(page.getByText("Changed by mistake")).toHaveCount(0);
  });

  test("Escape still closes it, and the dialog can be opened again after a click out", async ({ page, request }) => {
    const name = await newItem(request);
    const dialog = await openEdit(page, name);
    await page.mouse.click(OUTSIDE.x, OUTSIDE.y);
    await expect(dialog).toHaveCount(0);
    await page.getByRole("button", { name: `Edit ${name}` }).click();
    await expect(page.getByRole("dialog")).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog")).toHaveCount(0);
  });

  test.describe("on a phone", () => {
    test.use({ viewport: { width: 375, height: 667 }, hasTouch: true });

    test("a tap on the page above the sheet closes it, and a tap on the sheet does not", async ({ page, request }) => {
      const name = await newItem(request);
      const dialog = await openEdit(page, name);
      // The sheet slides up: measure where it ends up, not where it starts.
      await dialog.evaluate((element) => Promise.all(element.getAnimations().map((animation) => animation.finished)));
      const box = await dialog.boundingBox();
      const top = box?.y ?? 0;
      expect(top).toBeGreaterThan(20);
      await dialog.getByRole("heading").tap();
      await expect(dialog).toBeVisible();
      await page.touchscreen.tap(187, top + 12);
      await expect(dialog).toBeVisible();
      await page.touchscreen.tap(187, top / 2);
      await expect(dialog).toHaveCount(0);
    });
  });
});
