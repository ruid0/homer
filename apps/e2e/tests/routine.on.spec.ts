import { expect, test } from "@playwright/test";
import { seedPerson } from "./scratch";

test("tapping today's cell counts up to the target and shows it", async ({ page, request }) => {
  const id = await seedPerson(request);
  await page.goto(`/people/${id}/routine`);
  const saves: string[] = [];
  page.on("response", (response) => {
    if (response.url().includes("routines.setCount") && response.request().method() === "POST") saves.push(response.url());
  });
  // Future days are not buttons, so the last matching button is today.
  const today = page.getByRole("button", { name: /^0 of 2: Row A/ }).last();
  await today.click();
  await expect(page.getByRole("button", { name: /^1 of 2: Row A/ })).toHaveCount(1);
  await page.getByRole("button", { name: /^1 of 2: Row A/ }).click();
  await expect(page.getByRole("button", { name: /^2 of 2: Row A/ })).toHaveCount(1);
  await expect.poll(() => saves.length).toBe(2);
  await page.reload();
  await expect(page.getByRole("button", { name: /^2 of 2: Row A/ })).toHaveCount(1);
});
