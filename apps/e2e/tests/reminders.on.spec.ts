import { expect, test } from "@playwright/test";
import { seedPerson } from "./scratch";

test.describe("routine reminders with notifications on", () => {
  test("the pickers are visible but disabled until reminders are turned on for the person", async ({ page, request }) => {
    const id = await seedPerson(request);
    await page.goto(`/people/${id}/routine`);
    await page.getByRole("button", { name: "Edit Row A" }).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog.getByText("Turn on reminders for this person first")).toBeVisible();
    await expect(dialog.getByLabel("Hours")).toBeDisabled();
    await expect(dialog.getByRole("button", { name: "Add reminder" })).toBeDisabled();
  });

  test("turning reminders on shows the topic only while the card is open", async ({ page, request }) => {
    const id = await seedPerson(request);
    await page.goto(`/people/${id}/routine`);
    const card = page.getByRole("region", { name: "Reminders on this phone" });
    await card.getByRole("button", { name: "Turn on reminders" }).click();
    await expect(card.getByText(/^homer-[0-9a-f]{32}$/)).toBeVisible();
    await card.getByRole("button", { name: "Hide phone setup" }).click();
    await expect(card.getByText(/homer-[0-9a-f]{32}/)).toHaveCount(0);
    await expect(card.getByRole("button", { name: "Show phone setup" })).toBeVisible();
  });

  test("adds a wait and a daily time, adds with Enter, and removes one", async ({ page, request }) => {
    const id = await seedPerson(request);
    await page.goto(`/people/${id}/routine`);
    await page.getByRole("region", { name: "Reminders on this phone" }).getByRole("button", { name: "Turn on reminders" }).click();
    await page.getByRole("button", { name: "Edit Row A" }).click();
    const dialog = page.getByRole("dialog");

    await dialog.getByLabel("Minutes").selectOption("30");
    await dialog.getByRole("button", { name: "Add reminder" }).click();
    await expect(dialog.getByText(/^(Today|Tomorrow) at \d\d:\d\d$/)).toHaveCount(1);

    await dialog.getByRole("button", { name: "At a time" }).click();
    await dialog.getByRole("textbox", { name: "Time" }).fill("13:30");
    await dialog.getByLabel("Every day").check();
    await dialog.getByRole("textbox", { name: "Time" }).press("Enter");
    await expect(dialog).toBeVisible();
    await expect(dialog.getByText("Every day at 13:30")).toBeVisible();

    await dialog.getByRole("button", { name: "Remove the reminder: Every day at 13:30" }).click();
    await expect(dialog.getByText("Every day at 13:30")).toHaveCount(0);
  });

  test("asks for a time before adding an at-a-time reminder", async ({ page, request }) => {
    const id = await seedPerson(request);
    await page.goto(`/people/${id}/routine`);
    await page.getByRole("region", { name: "Reminders on this phone" }).getByRole("button", { name: "Turn on reminders" }).click();
    await page.getByRole("button", { name: "Edit Row A" }).click();
    const dialog = page.getByRole("dialog");
    await dialog.getByRole("button", { name: "At a time" }).click();
    await dialog.getByRole("button", { name: "Add reminder" }).click();
    await expect(dialog.getByRole("alert")).toHaveText("Pick a time.");
  });

  test("a wait of exactly 24 hours leaves no minutes to pick", async ({ page, request }) => {
    const id = await seedPerson(request);
    await page.goto(`/people/${id}/routine`);
    await page.getByRole("region", { name: "Reminders on this phone" }).getByRole("button", { name: "Turn on reminders" }).click();
    await page.getByRole("button", { name: "Edit Row A" }).click();
    const dialog = page.getByRole("dialog");
    await dialog.getByLabel("Hours").selectOption("24");
    await expect(dialog.getByLabel("Minutes")).toBeDisabled();
  });
});
