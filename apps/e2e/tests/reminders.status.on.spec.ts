import { expect, test, type Page } from "@playwright/test";
import { contrastOf } from "./contrast";
import { failure, gate, interceptCall } from "./intercept";
import { addRow, seedPerson, seedReminder } from "./scratch";

const turnOn = (page: Page) =>
  page
    .getByRole("region", { name: "Reminders on this phone" })
    .getByRole("button", { name: "Turn on reminders" })
    .click();

const status = (page: Page) => page.getByRole("status", { name: "Reminders" });

test.describe("the reminder status at the top of the routine page", () => {
  test("says off until reminders are turned on for the person, then on with none set", async ({ page, request }) => {
    const id = await seedPerson(request);
    await page.goto(`/people/${id}/routine`);
    await expect(status(page)).toContainText("Reminders: Off");
    await expect(status(page)).toContainText("in the box at the bottom of the page");
    await page
      .getByRole("region", { name: "Reminders on this phone" })
      .getByRole("button", { name: "Turn on reminders" })
      .click();
    await expect(status(page)).toContainText("Reminders: On");
    await expect(status(page)).toContainText("None set yet");
  });

  test("counts the reminders that are set", async ({ page, request }) => {
    const id = await seedPerson(request);
    await page.goto(`/people/${id}/routine`);
    await page
      .getByRole("region", { name: "Reminders on this phone" })
      .getByRole("button", { name: "Turn on reminders" })
      .click();
    await expect(status(page)).toContainText("Reminders: On");
    const second = await addRow(request, id, "Row B");
    await seedReminder(request, id, second.id, "in 2 hours");
    await page.reload();
    await expect(status(page)).toContainText("1 set.");
    await seedReminder(request, id, second.id, "in 3 hours");
    await page.reload();
    await expect(status(page)).toContainText("2 set.");
  });

  for (const scheme of ["light", "dark"] as const) {
    test(`the Off and On chips are readable in ${scheme} mode`, async ({ page, request }) => {
      const id = await seedPerson(request);
      await page.emulateMedia({ colorScheme: scheme });
      await page.goto(`/people/${id}/routine`);
      const off = status(page).getByText("Reminders: Off");
      await expect(off).toBeVisible();
      expect(await contrastOf(off)).toBeGreaterThanOrEqual(4.5);
      await turnOn(page);
      const on = status(page).getByText("Reminders: On");
      await expect(on).toBeVisible();
      expect(await contrastOf(on)).toBeGreaterThanOrEqual(4.5);
    });
  }
});

test.describe("the wait pickers in the row dialog", () => {
  test("start blank, and adding with nothing picked asks for a wait instead of using a default", async ({
    page,
    request,
  }) => {
    const id = await seedPerson(request);
    await page.goto(`/people/${id}/routine`);
    await page
      .getByRole("region", { name: "Reminders on this phone" })
      .getByRole("button", { name: "Turn on reminders" })
      .click();
    await page.getByRole("button", { name: "Edit Row A" }).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog.getByLabel("Hours")).toHaveValue("");
    await expect(dialog.getByLabel("Minutes")).toHaveValue("");
    await dialog.getByRole("button", { name: "Add reminder" }).click();
    await expect(dialog.getByRole("alert")).toHaveText("Pick how long to wait, in hours or minutes.");
    await expect(dialog.getByText("No reminders on this row.")).toBeVisible();
  });

  test("minutes alone make a wait, and hours alone too", async ({ page, request }) => {
    const id = await seedPerson(request);
    await page.goto(`/people/${id}/routine`);
    await page
      .getByRole("region", { name: "Reminders on this phone" })
      .getByRole("button", { name: "Turn on reminders" })
      .click();
    await page.getByRole("button", { name: "Edit Row A" }).click();
    const dialog = page.getByRole("dialog");
    await dialog.getByLabel("Minutes").selectOption("30");
    await dialog.getByRole("button", { name: "Add reminder" }).click();
    await expect(dialog.getByText(/^(Today|Tomorrow) at \d\d:\d\d$/)).toHaveCount(1);
    await dialog.getByLabel("Minutes").selectOption("");
    await dialog.getByLabel("Hours").selectOption("2");
    await dialog.getByRole("button", { name: "Add reminder" }).click();
    await expect(dialog.getByText(/^(Today|Tomorrow) at \d\d:\d\d$/)).toHaveCount(2);
  });

  test("0 minutes alone is refused, and 24 hours fixes the minutes at 0 and adds", async ({ page, request }) => {
    const id = await seedPerson(request);
    await page.goto(`/people/${id}/routine`);
    await turnOn(page);
    await page.getByRole("button", { name: "Edit Row A" }).click();
    const dialog = page.getByRole("dialog");
    await dialog.getByLabel("Minutes").selectOption("0");
    await dialog.getByRole("button", { name: "Add reminder" }).click();
    await expect(dialog.getByRole("alert")).toHaveText(/at least 1 minute/);
    await dialog.getByLabel("Minutes").selectOption("5");
    await expect(dialog.getByRole("alert")).toHaveCount(0);
    await dialog.getByLabel("Hours").selectOption("24");
    await expect(dialog.getByLabel("Minutes")).toBeDisabled();
    await expect(dialog.getByLabel("Minutes")).toHaveValue("0");
    await dialog.getByRole("button", { name: "Add reminder" }).click();
    await expect(dialog.getByText(/^(Today|Tomorrow) at \d\d:\d\d$/)).toHaveCount(1);
  });
});

