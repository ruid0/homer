import { expect, test } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { failure, interceptCall } from "./intercept";
import { seedListEntry } from "./scratch";

test("a failed Add is a red toast that does not move the page, and what was typed stays", async ({ page }) => {
  await interceptCall(page, "groceries.add", { answer: failure("Could not save. Try again.") });
  await page.goto("/stock");
  await page.getByLabel("Add to the list").fill("Toast bread");
  await page.getByRole("button", { name: "Add", exact: true }).click();
  const toast = page.getByRole("alert").filter({ hasText: "Could not save. Try again." });
  await expect(toast).toBeVisible();
  expect(await toast.evaluate((element) => getComputedStyle(element).position)).toBe("fixed");
  await expect(page.getByLabel("Add to the list")).toHaveValue("Toast bread");
  await toast.getByRole("button", { name: "Dismiss" }).click();
  await expect(toast).toHaveCount(0);
});

test.describe("a To buy row", () => {
  test("keeps the remove mark and Bought it on the title's line, in one right-hand column", async ({
    page,
    request,
  }) => {
    const names = [`Buy ${randomUUID().slice(0, 8)}`, `Buy ${randomUUID().slice(0, 8)}`];
    for (const name of names) await seedListEntry(request, name);
    await page.setViewportSize({ width: 360, height: 800 });
    await page.goto("/stock");
    const rights = [];
    for (const name of names) {
      const row = page.getByRole("listitem").filter({ hasText: name });
      const title = (await row.getByText(name, { exact: true }).boundingBox())!;
      const bought = (await row.getByRole("button", { name: `Bought it: ${name}` }).boundingBox())!;
      const remove = (await row.getByRole("button", { name: `Remove ${name} from the list` }).boundingBox())!;
      expect(bought.y).toBeLessThan(title.y + title.height);
      expect(remove.y).toBeLessThan(title.y + title.height);
      expect(remove.x + remove.width).toBeLessThanOrEqual(bought.x);
      expect(remove.width).toBeGreaterThanOrEqual(44);
      rights.push(Math.round(bought.x + bought.width));
    }
    expect(new Set(rights).size).toBe(1);
  });

  test("the remove mark removes the entry", async ({ page, request }) => {
    const name = `Gone ${randomUUID().slice(0, 8)}`;
    await seedListEntry(request, name);
    await page.goto("/stock");
    await page.getByRole("button", { name: `Remove ${name} from the list` }).click();
    await expect(page.getByRole("listitem").filter({ hasText: name })).toHaveCount(0);
  });
});
