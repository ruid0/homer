import { expect, test, type Locator, type Page } from "@playwright/test";
import { clearUpkeep, daysAgo, seedDone, seedUpkeep } from "./scratch";

test.describe.configure({ mode: "serial", timeout: 60_000 });

test.beforeEach(async ({ request }) => {
  await clearUpkeep(request);
});

const row = (page: Page, name: string) => page.getByRole("listitem").filter({ has: page.getByText(name, { exact: true }) });
const unitButton = (dialog: Locator, name: string) => dialog.locator("label").filter({ hasText: new RegExp(`^${name}$`, "i") });
const toggle = (dialog: Locator) => dialog.getByRole("button", { name: /^Done on/ });
const everyBox = (dialog: Locator) => dialog.getByRole("spinbutton", { name: "Every" });

const openAdd = async (page: Page) => {
  await page.goto("/upkeep");
  await page.getByRole("button", { name: "Add job" }).click();
  return page.getByRole("dialog");
};

const openEdit = async (page: Page, name: string) => {
  await page.goto("/upkeep");
  await page.getByRole("button", { name: `Edit ${name}` }).click();
  return page.getByRole("dialog");
};

// A job done on five different days, so its history is longer than the three that show first.
const seedFiveDone = async (request: Parameters<typeof seedUpkeep>[0], name: string) => {
  const { id } = await seedUpkeep(request, { name, every: 3, unit: "months", lastDoneOn: daysAgo(10) });
  for (const days of [20, 30, 40, 50]) await seedDone(request, id, daysAgo(days));
};

test.describe("the stepper", () => {
  test("plus and minus change the number, and the number can still be typed", async ({ page }) => {
    const dialog = await openAdd(page);
    await expect(everyBox(dialog)).toHaveValue("3");
    await dialog.getByRole("button", { name: "One more" }).click();
    await expect(everyBox(dialog)).toHaveValue("4");
    await dialog.getByRole("button", { name: "One less" }).click();
    await dialog.getByRole("button", { name: "One less" }).click();
    await expect(everyBox(dialog)).toHaveValue("2");
    await everyBox(dialog).fill("12");
    await dialog.getByRole("button", { name: "One more" }).click();
    await expect(everyBox(dialog)).toHaveValue("13");
  });

  test("minus stops at 1 and plus stops at 99, each disabled there", async ({ page }) => {
    const dialog = await openAdd(page);
    await everyBox(dialog).fill("1");
    await expect(dialog.getByRole("button", { name: "One less" })).toBeDisabled();
    await expect(dialog.getByRole("button", { name: "One more" })).toBeEnabled();
    await everyBox(dialog).fill("99");
    await expect(dialog.getByRole("button", { name: "One more" })).toBeDisabled();
    await expect(dialog.getByRole("button", { name: "One less" })).toBeEnabled();
  });

  test("a stepped number and a chosen unit are what gets saved", async ({ page }) => {
    const dialog = await openAdd(page);
    await dialog.getByRole("textbox", { name: "Name" }).fill("Stepper job");
    await dialog.getByRole("button", { name: "One more" }).click();
    await unitButton(dialog, "weeks").click();
    await dialog.getByRole("button", { name: "Save" }).click();
    await expect(dialog).toHaveCount(0);
    await expect(row(page, "Stepper job")).toContainText("Every 4 weeks");
  });

  test("an emptied number box steps from 1, not from nothing", async ({ page }) => {
    const dialog = await openAdd(page);
    await everyBox(dialog).fill("");
    await dialog.getByRole("button", { name: "One more" }).click();
    await expect(everyBox(dialog)).toHaveValue("2");
  });

  test("an empty or zero number is still refused in words on Save", async ({ page }) => {
    const dialog = await openAdd(page);
    await dialog.getByRole("textbox", { name: "Name" }).fill("Zero job");
    await everyBox(dialog).fill("0");
    await dialog.getByRole("button", { name: "Save" }).click();
    await expect(dialog.getByRole("alert")).toHaveText("Enter a whole number from 1 to 99.");
  });
});

