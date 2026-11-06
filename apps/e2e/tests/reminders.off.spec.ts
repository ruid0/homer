import { expect, test } from "@playwright/test";
import { seedPerson } from "./scratch";

test.describe("routine reminders with notifications off", () => {
  // The "off" copy runs with an empty NTFY_HOUSEHOLD_TOPIC (see playwright.config.ts).
  test("the card says notifications are off and offers nothing to press", async ({ page, request }) => {
    const id = await seedPerson(request);
    await page.goto(`/people/${id}/routine`);
    const card = page.getByRole("region", { name: "Reminders on this phone" });
    await expect(card.getByText(/Notifications are off for this household/)).toBeVisible();
    await expect(card.getByRole("button")).toHaveCount(0);
  });

  test("the row dialog says so, shows the pickers disabled, and has no way to turn reminders on", async ({ page, request }) => {
    const id = await seedPerson(request);
    await page.goto(`/people/${id}/routine`);
    await page.getByRole("button", { name: "Edit Row A" }).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog.getByText(/^Notifications are off, so reminders can't be sent yet/)).toBeVisible();
    await expect(dialog.getByLabel("Hours")).toBeDisabled();
    await expect(dialog.getByRole("button", { name: "Add reminder" })).toBeDisabled();
    await expect(dialog.getByRole("button", { name: "Turn on reminders" })).toHaveCount(0);
    await dialog.getByRole("button", { name: "At a time" }).click();
    await expect(dialog.getByRole("textbox", { name: "Time" })).toBeDisabled();
    await expect(dialog.getByLabel("Every day")).toBeDisabled();
  });
});
