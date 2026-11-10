import { expect, test } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { seedEvent, seedPerson, todayUtc } from "./scratch";

test.use({ viewport: { width: 390, height: 844 } });

test("on a phone, every field in the add-task dialog stays inside the dialog", async ({ page }) => {
  await page.goto("/schedule");
  await page.getByRole("button", { name: "Add task" }).click();
  const dialog = page.getByRole("dialog");
  const edge = (await dialog.boundingBox())?.width ?? 0;
  for (const field of await dialog.locator("input, select").all()) {
    const box = await field.boundingBox();
    expect((box?.x ?? 0) + (box?.width ?? 0)).toBeLessThanOrEqual(edge + 1);
  }
});

test("on a phone, a number box and a dropdown side by side are the same height", async ({ page }) => {
  await page.goto("/upkeep");
  await page.getByRole("button", { name: "Add job" }).click();
  // The sheet slides up when it opens, so read both boxes only once they agree on where the row is.
  const box = async (label: string) => page.getByLabel(label).boundingBox();
  await expect.poll(async () => (await box("Every"))?.y === (await box("Unit"))?.y).toBe(true);
  expect((await box("Every"))?.height).toBe((await box("Unit"))?.height);
});

test("on a phone, an event's Edit sits at the right edge like a task's", async ({ page, request }) => {
  const tag = randomUUID().slice(0, 8);
  await seedEvent(request, { title: `Edge event ${tag}`, date: todayUtc(), time: "09:00" });
  await page.goto("/schedule");
  const edit = await page.getByRole("button", { name: `Edit Edge event ${tag}` }).boundingBox();
  const row = await page.getByRole("listitem").filter({ hasText: `Edge event ${tag}` }).boundingBox();
  expect((row?.x ?? 0) + (row?.width ?? 0) - ((edit?.x ?? 0) + (edit?.width ?? 0))).toBeLessThanOrEqual(8);
});

test("on a phone, the routine grid opens with today's column fully visible beside the row names", async ({ page, request }) => {
  const id = await seedPerson(request);
  await page.goto(`/people/${id}/routine`);
  const today = await page.locator('th[aria-current="date"]').boundingBox();
  const names = await page.locator("tbody th").first().boundingBox();
  expect(today?.x ?? 0).toBeGreaterThanOrEqual((names?.x ?? 0) + (names?.width ?? 0) - 1);
});

test("on a phone, with the keyboard up the sheet fits above it and the first field stays on screen", async ({ page }) => {
  // Chromium has no on-screen keyboard, so the visible area is faked the way iOS reports it.
  await page.addInitScript(() => {
    const fake = Object.assign(new EventTarget(), { height: 844, offsetTop: 0, width: 390, offsetLeft: 0, scale: 1 });
    Object.defineProperty(window, "visualViewport", { value: fake, configurable: true });
    (window as unknown as { fakeKeyboard: (height: number) => void }).fakeKeyboard = (height) => {
      fake.height = height;
      fake.dispatchEvent(new Event("resize"));
    };
  });
  await page.goto("/upkeep");
  await page.getByRole("button", { name: "Add job" }).click();
  const dialog = page.getByRole("dialog");
  await page.evaluate(() => (window as unknown as { fakeKeyboard: (height: number) => void }).fakeKeyboard(400));
  // Wait out the slide-in, then measure.
  await expect.poll(async () => ((await dialog.boundingBox())?.y ?? 9999)).toBeLessThanOrEqual(8);
  const box = await dialog.boundingBox();
  expect((box?.y ?? 0) + (box?.height ?? 9999)).toBeLessThanOrEqual(400);
  await expect(page.getByLabel("Name")).toBeInViewport();
  await page.evaluate(() => (window as unknown as { fakeKeyboard: (height: number) => void }).fakeKeyboard(844));
  expect((await dialog.boundingBox())?.height ?? 0).toBeGreaterThan(400);
});

// 375x667 is an iPhone SE; 375x568 is the same phone with Safari's toolbars showing.
for (const height of [667, 568]) {
  for (const ticked of [true, false]) {
    test(`on a ${height}px-tall phone, the add-job dialog fits without scrolling inside itself with 'Not done yet' ${ticked ? "ticked" : "unticked"}`, async ({ page }) => {
      await page.setViewportSize({ width: 375, height });
      await page.goto("/upkeep");
      await page.getByRole("button", { name: "Add job" }).click();
      const dialog = page.getByRole("dialog");
      // The worst case: a suggestion picked, so the form is full.
      await dialog.getByLabel("Start from a suggestion").selectOption("Furnace filter");
      if (!ticked) {
        await dialog.getByLabel("Not done yet").uncheck();
        await expect(dialog.getByLabel("Last done")).toBeVisible();
      }
      // One pixel of rounding is allowed; the overflow that was reported was 5px or more.
      expect(await dialog.evaluate((element) => element.scrollHeight - element.clientHeight)).toBeLessThanOrEqual(1);
      // The sheet slides up when it opens, so wait for it to settle before measuring where Save is.
      await expect
        .poll(async () => {
          const save = await dialog.getByRole("button", { name: "Save" }).boundingBox();
          return (save?.y ?? Infinity) + (save?.height ?? 0);
        })
        .toBeLessThanOrEqual(height);
    });
  }
}

test("the last done date only appears once 'Not done yet' is unticked", async ({ page }) => {
  await page.goto("/upkeep");
  await page.getByRole("button", { name: "Add job" }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByLabel("Not done yet")).toBeChecked();
  await expect(dialog.getByLabel("Last done")).toHaveCount(0);
  await dialog.getByLabel("Not done yet").uncheck();
  await expect(dialog.getByLabel("Last done")).toBeVisible();
  await expect(dialog.getByLabel("Last done")).toHaveValue(todayUtc());
  await dialog.getByLabel("Not done yet").check();
  await expect(dialog.getByLabel("Last done")).toHaveCount(0);
});
