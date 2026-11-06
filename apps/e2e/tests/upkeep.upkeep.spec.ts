import { expect, test, type Page } from "@playwright/test";
import { contrastOf } from "./contrast";
import { failure, gate, interceptCall } from "./intercept";
import { clearUpkeep, daysAgo, seedUpkeep, todayUtc } from "./scratch";

// A failing query is retried 3 times with growing waits (about 7 seconds) before the screen calls it failed.
const RETRIES = { timeout: 20_000 };

test.describe.configure({ mode: "serial", timeout: 60_000 });

test.beforeEach(async ({ request }) => {
  await clearUpkeep(request);
});

const row = (page: Page, name: string) => page.getByRole("listitem").filter({ has: page.getByText(name, { exact: true }) });

const weekly = (name: string, lastDoneDaysAgo: number | null) => ({
  name,
  every: 1,
  unit: "weeks" as const,
  lastDoneOn: lastDoneDaysAgo === null ? null : daysAgo(lastDoneDaysAgo),
});

test.describe("the list", () => {
  test("says nothing is here yet, and offers to add", async ({ page }) => {
    await page.goto("/upkeep");
    await expect(page.getByRole("heading", { name: "Upkeep" })).toBeVisible();
    await expect(page.getByText(/^Nothing here yet/)).toBeVisible();
    await expect(page.getByRole("button", { name: "Add job" })).toBeVisible();
  });

  test("shows a loading message, not the empty one, while the list loads", async ({ page, request }) => {
    await seedUpkeep(request, weekly("Held item", 1));
    const held = gate();
    await interceptCall(page, "maintenance.list", { when: held.when });
    try {
      await page.goto("/upkeep");
      await expect(page.getByRole("status")).toHaveText("Loading.");
      await expect(page.getByText(/^Nothing here yet/)).toHaveCount(0);
    } finally {
      held.release();
    }
    await expect(page.getByText("Held item", { exact: true })).toBeVisible();
  });

  test("says so when the list cannot be loaded, and shows no empty message", async ({ page }) => {
    await interceptCall(page, "maintenance.list", { answer: failure("down") });
    await page.goto("/upkeep");
    await expect(page.getByRole("alert")).toHaveText(/Couldn't load the list/, RETRIES);
    await expect(page.getByText(/^Nothing here yet/)).toHaveCount(0);
  });

  test("puts what needs doing first, in words, and the rest under Later", async ({ page, request }) => {
    await seedUpkeep(request, weekly("Overdue job", 20));
    await seedUpkeep(request, weekly("Today job", 7));
    await seedUpkeep(request, weekly("Tomorrow job", 6));
    await seedUpkeep(request, weekly("Soon job", 5));
    await seedUpkeep(request, weekly("Never job", null));
    await seedUpkeep(request, { name: "Far job", every: 6, unit: "months", lastDoneOn: daysAgo(10) });
    await page.goto("/upkeep");

    const needs = page.getByRole("region", { name: "Due now" });
    // Overdue first (oldest due date first), then the never-done one (due the day it was added, today), then by due date.
    const names = await needs.getByRole("listitem").locator("p.text-title").allTextContents();
    expect(names).toEqual(["Overdue job", "Never job", "Today job", "Tomorrow job", "Soon job"]);

    await expect(row(page, "Overdue job")).toContainText("13 days overdue");
    await expect(row(page, "Today job")).toContainText("Due today");
    await expect(row(page, "Tomorrow job")).toContainText("Due tomorrow");
    await expect(row(page, "Soon job")).toContainText("Due in 2 days");
    await expect(row(page, "Never job")).toContainText("Not done yet");
    await expect(row(page, "Far job")).toContainText(/^Far job\s*Due in \d+ months/);
    await expect(page.getByRole("region", { name: "Later" }).getByText("Far job", { exact: true })).toBeVisible();
    await expect(needs.getByText("Far job")).toHaveCount(0);
  });

  test("says nothing is due when everything is later", async ({ page, request }) => {
    await seedUpkeep(request, { name: "Far job", every: 6, unit: "months", lastDoneOn: daysAgo(10) });
    await page.goto("/upkeep");
    await expect(page.getByText("Nothing due this week.")).toBeVisible();
  });
});

test.describe("marking done", () => {
  test("moves the due date, offers Undo, and Undo puts it back", async ({ page, request }) => {
    await seedUpkeep(request, weekly("Overdue job", 20));
    await page.goto("/upkeep");
    await page.getByRole("button", { name: "Done: Overdue job" }).click();
    const toast = page.getByRole("status").filter({ hasText: "Overdue job marked done." });
    await expect(toast).toBeVisible();
    await expect(row(page, "Overdue job")).toContainText("Due in 7 days");
    await toast.getByRole("button", { name: "Undo" }).click();
    await expect(toast).toHaveCount(0);
    await expect(row(page, "Overdue job")).toContainText("13 days overdue");
    await page.reload();
    await expect(row(page, "Overdue job")).toContainText("13 days overdue");
  });

  test("a done survives a reload", async ({ page, request }) => {
    await seedUpkeep(request, weekly("Today job", 7));
    await page.goto("/upkeep");
    await page.getByRole("button", { name: "Done: Today job" }).click();
    await expect(row(page, "Today job")).toContainText("Due in 7 days");
    await page.reload();
    await expect(row(page, "Today job")).toContainText("Due in 7 days");
    await expect(row(page, "Today job")).toContainText("last done");
  });

  test("the Undo toast goes away after a few seconds, and a second done keeps its own Undo", async ({ page, request }) => {
    await seedUpkeep(request, weekly("Today job", 7));
    await page.clock.install({ time: new Date(`${todayUtc()}T12:00:00Z`) });
    await page.goto("/upkeep");
    const toast = page.getByRole("status").filter({ hasText: "Today job marked done." });
    await page.getByRole("button", { name: "Done: Today job" }).click();
    await expect(toast).toBeVisible();
    await page.clock.fastForward(3_000);
    // The toast's clock starts when the save comes back, so wait for it before moving time on.
    const saved = page.waitForResponse((response) => response.url().includes("maintenance.markDone"));
    await page.getByRole("button", { name: "Done: Today job" }).click();
    await saved;
    await expect(page.getByRole("button", { name: "Done: Today job" })).toBeEnabled();
    await page.clock.fastForward(10_000);
    // Thirteen seconds after the first done, but only ten after the second: its toast and Undo are still there.
    await expect(toast.getByRole("button", { name: "Undo" })).toBeVisible();
    await page.clock.fastForward(6_000);
    await expect(toast).toHaveCount(0);
  });

  test("the Undo toast waits while the pointer is on it, and goes after it leaves", async ({ page, request }) => {
    await seedUpkeep(request, weekly("Today job", 7));
    await page.clock.install({ time: new Date(`${todayUtc()}T12:00:00Z`) });
    await page.goto("/upkeep");
    await page.getByRole("button", { name: "Done: Today job" }).click();
    const toast = page.getByRole("status").filter({ hasText: "Today job marked done." });
    await expect(toast).toBeVisible();
    await toast.hover();
    await page.clock.fastForward(30_000);
    await expect(toast).toBeVisible();
    await page.mouse.move(0, 0);
    await page.clock.fastForward(16_000);
    await expect(toast).toHaveCount(0);
  });

  test("a second done on the same day is refused in words and the first stays", async ({ page, request }) => {
    await seedUpkeep(request, weekly("Fresh job", 0));
    await page.goto("/upkeep");
    await expect(row(page, "Fresh job")).toContainText("Due in 7 days");
    await page.getByRole("button", { name: "Done: Fresh job" }).click();
    await expect(page.getByRole("alert")).toHaveText("Fresh job is already marked done today.");
    await expect(page.getByRole("button", { name: "Undo" })).toHaveCount(0);
  });

  test("marking done on a day that already has a done date says so in the dialog and keeps one entry", async ({ page, request }) => {
    await seedUpkeep(request, weekly("Gutters", 0));
    await page.goto("/upkeep");
    await page.getByRole("button", { name: "Edit Gutters" }).click();
    const dialog = page.getByRole("dialog");
    await dialog.getByRole("button", { name: "Mark done" }).click();
    await expect(dialog.getByRole("alert")).toHaveText("Gutters is already marked done today.");
    await expect(dialog.getByRole("listitem")).toHaveCount(1);
  });

  test("after a done, focus moves on to the next Done button instead of the top of the page", async ({ page, request }) => {
    await seedUpkeep(request, weekly("Overdue job", 20));
    await seedUpkeep(request, weekly("Second job", 10));
    await page.goto("/upkeep");
    await page.getByRole("button", { name: "Done: Overdue job" }).click();
    await expect(row(page, "Overdue job")).toContainText("Due in 7 days");
    await expect(page.locator(":focus")).toHaveAttribute("data-done-action");
  });

  test("shows the error and no Undo when marking done fails", async ({ page, request }) => {
    await seedUpkeep(request, weekly("Today job", 7));
    await interceptCall(page, "maintenance.markDone", { answer: failure("Could not mark it done.") });
    await page.goto("/upkeep");
    await page.getByRole("button", { name: "Done: Today job" }).click();
    await expect(page.getByRole("alert")).toHaveText("Could not mark it done.");
    await expect(page.getByRole("button", { name: "Undo" })).toHaveCount(0);
    await expect(row(page, "Today job")).toContainText("Due today");
  });
});

test.describe("adding", () => {
  test("a suggestion fills the form, a last done date sets the due date, and the suggestion is then gone", async ({ page }) => {
    await page.goto("/upkeep");
    await page.getByRole("button", { name: "Add job" }).click();
    const dialog = page.getByRole("dialog");
    await dialog.getByRole("button", { name: "Furnace filter" }).click();
    await expect(dialog.getByRole("textbox", { name: "Name" })).toHaveValue("Furnace filter");
    await expect(dialog.getByRole("spinbutton", { name: "Every" })).toHaveValue("3");
    await expect(dialog.getByLabel("Unit")).toHaveValue("months");
    await dialog.getByLabel("Not done yet").uncheck();
    await dialog.getByLabel("Last done").fill(daysAgo(10));
    await dialog.getByRole("button", { name: "Save" }).click();
    await expect(dialog).toHaveCount(0);
    await expect(row(page, "Furnace filter")).toContainText("Every 3 months");
    await expect(row(page, "Furnace filter")).toContainText("last done");

    await page.getByRole("button", { name: "Add job" }).click();
    await expect(page.getByRole("dialog").getByRole("button", { name: "Furnace filter" })).toHaveCount(0);
    await expect(page.getByRole("dialog").getByRole("button", { name: "Dryer vent" })).toBeVisible();
  });

  test("another suggestion in months reads as it is, and a year-long one as a year", async ({ page }) => {
    await page.goto("/upkeep");
    await page.getByRole("button", { name: "Add job" }).click();
    const dialog = page.getByRole("dialog");
    await dialog.getByRole("button", { name: "Fridge coils" }).click();
    await expect(dialog.getByLabel("Unit")).toHaveValue("years");
    await dialog.getByRole("button", { name: "Smoke alarm batteries" }).click();
    await expect(dialog.getByRole("spinbutton", { name: "Every" })).toHaveValue("6");
    await expect(dialog.getByLabel("Unit")).toHaveValue("months");
  });

  test("an item added as not done yet shows as not done yet", async ({ page }) => {
    await page.goto("/upkeep");
    await page.getByRole("button", { name: "Add job" }).click();
    const dialog = page.getByRole("dialog");
    await dialog.getByRole("textbox", { name: "Name" }).fill("Gutters");
    await dialog.getByRole("button", { name: "Save" }).click();
    await expect(row(page, "Gutters")).toContainText("Not done yet");
    await expect(page.getByRole("region", { name: "Due now" }).getByText("Gutters")).toBeVisible();
  });

  test("asks for a name and a sensible interval before saving", async ({ page }) => {
    await page.goto("/upkeep");
    await page.getByRole("button", { name: "Add job" }).click();
    const dialog = page.getByRole("dialog");
    await dialog.getByRole("button", { name: "Save" }).click();
    await expect(dialog.getByRole("alert")).toHaveText("Enter a name.");
    await dialog.getByRole("textbox", { name: "Name" }).fill("X");
    await dialog.getByRole("spinbutton", { name: "Every" }).fill("0");
    await dialog.getByRole("button", { name: "Save" }).click();
    await expect(dialog.getByRole("alert")).toHaveText("Enter a whole number from 1 to 99.");
    await expect(page.getByText("X", { exact: true })).toHaveCount(0);
  });

  test("refuses a name already on the list and keeps the dialog open", async ({ page, request }) => {
    await seedUpkeep(request, weekly("Gutters", 1));
    await page.goto("/upkeep");
    await page.getByRole("button", { name: "Add job" }).click();
    const dialog = page.getByRole("dialog");
    await dialog.getByRole("textbox", { name: "Name" }).fill("gutters");
    await dialog.getByRole("button", { name: "Save" }).click();
    await expect(dialog.getByRole("alert")).toHaveText("gutters is already on the list. Use another name.");
    await expect(dialog).toBeVisible();
  });
});

test.describe("editing, history and removing", () => {
  test("changing the interval moves the due date", async ({ page, request }) => {
    await seedUpkeep(request, { name: "Gutters", every: 1, unit: "weeks", lastDoneOn: daysAgo(10) });
    await page.goto("/upkeep");
    await expect(row(page, "Gutters")).toContainText("3 days overdue");
    await page.getByRole("button", { name: "Edit Gutters" }).click();
    const dialog = page.getByRole("dialog");
    await dialog.getByRole("spinbutton", { name: "Every" }).fill("2");
    await dialog.getByRole("button", { name: "Save" }).click();
    await expect(dialog).toHaveCount(0);
    await expect(row(page, "Gutters")).toContainText("Every 2 weeks");
    await expect(row(page, "Gutters")).toContainText("Due in 4 days");
  });

  test("a done date can be added for an earlier day and removed again", async ({ page, request }) => {
    await seedUpkeep(request, { name: "Gutters", every: 1, unit: "months", lastDoneOn: daysAgo(20) });
    await page.goto("/upkeep");
    await page.getByRole("button", { name: "Edit Gutters" }).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog.getByRole("listitem")).toHaveCount(1);
    await dialog.getByLabel("Mark done on").fill(daysAgo(3));
    await dialog.getByRole("button", { name: "Mark done" }).click();
    await expect(dialog.getByRole("listitem")).toHaveCount(2);
    await dialog.getByRole("button", { name: /^Remove the done date/ }).first().click();
    await expect(dialog.getByRole("listitem")).toHaveCount(1);
    await dialog.getByRole("button", { name: "Cancel" }).click();
    await expect(row(page, "Gutters")).toContainText("last done");
  });

  test("a future done date cannot be picked", async ({ page, request }) => {
    await seedUpkeep(request, weekly("Gutters", 1));
    await page.goto("/upkeep");
    await page.getByRole("button", { name: "Edit Gutters" }).click();
    expect(await page.getByRole("dialog").getByLabel("Mark done on").getAttribute("max")).toBe(todayUtc());
  });

  test("a failed remove keeps the dialog open with the error, and the error is gone in the next dialog", async ({ page, request }) => {
    await seedUpkeep(request, weekly("Gutters", 1));
    await interceptCall(page, "maintenance.remove", { answer: failure("Could not remove it.") });
    await page.goto("/upkeep");
    await page.getByRole("button", { name: "Edit Gutters" }).click();
    const dialog = page.getByRole("dialog");
    await dialog.getByRole("button", { name: "Remove item" }).click();
    await dialog.getByRole("button", { name: "Yes, remove it" }).click();
    await expect(dialog.getByRole("alert")).toHaveText("Could not remove it.");
    await dialog.getByRole("button", { name: "Cancel" }).click();
    await page.getByRole("button", { name: "Add job" }).click();
    await expect(page.getByRole("dialog").getByRole("alert")).toHaveCount(0);
    await expect(row(page, "Gutters")).toBeVisible();
  });

  test("removing asks first, then takes the item off the list", async ({ page, request }) => {
    await seedUpkeep(request, weekly("Gutters", 1));
    await page.goto("/upkeep");
    await page.getByRole("button", { name: "Edit Gutters" }).click();
    const dialog = page.getByRole("dialog");
    await dialog.getByRole("button", { name: "Remove item" }).click();
    await dialog.getByRole("button", { name: "Keep it" }).click();
    await expect(dialog.getByRole("button", { name: "Remove item" })).toBeVisible();
    await dialog.getByRole("button", { name: "Remove item" }).click();
    await dialog.getByRole("button", { name: "Yes, remove it" }).click();
    await expect(dialog).toHaveCount(0);
    await expect(page.getByText("Gutters", { exact: true })).toHaveCount(0);
    await expect(page.getByText(/^Nothing here yet/)).toBeVisible();
  });
});

