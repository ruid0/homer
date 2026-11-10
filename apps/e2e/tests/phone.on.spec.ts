import { expect, test, type Locator } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { daysAgo, seedEvent, seedPerson, seedUpkeep, todayUtc } from "./scratch";

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

test("on a phone, the stepper and the unit buttons share one row and are 44px tall", async ({ page }) => {
  await page.goto("/upkeep");
  await page.getByRole("button", { name: "Add job" }).click();
  const dialog = page.getByRole("dialog");
  // The sheet slides up when it opens, so read the boxes only once they agree on where the row is.
  const box = async (name: string) => dialog.getByRole("button", { name }).boundingBox();
  const unit = () => dialog.locator("label").filter({ hasText: /^months$/i }).boundingBox();
  await expect.poll(async () => (await box("One less"))?.y === (await unit())?.y).toBe(true);
  expect((await box("One less"))?.height).toBe(44);
  expect((await unit())?.height).toBe(44);
  const edge = (await dialog.boundingBox())?.width ?? 0;
  const years = await dialog.locator("label").filter({ hasText: /^years$/i }).boundingBox();
  expect((years?.x ?? 0) + (years?.width ?? 0)).toBeLessThanOrEqual(edge);
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
const saveBottom = (dialog: Locator) =>
  // The sheet slides up when it opens, so this settles once it stops moving.
  dialog.getByRole("button", { name: "Save" }).boundingBox().then((save) => (save?.y ?? Infinity) + (save?.height ?? 0));

for (const height of [667, 568]) {
  test(`on a ${height}px-tall phone, the add-job dialog fits without scrolling inside itself, and Save is on screen`, async ({ page }) => {
    await page.setViewportSize({ width: 375, height });
    await page.goto("/upkeep");
    await page.getByRole("button", { name: "Add job" }).click();
    const dialog = page.getByRole("dialog");
    // The worst case that stays short: a suggestion picked, so the form is full.
    await dialog.getByLabel("Start from a suggestion").selectOption("Furnace filter");
    // One pixel of rounding is allowed; the overflow that was reported was 5px or more.
    expect(await dialog.evaluate((element) => element.scrollHeight - element.clientHeight)).toBeLessThanOrEqual(1);
    await expect.poll(() => saveBottom(dialog)).toBeLessThanOrEqual(height);
  });

  test(`on a ${height}px-tall phone, with a date to pick Save stays on screen while the fields scroll`, async ({ page }) => {
    await page.setViewportSize({ width: 375, height });
    await page.goto("/upkeep");
    await page.getByRole("button", { name: "Add job" }).click();
    const dialog = page.getByRole("dialog");
    await dialog.getByLabel("Start from a suggestion").selectOption("Furnace filter");
    await dialog.getByLabel("Last done").selectOption("Pick a date…");
    await expect(dialog.getByLabel("Done on")).toBeVisible();
    await expect.poll(() => saveBottom(dialog)).toBeLessThanOrEqual(height);
    // However far the fields are scrolled, Save has not moved off the screen.
    await dialog.evaluate((element) => element.scrollTo({ top: 0 }));
    await expect.poll(() => saveBottom(dialog)).toBeLessThanOrEqual(height);
    await dialog.evaluate((element) => element.scrollTo({ top: element.scrollHeight }));
    await expect.poll(() => saveBottom(dialog)).toBeLessThanOrEqual(height);
  });

  test(`on a ${height}px-tall phone, with the done dates open Save stays on screen`, async ({ page, request }) => {
    await seedUpkeep(request, { name: `Sheet job ${height}`, every: 3, unit: "months", lastDoneOn: daysAgo(5) });
    await page.setViewportSize({ width: 375, height });
    await page.goto("/upkeep");
    await page.getByRole("button", { name: `Edit Sheet job ${height}` }).click();
    const dialog = page.getByRole("dialog");
    await dialog.getByRole("button", { name: /^Done on/ }).click();
    await expect(dialog.getByLabel("Mark done on")).toBeVisible();
    await expect.poll(() => saveBottom(dialog)).toBeLessThanOrEqual(height);
    await dialog.evaluate((element) => element.scrollTo({ top: element.scrollHeight }));
    await expect.poll(() => saveBottom(dialog)).toBeLessThanOrEqual(height);
    await expect(dialog.getByRole("button", { name: "Remove item" })).toBeInViewport();
  });
}

// 360 is the commonest Android width, 375 an iPhone SE or mini. Nothing may stick out past the dialog's side padding.
for (const width of [375, 360]) {
  test(`on a ${width}px-wide phone, the add and edit dialogs do not scroll sideways and every control stays inside the padding`, async ({ page, request }) => {
    await seedUpkeep(request, { name: `Wide job ${width}`, every: 3, unit: "months", lastDoneOn: daysAgo(5) });
    await page.setViewportSize({ width, height: 700 });
    await page.goto("/upkeep");
    for (const open of [() => page.getByRole("button", { name: "Add job" }).click(), () => page.getByRole("button", { name: `Edit Wide job ${width}` }).click()]) {
      await open();
      const dialog = page.getByRole("dialog");
      await expect.poll(async () => (await dialog.boundingBox())?.y ?? 9999).toBeLessThan(300);
      const dates = dialog.getByRole("button", { name: /^Done on/ });
      if ((await dates.count()) > 0) await dates.click();
      expect(await dialog.evaluate((element) => element.scrollWidth - element.clientWidth)).toBeLessThanOrEqual(0);
      const edge = (await dialog.boundingBox())?.width ?? 0;
      for (const control of await dialog.locator("input:not([type=radio]), select, label:has(input[type=radio]), button").all()) {
        const box = await control.boundingBox();
        if (!box) continue;
        // The sticky Save row spans the whole width on purpose; its buttons are inside the padding like the fields.
        expect(box.x + box.width).toBeLessThanOrEqual(edge - 19);
      }
      await page.keyboard.press("Escape");
    }
  });
}

test("the last done choices set the date, and the date field only shows for 'Pick a date…'", async ({ page }) => {
  await page.goto("/upkeep");
  await page.getByRole("button", { name: "Add job" }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByLabel("Last done")).toHaveValue("now");
  await expect(dialog.getByLabel("Done on")).toHaveCount(0);
  await dialog.getByLabel("Last done").selectOption("Pick a date…");
  await expect(dialog.getByLabel("Done on")).toHaveValue(todayUtc());
  await dialog.getByLabel("Last done").selectOption("A week ago");
  await expect(dialog.getByLabel("Done on")).toHaveCount(0);
});