test.describe("the unit buttons", () => {
  test("show all three at once with the current one selected, and the arrow keys move between them", async ({ page }) => {
    const dialog = await openAdd(page);
    const group = dialog.getByRole("group", { name: "Unit" });
    await expect(group.getByRole("radio")).toHaveCount(3);
    await expect(group.getByRole("radio", { name: "months" })).toBeChecked();
    await group.getByRole("radio", { name: "months" }).focus();
    await page.keyboard.press("ArrowRight");
    await expect(group.getByRole("radio", { name: "years" })).toBeChecked();
    await page.keyboard.press("ArrowLeft");
    await page.keyboard.press("ArrowLeft");
    await expect(group.getByRole("radio", { name: "weeks" })).toBeChecked();
  });

  test("editing a job shows its own unit and cycle", async ({ page, request }) => {
    await seedUpkeep(request, { name: "Yearly job", every: 2, unit: "years", lastDoneOn: daysAgo(10) });
    const dialog = await openEdit(page, "Yearly job");
    await expect(dialog.getByRole("radio", { name: "years" })).toBeChecked();
    await expect(everyBox(dialog)).toHaveValue("2");
  });
});

test.describe("last done when adding", () => {
  test("starts on 'Needs doing now', which adds a job due today that was not done yet", async ({ page }) => {
    const dialog = await openAdd(page);
    await expect(dialog.getByLabel("Last done")).toHaveValue("now");
    await dialog.getByRole("textbox", { name: "Name" }).fill("Now job");
    await dialog.getByRole("button", { name: "Save" }).click();
    await expect(row(page, "Now job")).toContainText("Not done yet");
  });

  for (const [choice, days] of [["Today", 0], ["A week ago", 7]] as const) {
    test(`'${choice}' counts the next due date from that day`, async ({ page }) => {
      const dialog = await openAdd(page);
      await dialog.getByRole("textbox", { name: "Name" }).fill(`${choice} job`);
      await unitButton(dialog, "weeks").click();
      await everyBox(dialog).fill("1");
      await dialog.getByLabel("Last done").selectOption(choice);
      await dialog.getByRole("button", { name: "Save" }).click();
      await expect(dialog).toHaveCount(0);
      await expect(row(page, `${choice} job`)).toContainText(days === 0 ? "Due in 7 days" : "Due today");
      await expect(row(page, `${choice} job`)).toContainText("Last done");
    });
  }

  test("'A month ago' counts from a month back", async ({ page }) => {
    const dialog = await openAdd(page);
    await dialog.getByRole("textbox", { name: "Name" }).fill("Month job");
    await everyBox(dialog).fill("1");
    await dialog.getByLabel("Last done").selectOption("A month ago");
    await dialog.getByRole("button", { name: "Save" }).click();
    await expect(row(page, "Month job")).toContainText("Last done");
    // Done a month ago, every month: due today.
    await expect(row(page, "Month job")).toContainText("Due today");
  });

  test("a picked date more than a year back is refused in words", async ({ page }) => {
    const dialog = await openAdd(page);
    await dialog.getByRole("textbox", { name: "Name" }).fill("Old job");
    await dialog.getByLabel("Last done").selectOption("Pick a date…");
    await dialog.getByLabel("Done on").fill(daysAgo(500));
    await dialog.getByRole("button", { name: "Save" }).click();
    await expect(dialog.getByRole("alert")).toHaveText("Pick a date from today back to a year ago.");
  });

  test("the date field limits itself to the last year, and not the future", async ({ page }) => {
    const dialog = await openAdd(page);
    await dialog.getByLabel("Last done").selectOption("Pick a date…");
    expect(await dialog.getByLabel("Done on").getAttribute("max")).toBe(daysAgo(0));
    expect(await dialog.getByLabel("Done on").getAttribute("min")).toBe(daysAgo(365));
  });

  test("editing a job has no 'Last done' choice and no suggestions", async ({ page, request }) => {
    await seedUpkeep(request, { name: "Edit only", every: 3, unit: "months", lastDoneOn: daysAgo(10) });
    const dialog = await openEdit(page, "Edit only");
    await expect(dialog.getByLabel("Last done")).toHaveCount(0);
    await expect(dialog.getByLabel("Start from a suggestion")).toHaveCount(0);
  });
});

