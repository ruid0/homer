import { expect, test } from "@playwright/test";
import { failure, interceptCall } from "./intercept";

test("a failed Add is a red toast that does not move the page, and what was typed stays", async ({ page }) => {
  await interceptCall(page, "groceries.add", { answer: failure("Could not save. Try again.") });
  await page.goto("/groceries");
  await page.getByLabel("Add to the list").fill("Toast bread");
  await page.getByRole("button", { name: "Add", exact: true }).click();
  const toast = page.getByRole("alert").filter({ hasText: "Could not save. Try again." });
  await expect(toast).toBeVisible();
  expect(await toast.evaluate((element) => getComputedStyle(element).position)).toBe("fixed");
  await expect(page.getByLabel("Add to the list")).toHaveValue("Toast bread");
  await toast.getByRole("button", { name: "Dismiss" }).click();
  await expect(toast).toHaveCount(0);
});
