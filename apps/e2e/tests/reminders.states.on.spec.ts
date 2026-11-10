import { expect, test, type Page } from "@playwright/test";
import { contrastOf } from "./contrast";
import { failure, gate, interceptCall } from "./intercept";
import { addRow, seedPerson, seedReminder } from "./scratch";

// A failing query is retried 3 times with growing waits (about 7 seconds) before the screen calls it failed.
const RETRIES = { timeout: 20_000 };

test.describe.configure({ timeout: 60_000 });

const card = (page: Page) => page.getByRole("region", { name: "Reminders on this phone" });

const openRow = async (page: Page, name = "Row A") => {
  await page.getByRole("button", { name: `Edit ${name}` }).click();
  return page.getByRole("dialog");
};

const turnOn = (page: Page) => card(page).getByRole("button", { name: "Turn on reminders" }).click();

test.describe("loading and failed states", () => {
  // The row dialog cannot be opened while this check is loading: the grid and the check load in one request, so the grid waits too.
  // What the dialog shows while loading (no notice, controls disabled) is covered by the reminderState unit tests.
  test("while the notifications check is loading, nothing says off or failed and nothing can be pressed", async ({ page, request }) => {
    const id = await seedPerson(request);
    const held = gate();
    // The page asks for the grid and this answer in one request, so the grid waits too.
    await interceptCall(page, "people.notificationsOn", { when: held.when });
    try {
      await page.goto(`/people/${id}/routine`);
      await expect(page.getByRole("heading", { name: /'s routine$/ })).toBeVisible();
      await expect(card(page).getByRole("heading", { name: "Reminders on this phone" })).toBeVisible();
      await expect(page.getByText(/Notifications are off|Couldn't check/)).toHaveCount(0);
      await expect(card(page).getByRole("button")).toHaveCount(0);
    } finally {
      held.release();
    }
    await expect(card(page).getByRole("button", { name: "Turn on reminders" })).toBeVisible();
    await expect(page.getByText(/Notifications are off|Couldn't check/)).toHaveCount(0);
  });

  test("when the notifications check fails, the card and the dialog both say so and stay disabled", async ({ page, request }) => {
    const id = await seedPerson(request);
    await interceptCall(page, "people.notificationsOn", { answer: failure("down") });
    await page.goto(`/people/${id}/routine`);
    await expect(card(page).getByRole("alert")).toHaveText(/Couldn't check whether notifications are on/, RETRIES);
    await expect(page.getByText("Notifications are off")).toHaveCount(0);
    const dialog = await openRow(page);
    await expect(dialog.getByRole("alert").filter({ hasText: "Couldn't check" })).toBeVisible();
    await expect(dialog.getByLabel("Hours")).toBeDisabled();
    await expect(dialog.getByRole("button", { name: "Add reminder" })).toBeDisabled();
  });
});

test.describe("api errors", () => {
  test("turning reminders on fails: the card shows the error and the button stays usable", async ({ page, request }) => {
    const id = await seedPerson(request);
    await interceptCall(page, "people.reminderSetup", { answer: failure("Setup broke.") });
    await page.goto(`/people/${id}/routine`);
    await turnOn(page);
    await expect(card(page).getByRole("alert")).toHaveText("Setup broke.");
    await expect(card(page).getByRole("button", { name: "Turn on reminders" })).toBeEnabled();
  });

  test("loading the reminders fails: the dialog says so", async ({ page, request }) => {
    const id = await seedPerson(request);
    await seedReminder(request, id, (await addRow(request, id, "Row B")).id, "in 2 hours");
    await interceptCall(page, "routines.reminders", { answer: failure("down") });
    await page.goto(`/people/${id}/routine`);
    const dialog = await openRow(page);
    await expect(dialog.getByRole("alert")).toHaveText(/Couldn't load the reminders/, RETRIES);
  });

  test("adding fails: the dialog shows the error, keeps the choice and can try again", async ({ page, request }) => {
    const id = await seedPerson(request);
    await seedReminder(request, id, (await addRow(request, id, "Row B")).id, "in 2 hours");
    await interceptCall(page, "routines.addReminder", { answer: failure("Could not add it.") });
    await page.goto(`/people/${id}/routine`);
    const dialog = await openRow(page);
    await dialog.getByLabel("Minutes").selectOption("20");
    await dialog.getByRole("button", { name: "Add reminder" }).click();
    await expect(dialog.getByRole("alert")).toHaveText("Could not add it.");
    await expect(dialog.getByLabel("Minutes")).toHaveValue("20");
    await expect(dialog.getByRole("button", { name: "Add reminder" })).toBeEnabled();
    await expect(dialog.getByText("No reminders on this row.")).toBeVisible();
  });

  test("removing fails: the dialog shows the error and the reminder stays listed", async ({ page, request }) => {
    const id = await seedPerson(request);
    const row = await addRow(request, id, "Row B");
    await seedReminder(request, id, row.id, "in 2 hours");
    await interceptCall(page, "routines.removeReminder", { answer: failure("Could not remove it.") });
    await page.goto(`/people/${id}/routine`);
    const dialog = await openRow(page, "Row B");
    await dialog.getByRole("button", { name: /^Remove the reminder/ }).click();
    await expect(dialog.getByRole("alert")).toHaveText("Could not remove it.");
    await expect(dialog.getByRole("button", { name: /^Remove the reminder/ })).toHaveCount(1);
  });
});

test.describe("what stays after a reload", () => {
  test("reminders turned on stay on: the card offers the setup again, never the topic, and the pickers work", async ({ page, request }) => {
    const id = await seedPerson(request);
    await page.goto(`/people/${id}/routine`);
    await expect(page.getByText(/homer-[0-9a-f]{32}/)).toHaveCount(0);
    await turnOn(page);
    await expect(card(page).getByText(/homer-[0-9a-f]{32}/)).toBeVisible();
    await page.reload();
    await expect(card(page).getByRole("button", { name: "Show phone setup" })).toBeVisible();
    await expect(card(page).getByRole("button", { name: "Turn on reminders" })).toHaveCount(0);
    await expect(page.getByText(/homer-[0-9a-f]{32}/)).toHaveCount(0);
    const dialog = await openRow(page);
    await expect(dialog.getByText("Turn on reminders for this person first")).toHaveCount(0);
    await expect(dialog.getByLabel("Hours")).toBeEnabled();
    await expect(dialog.getByRole("button", { name: "Add reminder" })).toBeEnabled();
  });

  test("a reminder and its removal both survive a reload, and a reminder belongs only to its own row", async ({ page, request }) => {
    const id = await seedPerson(request);
    const other = await addRow(request, id, "Row B");
    await seedReminder(request, id, other.id, "in 3 hours");
    await page.goto(`/people/${id}/routine`);

    const adding = await openRow(page);
    await expect(adding.getByText("No reminders on this row.")).toBeVisible();
    await adding.getByRole("button", { name: "At a time" }).click();
    await adding.getByRole("textbox", { name: "Time" }).fill("08:05");
    await adding.getByRole("button", { name: "Add reminder" }).click();
    await expect(adding.getByText(/^(Today|Tomorrow) at 08:05$/)).toBeVisible();
    await page.reload();

    const removing = await openRow(page);
    await expect(removing.getByText(/^(Today|Tomorrow) at 08:05$/)).toHaveCount(1);
    await removing.getByRole("button", { name: /^Remove the reminder/ }).click();
    await expect(removing.getByText("No reminders on this row.")).toBeVisible();
    await page.reload();
    const removed = await openRow(page);
    await expect(removed.getByText("No reminders on this row.")).toBeVisible();
    await removed.getByRole("button", { name: "Cancel" }).click();
    const otherDialog = await openRow(page, "Row B");
    await expect(otherDialog.getByText(/^(Today|Tomorrow) at \d\d:\d\d$/)).toHaveCount(1);
  });
});

test.describe("what a person sees after adding", () => {
  test("a 30-minute wait shows a time about 30 minutes from now", async ({ page, request }) => {
    const id = await seedPerson(request);
    await seedReminder(request, id, (await addRow(request, id, "Row B")).id, "in 2 hours");
    await page.goto(`/people/${id}/routine`);
    const dialog = await openRow(page);
    await dialog.getByLabel("Hours").selectOption("0");
    await dialog.getByLabel("Minutes").selectOption("30");
    const before = Date.now();
    await dialog.getByRole("button", { name: "Add reminder" }).click();
    const label = await dialog.getByText(/^(Today|Tomorrow) at \d\d:\d\d$/).textContent();
    const [hour, minute] = (label ?? "").replace(/^\D+/, "").split(":").map(Number);
    const shown = new Date(before);
    shown.setUTCHours(hour ?? 0, minute ?? 0, 0, 0);
    const minutesAhead = (shown.getTime() - before) / 60_000;
    const wrapped = (minutesAhead + 24 * 60) % (24 * 60);
    expect(wrapped).toBeGreaterThan(28);
    expect(wrapped).toBeLessThan(32);
  });

  test("Enter adds the reminder once and does not save or close the row dialog", async ({ page, request }) => {
    const id = await seedPerson(request);
    await seedReminder(request, id, (await addRow(request, id, "Row B")).id, "in 2 hours");
    await page.goto(`/people/${id}/routine`);
    const dialog = await openRow(page);
    await dialog.getByRole("textbox", { name: "Name" }).fill("Edited but not saved");
    await dialog.getByRole("button", { name: "At a time" }).click();
    await dialog.getByRole("textbox", { name: "Time" }).fill("13:30");
    await dialog.getByLabel("Every day").check();
    await dialog.getByRole("textbox", { name: "Time" }).press("Enter");
    await expect(dialog.getByText("Every day at 13:30")).toHaveCount(1);
    await expect(dialog).toBeVisible();
    await expect(dialog.getByRole("textbox", { name: "Name" })).toHaveValue("Edited but not saved");
    await expect(page.getByRole("button", { name: "Edit Edited but not saved" })).toHaveCount(0);
  });
});

test.describe("touch targets and small screens", () => {
  test("every reminder control is at least 44px tall", async ({ page, request }) => {
    const id = await seedPerson(request);
    await seedReminder(request, id, (await addRow(request, id, "Row B")).id, "in 2 hours");
    await page.goto(`/people/${id}/routine`);
    const setup = [card(page).getByRole("button", { name: "Show phone setup" })];
    const dialog = await openRow(page, "Row B");
    await dialog.getByRole("button", { name: "At a time" }).click();
    const controls = [
      ...setup,
      dialog.getByRole("button", { name: "After a wait" }),
      dialog.getByRole("button", { name: "At a time" }),
      dialog.getByRole("textbox", { name: "Time" }),
      dialog.getByText("Every day", { exact: true }),
      dialog.getByRole("button", { name: "Add reminder" }),
      dialog.getByRole("button", { name: /^Remove the reminder/ }),
    ];
    for (const control of controls) expect((await control.boundingBox())?.height).toBeGreaterThanOrEqual(44);
    await dialog.getByRole("button", { name: "After a wait" }).click();
    for (const control of [dialog.getByLabel("Hours"), dialog.getByLabel("Minutes")]) {
      expect((await control.boundingBox())?.height).toBeGreaterThanOrEqual(44);
    }
  });

  test("the setup button is tall enough before reminders are on", async ({ page, request }) => {
    const id = await seedPerson(request);
    await page.goto(`/people/${id}/routine`);
    expect((await card(page).getByRole("button", { name: "Turn on reminders" }).boundingBox())?.height).toBeGreaterThanOrEqual(44);
  });

  test.describe("on a tablet", () => {
    test.use({ viewport: { width: 820, height: 1000 } });

    test("the page and the dialog fit the width", async ({ page, request }) => {
      const id = await seedPerson(request);
      await seedReminder(request, id, (await addRow(request, id, "Row B")).id, "in 2 hours");
      await page.goto(`/people/${id}/routine`);
      const dialog = await openRow(page);
      await expect(dialog.getByRole("button", { name: "Add reminder" })).toBeInViewport();
      expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0);
    });
  });

  test.describe("on a phone", () => {
    test.use({ viewport: { width: 375, height: 700 } });

    test("the page and the dialog fit the width, and the controls can be reached", async ({ page, request }) => {
      const id = await seedPerson(request);
      await seedReminder(request, id, (await addRow(request, id, "Row B")).id, "in 2 hours");
      await page.goto(`/people/${id}/routine`);
      await expect(card(page).getByRole("button", { name: "Show phone setup" })).toBeVisible();
      const dialog = await openRow(page);
      await dialog.getByRole("button", { name: "Add reminder" }).scrollIntoViewIfNeeded();
      await expect(dialog.getByRole("button", { name: "Add reminder" })).toBeInViewport();
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      expect(overflow).toBeLessThanOrEqual(0);
      const box = await dialog.boundingBox();
      expect((box?.x ?? 0) + (box?.width ?? 0)).toBeLessThanOrEqual(375);
    });
  });

  test("in dark mode the text on the card and in the dialog keeps a readable contrast", async ({ page, request }) => {
    const id = await seedPerson(request);
    await page.emulateMedia({ colorScheme: "dark" });
    await page.goto(`/people/${id}/routine`);
    const cardText = [card(page).getByRole("heading"), card(page).getByRole("button", { name: "Turn on reminders" })];
    for (const text of cardText) expect(await contrastOf(text)).toBeGreaterThanOrEqual(4.5);
    const dialog = await openRow(page);
    for (const text of [dialog.getByText("Turn on reminders for this person first"), dialog.getByText(/^Reminders only say/)]) {
      expect(await contrastOf(text)).toBeGreaterThanOrEqual(4.5);
    }
  });

  test("in dark mode an error message keeps a readable contrast", async ({ page, request }) => {
    const id = await seedPerson(request);
    await page.emulateMedia({ colorScheme: "dark" });
    await interceptCall(page, "people.reminderSetup", { answer: failure("Setup broke.") });
    await page.goto(`/people/${id}/routine`);
    await turnOn(page);
    expect(await contrastOf(card(page).getByRole("alert"))).toBeGreaterThanOrEqual(4.5);
  });

  test("with reduced motion asked for, nothing on the card or dialog animates", async ({ page, request }) => {
    const id = await seedPerson(request);
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto(`/people/${id}/routine`);
    await openRow(page);
    const running = await page.evaluate(() =>
      [...document.querySelectorAll("dialog, dialog *, section, section *")].filter((element) => {
        const style = getComputedStyle(element);
        return parseFloat(style.transitionDuration) > 0 || parseFloat(style.animationDuration) > 0;
      }).length,
    );
    expect(running).toBe(0);
  });
});

test.describe("saving and keyboard", () => {
  test("while a reminder is being added or removed, its button cannot be pressed again", async ({ page, request }) => {
    const id = await seedPerson(request);
    await seedReminder(request, id, (await addRow(request, id, "Row B")).id, "in 2 hours");
    await page.goto(`/people/${id}/routine`);
    const dialog = await openRow(page);
    const held = gate();
    await interceptCall(page, "routines.addReminder", { when: held.when });
    try {
      await dialog.getByRole("button", { name: "Add reminder" }).click();
      await expect(dialog.getByRole("button", { name: "Add reminder" })).toBeDisabled();
    } finally {
      held.release();
    }
    await expect(dialog.getByRole("button", { name: "Add reminder" })).toBeEnabled();
    await expect(dialog.getByText(/^(Today|Tomorrow) at \d\d:\d\d$/)).toHaveCount(1);
  });

  test("the pickers can be reached and used from the keyboard, and show where the focus is", async ({ page, request }) => {
    const id = await seedPerson(request);
    await seedReminder(request, id, (await addRow(request, id, "Row B")).id, "in 2 hours");
    await page.goto(`/people/${id}/routine`);
    const dialog = await openRow(page);
    await dialog.getByRole("button", { name: "After a wait" }).focus();
    await page.keyboard.press("Tab");
    await expect(dialog.getByRole("button", { name: "At a time" })).toBeFocused();
    await page.keyboard.press("Tab");
    await expect(dialog.getByLabel("Hours")).toBeFocused();
    await page.keyboard.press("Tab");
    await expect(dialog.getByLabel("Minutes")).toBeFocused();
    await page.keyboard.press("Tab");
    const add = dialog.getByRole("button", { name: "Add reminder" });
    await expect(add).toBeFocused();
    const ring = await add.evaluate((element) => {
      const style = getComputedStyle(element);
      return { style: style.outlineStyle, width: parseFloat(style.outlineWidth) };
    });
    expect(ring.style).not.toBe("none");
    expect(ring.width).toBeGreaterThan(0);
    await page.keyboard.press("Enter");
    await expect(dialog.getByText(/^(Today|Tomorrow) at \d\d:\d\d$/)).toHaveCount(1);
  });
});