test.describe("the done dates", () => {
  test("are closed to begin with, with the count on the button", async ({ page, request }) => {
    await seedFiveDone(request, "Five job");
    const dialog = await openEdit(page, "Five job");
    await expect(toggle(dialog)).toHaveText(/^Done on \(5\)/);
    await expect(toggle(dialog)).toHaveAttribute("aria-expanded", "false");
    await expect(dialog.getByLabel("Mark done on")).toBeHidden();
    await expect(dialog.getByRole("button", { name: /^Remove the done date/ })).toHaveCount(0);
  });

  test("open to the latest three, and Show all brings the rest", async ({ page, request }) => {
    await seedFiveDone(request, "Five job");
    const dialog = await openEdit(page, "Five job");
    await toggle(dialog).click();
    await expect(toggle(dialog)).toHaveAttribute("aria-expanded", "true");
    await expect(dialog.getByRole("listitem")).toHaveCount(3);
    await dialog.getByRole("button", { name: "Show all 5" }).click();
    await expect(dialog.getByRole("listitem")).toHaveCount(5);
    await expect(dialog.getByRole("button", { name: /^Show all/ })).toHaveCount(0);
  });

  test("three or fewer have no Show all", async ({ page, request }) => {
    const { id } = await seedUpkeep(request, { name: "Three job", every: 3, unit: "months", lastDoneOn: daysAgo(10) });
    await seedDone(request, id, daysAgo(20));
    await seedDone(request, id, daysAgo(30));
    const dialog = await openEdit(page, "Three job");
    await toggle(dialog).click();
    await expect(dialog.getByRole("listitem")).toHaveCount(3);
    await expect(dialog.getByRole("button", { name: /^Show all/ })).toHaveCount(0);
  });

  test("a job never done says so inside, and the button has no count", async ({ page, request }) => {
    await seedUpkeep(request, { name: "Fresh job", every: 3, unit: "months", lastDoneOn: null });
    const dialog = await openEdit(page, "Fresh job");
    await expect(toggle(dialog)).toHaveText(/^Done on\s*⌄?$/);
    await toggle(dialog).click();
    await expect(dialog.getByText("Not done yet.")).toBeVisible();
    await expect(dialog.getByLabel("Mark done on")).toBeVisible();
  });

  test("closing them again hides the form but keeps what was typed", async ({ page, request }) => {
    await seedUpkeep(request, { name: "Keep job", every: 3, unit: "months", lastDoneOn: daysAgo(10) });
    const dialog = await openEdit(page, "Keep job");
    await toggle(dialog).click();
    await dialog.getByLabel("Mark done on").fill(daysAgo(3));
    await toggle(dialog).click();
    await expect(dialog.getByLabel("Mark done on")).toBeHidden();
    await toggle(dialog).click();
    await expect(dialog.getByLabel("Mark done on")).toHaveValue(daysAgo(3));
  });

  test("Remove asks first, naming the date, and Keep it changes nothing", async ({ page, request }) => {
    await seedFiveDone(request, "Five job");
    const dialog = await openEdit(page, "Five job");
    await toggle(dialog).click();
    await dialog.getByRole("button", { name: /^Remove the done date/ }).first().click();
    await expect(dialog.getByRole("group", { name: /^Remove \d+ \w+( \d{4})?\?$/ })).toBeVisible();
    await expect(dialog.getByRole("button", { name: "Keep it" })).toBeFocused();
    await expect(toggle(dialog)).toHaveText(/^Done on \(5\)/);
    await dialog.getByRole("button", { name: "Keep it" }).click();
    await expect(dialog.getByRole("group", { name: /^Remove \d+ \w+/ })).toHaveCount(0);
    await expect(dialog.getByRole("button", { name: /^Remove the done date/ }).first()).toBeFocused();
    await expect(toggle(dialog)).toHaveText(/^Done on \(5\)/);
  });

  test("Yes, remove it takes that date off, updates the count and returns focus to the button", async ({ page, request }) => {
    await seedFiveDone(request, "Five job");
    const dialog = await openEdit(page, "Five job");
    await toggle(dialog).click();
    await dialog.getByRole("button", { name: /^Remove the done date/ }).first().click();
    await dialog.getByRole("button", { name: "Yes, remove it" }).click();
    await expect(toggle(dialog)).toHaveText(/^Done on \(4\)/);
    await expect(dialog.getByRole("listitem")).toHaveCount(3);
    await expect(toggle(dialog)).toBeFocused();
  });

  test("only one date is asked about at a time", async ({ page, request }) => {
    await seedFiveDone(request, "Five job");
    const dialog = await openEdit(page, "Five job");
    await toggle(dialog).click();
    await dialog.getByRole("button", { name: /^Remove the done date/ }).nth(0).click();
    await dialog.getByRole("button", { name: /^Remove the done date/ }).nth(0).click();
    await expect(dialog.getByRole("button", { name: "Yes, remove it" })).toHaveCount(1);
  });
});

