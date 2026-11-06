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
  const every = await page.getByLabel("Every").boundingBox();
  const unit = await page.getByLabel("Unit").boundingBox();
  expect(every?.height).toBe(unit?.height);
  expect(every?.y).toBe(unit?.y);
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
