import { expect, test, type Page } from "@playwright/test";

// Run in Safari's engine with an iPhone profile (project "iphone-webkit"): this is where date and time fields pushed
// past the sheet.
const openAddEvent = async (page: Page) => {
  await page.goto("/schedule");
  await page.getByRole("button", { name: "Add event" }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  return dialog;
};

test("the date and time fields are as wide and as tall as the other fields, and inside the sheet", async ({ page }) => {
  const dialog = await openAddEvent(page);
  const name = (await dialog.getByLabel("What's happening").boundingBox())!;
  const sheet = (await dialog.boundingBox())!;
  for (const type of ["date", "time"]) {
    const box = (await dialog.locator(`input[type="${type}"]`).boundingBox())!;
    expect(box.x).toBeCloseTo(name.x, 0);
    expect(box.x + box.width).toBeCloseTo(name.x + name.width, 0);
    expect(box.x + box.width).toBeLessThanOrEqual(sheet.x + sheet.width);
    expect(box.height).toBeCloseTo(name.height, 0);
  }
});

test("no field takes focus on open, so the keyboard stays down", async ({ page }) => {
  await openAddEvent(page);
  expect(await page.evaluate(() => document.activeElement?.tagName)).toBe("H2");
});