test.describe("the Save row", () => {
  test.describe("on a small phone", () => {
    test.use({ viewport: { width: 375, height: 568 } });

    test("an error shows beside Save, in view, however far the fields are scrolled", async ({ page, request }) => {
      await seedFiveDone(request, "Five job");
      const dialog = await openEdit(page, "Five job");
      await toggle(dialog).click();
      await dialog.getByRole("button", { name: "Show all 5" }).click();
      await dialog.getByRole("textbox", { name: "Name" }).fill("");
      await dialog.evaluate((element) => element.scrollTo({ top: element.scrollHeight }));
      await dialog.getByRole("button", { name: "Save" }).click();
      const alert = dialog.getByRole("alert").filter({ hasText: "Enter a name." });
      await expect(alert).toBeInViewport();
      await expect(dialog.getByRole("button", { name: "Save" })).toBeInViewport();
    });

    test("Save and Cancel are the same two buttons at the bottom, whatever is open", async ({ page, request }) => {
      await seedUpkeep(request, { name: "Plain job", every: 3, unit: "months", lastDoneOn: daysAgo(10) });
      const dialog = await openEdit(page, "Plain job");
      await expect(dialog.getByRole("button", { name: "Cancel" })).toBeInViewport();
      await expect(dialog.getByRole("button", { name: "Save" })).toBeInViewport();
    });
  });

  test("Cancel closes without saving a change", async ({ page, request }) => {
    await seedUpkeep(request, { name: "Cancel job", every: 3, unit: "months", lastDoneOn: daysAgo(10) });
    const dialog = await openEdit(page, "Cancel job");
    await dialog.getByRole("button", { name: "One more" }).click();
    await dialog.getByRole("button", { name: "Cancel" }).click();
    await expect(dialog).toHaveCount(0);
    await expect(row(page, "Cancel job")).toContainText("Every 3 months");
  });

  test("stepping and changing the unit in an edit is saved", async ({ page, request }) => {
    await seedUpkeep(request, { name: "Change job", every: 3, unit: "months", lastDoneOn: daysAgo(10) });
    const dialog = await openEdit(page, "Change job");
    await dialog.getByRole("button", { name: "One less" }).click();
    await unitButton(dialog, "years").click();
    await dialog.getByRole("button", { name: "Save" }).click();
    await expect(dialog).toHaveCount(0);
    await expect(row(page, "Change job")).toContainText("Every 2 years");
  });
});

test.describe("looks", () => {
  test("the selected unit and the buttons keep their contrast in light and dark", async ({ page }) => {
    for (const scheme of ["light", "dark"] as const) {
      await page.emulateMedia({ colorScheme: scheme });
      const dialog = await openAdd(page);
      const selected = unitButton(dialog, "months");
      const colors = await selected.evaluate((element) => {
        const style = getComputedStyle(element);
        return { color: style.color, background: style.backgroundColor };
      });
      expect(colors.color).not.toBe(colors.background);
      await expect(dialog.getByRole("button", { name: "Save" })).toBeVisible();
      await page.keyboard.press("Escape");
    }
  });

  test("with reduced motion asked for, the open dates do not animate", async ({ page, request }) => {
    await seedFiveDone(request, "Five job");
    await page.emulateMedia({ reducedMotion: "reduce" });
    const dialog = await openEdit(page, "Five job");
    await toggle(dialog).click();
    const running = await dialog.evaluate((element) =>
      [...element.querySelectorAll("*")].filter((node) => parseFloat(getComputedStyle(node).animationDuration) > 0).length,
    );
    expect(running).toBe(0);
  });
});
