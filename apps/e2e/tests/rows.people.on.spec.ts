import { expect, test } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { call } from "./scratch";

const addPerson = async (request: Parameters<typeof call>[0]) => {
  const name = `Row ${randomUUID().slice(0, 8)}`;
  await call(request, "people.add", { name });
  return name;
};

test.use({ viewport: { width: 360, height: 800 } });

test.describe("a person's row", () => {
  test("Routine is the one button, level with the name at the right edge, and the row is short", async ({
    page,
    request,
  }) => {
    const names = [await addPerson(request), await addPerson(request)];
    await page.goto("/people");
    const rights = [];
    for (const name of names) {
      const row = page.getByRole("listitem").filter({ hasText: name });
      const title = (await row.getByText(name, { exact: true }).boundingBox())!;
      const routine = (await row.getByRole("link", { name: `${name}'s routine` }).boundingBox())!;
      const whole = (await row.boundingBox())!;
      expect(routine.y).toBeLessThan(title.y + title.height);
      expect(whole.height).toBeLessThanOrEqual(80);
      expect(routine.height).toBeGreaterThanOrEqual(44);
      rights.push(Math.round(routine.x + routine.width));
      await expect(row.getByRole("button", { name: /^Rename/ })).toHaveCount(1);
    }
    expect(new Set(rights).size).toBe(1);
  });

  test("tapping the name opens Rename for that person", async ({ page, request }) => {
    const name = await addPerson(request);
    await page.goto("/people");
    await page.getByRole("button", { name: `Rename ${name}` }).click();
    await expect(page.getByRole("dialog").getByLabel("Name")).toHaveValue(name);
  });

  test("Routine opens that person's routine", async ({ page, request }) => {
    const name = await addPerson(request);
    await page.goto("/people");
    await page.getByRole("link", { name: `${name}'s routine` }).click();
    await expect(page).toHaveURL(/\/people\/\d+\/routine$/);
  });
});