test.describe("the status while things load or fail", () => {
  test.describe.configure({ timeout: 60_000 });

  test("says nothing while the notifications check is loading or has failed", async ({ page, request }) => {
    const id = await seedPerson(request);
    const held = gate();
    await interceptCall(page, "people.notificationsOn", { when: held.when });
    try {
      await page.goto(`/people/${id}/routine`);
      await expect(page.getByRole("heading", { name: /'s routine$/ })).toBeVisible();
      await expect(status(page)).toHaveCount(0);
    } finally {
      held.release();
    }
    await expect(status(page)).toContainText("Reminders: Off");

    const failed = await seedPerson(request);
    await page.unrouteAll();
    await interceptCall(page, "people.notificationsOn", { answer: failure("down") });
    await page.goto(`/people/${failed}/routine`);
    await expect(page.getByRole("alert").filter({ hasText: "Couldn't check whether" })).toBeVisible({
      timeout: 20_000,
    });
    await expect(status(page)).toHaveCount(0);
  });

  test("does not say none are set while the reminders load, and says nothing false if they fail", async ({
    page,
    request,
  }) => {
    const id = await seedPerson(request);
    await page.goto(`/people/${id}/routine`);
    await turnOn(page);
    await expect(status(page)).toContainText("None set yet");

    const held = gate();
    await interceptCall(page, "routines.reminders", { when: held.when });
    try {
      await page.reload();
      await expect(page.getByRole("heading", { name: /'s routine$/ })).toBeVisible();
      await expect(page.getByText("None set yet")).toHaveCount(0);
    } finally {
      held.release();
    }
    await expect(status(page)).toContainText("None set yet");

    await page.unrouteAll();
    await interceptCall(page, "routines.reminders", { answer: failure("down") });
    await page.reload();
    await expect(page.getByRole("alert").filter({ hasText: "Couldn't load the reminders" })).toBeVisible({
      timeout: 20_000,
    });
    await expect(status(page)).toContainText("Reminders: On");
    await expect(status(page)).not.toContainText("None set yet");
  });
});

test.describe("on a phone", () => {
  test.use({ viewport: { width: 360, height: 740 } });

  test("a long name wraps the reason inside the screen", async ({ page, request }) => {
    const id = await seedPerson(request);
    await page.goto(`/people/${id}/routine`);
    await expect(status(page)).toContainText("Turn them on for");
    const box = (await status(page).boundingBox())!;
    expect(box.x + box.width).toBeLessThanOrEqual(360);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  });
});

test.describe("the reminder on a row", () => {
  for (const scheme of ["light", "dark"] as const) {
    test(`says "Reminder" with its time, readable in ${scheme} mode, and only on the row that has one`, async ({
      page,
      request,
    }) => {
      const id = await seedPerson(request);
      const second = await addRow(request, id, "Row B");
      await seedReminder(request, id, second.id, "in 5 hours");
      await page.emulateMedia({ colorScheme: scheme });
      await page.goto(`/people/${id}/routine`);
      const chip = page
        .getByRole("listitem")
        .filter({ has: page.getByRole("button", { name: "Edit Row B" }) })
        .getByRole("list", { name: "Reminders" })
        .getByRole("listitem");
      await expect(chip).toHaveText(/^Reminder: (Today|Tomorrow) at \d\d:\d\d$/);
      expect(await contrastOf(chip)).toBeGreaterThanOrEqual(4.5);
      await expect(page.getByRole("list", { name: "Reminders" })).toHaveCount(1);
    });
  }
});