test.describe("failures and waiting", () => {
  test("a failed add keeps the dialog open with the error", async ({ page }) => {
    await interceptCall(page, "maintenance.add", { answer: failure("Could not add it.") });
    await page.goto("/upkeep");
    await page.getByRole("button", { name: "Add job" }).click();
    const dialog = page.getByRole("dialog");
    await dialog.getByRole("textbox", { name: "Name" }).fill("Gutters");
    await dialog.getByRole("button", { name: "Save" }).click();
    await expect(dialog.getByRole("alert")).toHaveText("Could not add it.");
    await expect(dialog.getByRole("textbox", { name: "Name" })).toHaveValue("Gutters");
  });

  test("a failed edit keeps the dialog open with the error", async ({ page, request }) => {
    await seedUpkeep(request, weekly("Gutters", 1));
    await interceptCall(page, "maintenance.update", { answer: failure("Could not save it.") });
    await page.goto("/upkeep");
    await page.getByRole("button", { name: "Edit Gutters" }).click();
    const dialog = page.getByRole("dialog");
    await dialog.getByRole("spinbutton", { name: "Every" }).fill("2");
    await dialog.getByRole("button", { name: "Save" }).click();
    await expect(dialog.getByRole("alert")).toHaveText("Could not save it.");
    await expect(row(page, "Gutters")).toContainText("Every week");
  });

  test("a failed Undo says so and the done stays", async ({ page, request }) => {
    await seedUpkeep(request, weekly("Today job", 7));
    await interceptCall(page, "maintenance.undoDone", { answer: failure("Could not undo it.") });
    await page.goto("/upkeep");
    await page.getByRole("button", { name: "Done: Today job" }).click();
    await page.getByRole("status").filter({ hasText: "Today job marked done." }).getByRole("button", { name: "Undo" }).click();
    await expect(page.getByRole("alert")).toHaveText("Could not undo it.");
    await expect(row(page, "Today job")).toContainText("Due in 7 days");
    await expect(page.getByRole("status").filter({ hasText: "Today job marked done." })).toBeVisible();
  });

  test("Enter in the done date marks it and does not save the item", async ({ page, request }) => {
    await seedUpkeep(request, weekly("Gutters", 1));
    await page.goto("/upkeep");
    await page.getByRole("button", { name: "Edit Gutters" }).click();
    const dialog = page.getByRole("dialog");
    await dialog.getByLabel("Mark done on").fill(daysAgo(3));
    await dialog.getByLabel("Mark done on").press("Enter");
    await expect(dialog.getByRole("listitem")).toHaveCount(2);
    await expect(dialog).toBeVisible();
  });

  test("says so when the done dates cannot be loaded", async ({ page, request }) => {
    await seedUpkeep(request, weekly("Gutters", 1));
    await interceptCall(page, "maintenance.history", { answer: failure("down") });
    await page.goto("/upkeep");
    await page.getByRole("button", { name: "Edit Gutters" }).click();
    await expect(page.getByRole("dialog").getByRole("alert")).toHaveText(/Couldn't load the done dates/, RETRIES);
  });

  test("a failed done date or removal in the history shows the error in the dialog", async ({ page, request }) => {
    await seedUpkeep(request, weekly("Gutters", 1));
    await interceptCall(page, "maintenance.markDone", { answer: failure("Could not mark it done.") });
    await page.goto("/upkeep");
    await page.getByRole("button", { name: "Edit Gutters" }).click();
    const dialog = page.getByRole("dialog");
    await dialog.getByRole("button", { name: "Mark done" }).click();
    await expect(dialog.getByRole("alert")).toHaveText("Could not mark it done.");
  });

  test("a failed history removal shows the error in the dialog", async ({ page, request }) => {
    await seedUpkeep(request, weekly("Gutters", 1));
    await interceptCall(page, "maintenance.undoDone", { answer: failure("Could not remove the date.") });
    await page.goto("/upkeep");
    await page.getByRole("button", { name: "Edit Gutters" }).click();
    const dialog = page.getByRole("dialog");
    await dialog.getByRole("button", { name: /^Remove the done date/ }).click();
    await expect(dialog.getByRole("alert")).toHaveText("Could not remove the date.");
    await expect(dialog.getByRole("listitem")).toHaveCount(1);
  });

  test("Done is disabled while the done is being saved", async ({ page, request }) => {
    await seedUpkeep(request, weekly("Today job", 7));
    const held = gate();
    await interceptCall(page, "maintenance.markDone", { when: held.when });
    await page.goto("/upkeep");
    try {
      await page.getByRole("button", { name: "Done: Today job" }).click();
      await expect(page.getByRole("button", { name: "Done: Today job" })).toBeDisabled();
    } finally {
      held.release();
    }
    await expect(row(page, "Today job")).toContainText("Due in 7 days");
  });

  test("Save is disabled while an item is being added", async ({ page }) => {
    const held = gate();
    await interceptCall(page, "maintenance.add", { when: held.when });
    await page.goto("/upkeep");
    await page.getByRole("button", { name: "Add job" }).click();
    const dialog = page.getByRole("dialog");
    await dialog.getByRole("textbox", { name: "Name" }).fill("Gutters");
    try {
      await dialog.getByRole("button", { name: "Save" }).click();
      await expect(dialog.getByRole("button", { name: "Save" })).toBeDisabled();
    } finally {
      held.release();
    }
    await expect(dialog).toHaveCount(0);
  });

  test("Yes, remove it is disabled while the removal is being saved", async ({ page, request }) => {
    await seedUpkeep(request, weekly("Gutters", 1));
    const held = gate();
    await interceptCall(page, "maintenance.remove", { when: held.when });
    await page.goto("/upkeep");
    await page.getByRole("button", { name: "Edit Gutters" }).click();
    const dialog = page.getByRole("dialog");
    await dialog.getByRole("button", { name: "Remove item" }).click();
    try {
      await dialog.getByRole("button", { name: "Yes, remove it" }).click();
      await expect(dialog.getByRole("button", { name: "Yes, remove it" })).toBeDisabled();
    } finally {
      held.release();
    }
    await expect(dialog).toHaveCount(0);
  });

  test("focus moves to the control that replaces the one just used when removing", async ({ page, request }) => {
    await seedUpkeep(request, weekly("Gutters", 1));
    await page.goto("/upkeep");
    await page.getByRole("button", { name: "Edit Gutters" }).click();
    const dialog = page.getByRole("dialog");
    await dialog.getByRole("button", { name: "Remove item" }).click();
    await expect(dialog.getByRole("button", { name: "Keep it" })).toBeFocused();
    await dialog.getByRole("button", { name: "Keep it" }).click();
    await expect(dialog.getByRole("button", { name: "Remove item" })).toBeFocused();
  });
});

test.describe("dates, limits and focus", () => {
  test("a far date is told in months, and one a year or more away carries its year", async ({ page, request }) => {
    await seedUpkeep(request, { name: "Half year job", every: 6, unit: "months", lastDoneOn: daysAgo(10) });
    await seedUpkeep(request, { name: "Year job", every: 1, unit: "years", lastDoneOn: daysAgo(2) });
    await page.goto("/upkeep");
    await expect(row(page, "Half year job")).toContainText(/Due in [56] months/);
    await expect(row(page, "Year job")).toContainText(/Due \d+ \w+ \d{4}/);
    await expect(row(page, "Year job")).toContainText(/last done \d+ \w+(?! \d{4})/);
  });

  test("the name box stops at 80 characters, so a longer name can never be sent", async ({ page }) => {
    await page.goto("/upkeep");
    await page.getByRole("button", { name: "Add job" }).click();
    const dialog = page.getByRole("dialog");
    const name = dialog.getByRole("textbox", { name: "Name" });
    await expect(name).toHaveAttribute("maxlength", "80");
    await name.pressSequentially("x".repeat(85));
    expect(await name.inputValue()).toHaveLength(80);
    await dialog.getByRole("button", { name: "Save" }).click();
    await expect(dialog).toHaveCount(0);
  });

  test("closing a dialog returns focus to the button that opened it", async ({ page, request }) => {
    await seedUpkeep(request, weekly("Gutters", 1));
    await page.goto("/upkeep");
    const edit = page.getByRole("button", { name: "Edit Gutters" });
    await edit.click();
    await page.getByRole("dialog").getByRole("button", { name: "Cancel" }).click();
    await expect(edit).toBeFocused();
    const add = page.getByRole("button", { name: "Add job" });
    await add.click();
    await page.keyboard.press("Escape");
    await expect(add).toBeFocused();
  });

  test("adding, marking done and opening Edit while the toast shows raises no console error", async ({ page, request }) => {
    const problems: string[] = [];
    page.on("console", (message) => message.type() === "error" && problems.push(message.text()));
    page.on("pageerror", (error) => problems.push(error.message));
    await seedUpkeep(request, weekly("Gutters", 7));
    await page.goto("/upkeep");
    await page.getByRole("button", { name: "Done: Gutters" }).click();
    await expect(page.getByRole("status").filter({ hasText: "Gutters marked done." })).toBeVisible();
    await page.getByRole("button", { name: "Edit Gutters" }).click();
    await expect(page.getByRole("dialog").getByRole("listitem")).toHaveCount(2);
    await page.getByRole("dialog").getByRole("button", { name: "Cancel" }).click();
    expect(problems).toEqual([]);
  });
});

test.describe("midnight", () => {
  test("when the day changes, the list stays on screen and the words move on", async ({ page, request }) => {
    await seedUpkeep(request, weekly("Today job", 7));
    await page.clock.install({ time: new Date(`${todayUtc()}T23:59:00Z`) });
    await page.goto("/upkeep");
    await expect(row(page, "Today job")).toContainText("Due today");
    await page.clock.fastForward(120_000);
    await expect(row(page, "Today job")).toContainText("1 day overdue");
    await expect(page.getByText("Loading.")).toHaveCount(0);
  });
});

test.describe("fit, targets and themes", () => {
  test("every button on a row and in the dialog is at least 44px tall", async ({ page, request }) => {
    await seedUpkeep(request, weekly("Gutters", 7));
    await page.goto("/upkeep");
    const controls = [
      page.getByRole("button", { name: "Add job" }),
      page.getByRole("button", { name: "Edit Gutters" }),
      page.getByRole("button", { name: "Done: Gutters" }),
    ];
    for (const control of controls) expect((await control.boundingBox())?.height).toBeGreaterThanOrEqual(44);
    await page.getByRole("button", { name: "Edit Gutters" }).click();
    const dialog = page.getByRole("dialog");
    for (const control of [
      dialog.getByRole("button", { name: "Mark done" }),
      dialog.getByRole("button", { name: /^Remove the done date/ }),
      dialog.getByRole("button", { name: "Remove item" }),
      dialog.getByRole("spinbutton", { name: "Every" }),
      dialog.getByLabel("Unit"),
      dialog.getByLabel("Mark done on"),
    ]) {
      expect((await control.boundingBox())?.height).toBeGreaterThanOrEqual(44);
    }
  });

  test.describe("on a landscape tablet", () => {
    test.use({ viewport: { width: 1024, height: 768 } });

    test("all seven nav links fit the screen height, and the page does not grow past it", async ({ page }) => {
      await page.goto("/upkeep");
      const rail = page.getByRole("navigation", { name: "Main" });
      const last = await rail.getByRole("link", { name: "Assistant" }).boundingBox();
      expect((last?.y ?? 0) + (last?.height ?? 0)).toBeLessThanOrEqual(768);
      expect(await page.evaluate(() => document.documentElement.scrollHeight - window.innerHeight)).toBeLessThanOrEqual(0);
    });
  });

  test.describe("on a small phone", () => {
    test.use({ viewport: { width: 360, height: 700 } });

    test("every nav label fits its cell and keeps clear of the next one", async ({ page }) => {
      await page.goto("/upkeep");
      const links = page.getByRole("navigation", { name: "Main" }).getByRole("link");
      for (const link of await links.all()) {
        expect(await link.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(true);
      }
    });
  });

  test.describe("on a phone", () => {
    test.use({ viewport: { width: 375, height: 700 } });

    test("a name of 80 characters wraps and keeps both buttons on screen", async ({ page, request }) => {
      const name = `Long ${"clean the filter ".repeat(5)}`.slice(0, 80).trim();
      await seedUpkeep(request, weekly(name, 20));
      await page.goto("/upkeep");
      await expect(page.getByRole("button", { name: `Done: ${name}` })).toBeInViewport();
      await expect(page.getByRole("button", { name: `Edit ${name}` })).toBeInViewport();
      expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0);
    });

    test("the page, the seven nav labels and the dialog fit the width", async ({ page, request }) => {
      await seedUpkeep(request, weekly("Gutters", 20));
      await page.goto("/upkeep");
      const overflow = () => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      expect(await overflow()).toBeLessThanOrEqual(0);
      const links = page.getByRole("navigation", { name: "Main" }).getByRole("link");
      await expect(links).toHaveCount(7);
      for (const link of await links.all()) {
        const fits = await link.evaluate((element) => element.scrollWidth <= element.clientWidth + 1);
        expect(fits).toBe(true);
      }
      await expect(page.getByRole("button", { name: "Done: Gutters" })).toBeInViewport();
      await page.getByRole("button", { name: "Edit Gutters" }).click();
      expect(await overflow()).toBeLessThanOrEqual(0);
    });
  });

  test.describe("on a tablet", () => {
    test.use({ viewport: { width: 820, height: 1000 } });

    test("the page fits the width", async ({ page, request }) => {
      await seedUpkeep(request, weekly("Gutters", 20));
      await page.goto("/upkeep");
      await expect(page.getByRole("button", { name: "Done: Gutters" })).toBeInViewport();
      expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0);
    });
  });

  test("in light mode the overdue and soon words are readable", async ({ page, request }) => {
    await seedUpkeep(request, weekly("Overdue job", 20));
    await seedUpkeep(request, weekly("Soon job", 5));
    await page.emulateMedia({ colorScheme: "light" });
    await page.goto("/upkeep");
    for (const text of [row(page, "Overdue job").getByText("13 days overdue"), row(page, "Soon job").getByText("Due in 2 days")]) {
      expect(await contrastOf(text)).toBeGreaterThanOrEqual(4.5);
    }
  });

  test("in dark mode the due words, the list and the dialog text are readable", async ({ page, request }) => {
    await seedUpkeep(request, weekly("Overdue job", 20));
    await seedUpkeep(request, weekly("Soon job", 5));
    await seedUpkeep(request, { name: "Far job", every: 6, unit: "months", lastDoneOn: daysAgo(10) });
    await page.emulateMedia({ colorScheme: "dark" });
    await page.goto("/upkeep");
    for (const text of [
      row(page, "Overdue job").getByText("13 days overdue"),
      row(page, "Soon job").getByText("Due in 2 days"),
      row(page, "Far job").getByText(/^Due in \d+ months/),
      row(page, "Far job").getByText(/^Every 6 months/),
      page.getByRole("heading", { name: "Due now" }),
    ]) {
      expect(await contrastOf(text)).toBeGreaterThanOrEqual(4.5);
    }
    await page.getByRole("button", { name: "Edit Far job" }).click();
    const dialog = page.getByRole("dialog");
    for (const text of [dialog.getByRole("heading", { name: "Edit Far job" }), dialog.getByText("Done on", { exact: true }), dialog.getByText(/^Not done yet\.$|^\d+ \w+ \d{4}$/).first()]) {
      expect(await contrastOf(text)).toBeGreaterThanOrEqual(4.5);
    }
  });

  test("with reduced motion asked for, nothing on the page animates", async ({ page, request }) => {
    await seedUpkeep(request, weekly("Gutters", 1));
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto("/upkeep");
    const running = await page.evaluate(() =>
      [...document.querySelectorAll("main, main *")].filter((element) => {
        const style = getComputedStyle(element);
        return parseFloat(style.transitionDuration) > 0 || parseFloat(style.animationDuration) > 0;
      }).length,
    );
    expect(running).toBe(0);
  });

  test("the row buttons can be reached from the keyboard and show a focus ring", async ({ page, request }) => {
    await seedUpkeep(request, weekly("Gutters", 1));
    await page.goto("/upkeep");
    await page.getByRole("button", { name: "Add job" }).focus();
    await page.keyboard.press("Tab");
    await expect(page.getByRole("button", { name: "Edit Gutters" })).toBeFocused();
    await page.keyboard.press("Tab");
    const done = page.getByRole("button", { name: "Done: Gutters" });
    await expect(done).toBeFocused();
    const ring = await done.evaluate((element) => {
      const style = getComputedStyle(element);
      return { style: style.outlineStyle, width: parseFloat(style.outlineWidth) };
    });
    expect(ring.style).not.toBe("none");
    expect(ring.width).toBeGreaterThan(0);
  });
});
