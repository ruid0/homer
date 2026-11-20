import { expect, test, type Page } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { contrastOf } from "./contrast";
import { failure, gate, interceptCall } from "./intercept";
import { seedItem } from "./scratch";

const DIALOG_PADDING = 20;

// Each test makes its own item with a unique name, so tests do not share state.
const newItem = async (request: Parameters<typeof seedItem>[0]) => {
  const name = `Ran out ${randomUUID().slice(0, 8)}`;
  await seedItem(request, name);
  return name;
};

const row = (page: Page, name: string) =>
  page.getByRole("listitem").filter({ has: page.getByText(name, { exact: true }) });

const openEdit = async (page: Page, name: string) => {
  await page.goto("/stock?view=everything");
  await page.getByRole("button", { name: `Edit ${name}` }).click();
  return page.getByRole("dialog");
};

test.describe("the row", () => {
  test("opens Edit by tapping it, has one action, and neither Bought it nor Ran out", async ({ page, request }) => {
    const name = await newItem(request);
    await page.goto("/stock?view=everything");
    await expect(row(page, name).getByRole("button", { name: `Edit ${name}` })).toBeVisible();
    await expect(row(page, name).getByRole("button", { name: `Bought it: ${name}` })).toHaveCount(0);
    await expect(row(page, name).getByRole("button", { name: /^Ran out/ })).toHaveCount(0);
    // An item that is already on the list says so instead of offering Add to list.
    await expect(row(page, name)).toContainText("On the list");
    await expect(row(page, name).getByRole("button", { name: /^Add .* to the list$/ })).toHaveCount(0);
  });

  test("Done and the action share one right-hand column and sit level with the title", async ({ page, request }) => {
    const first = await newItem(request);
    const second = await newItem(request);
    await page.setViewportSize({ width: 360, height: 800 });
    await page.goto("/stock?view=everything");
    const rights = [];
    for (const name of [first, second]) {
      const box = (await row(page, name).boundingBox())!;
      const title = (await row(page, name).getByText(name, { exact: true }).boundingBox())!;
      const chip = (await row(page, name).getByText("On the list").boundingBox())!;
      expect(chip.y).toBeLessThan(title.y + title.height + 24);
      expect(box.height).toBeLessThanOrEqual(96);
      rights.push(Math.round(chip.x + chip.width));
    }
    expect(new Set(rights).size).toBe(1);
  });

  test("Bought it is in the Edit dialog beside Ran out, and opens the restock dialog", async ({ page, request }) => {
    const name = await newItem(request);
    const dialog = await openEdit(page, name);
    await expect(dialog.getByRole("button", { name: `Ran out: ${name}` })).toBeVisible();
    await dialog.getByRole("button", { name: `Bought it: ${name}` }).click();
    await expect(page.getByRole("dialog")).toContainText(`Bought ${name}`);
    await expect(page.getByRole("dialog").getByRole("button", { name: `Ran out: ${name}` })).toHaveCount(0);
  });
});

test.describe("Ran out in the Edit dialog", () => {
  test("marks the item out at once, closes the dialog and puts it on the grocery list", async ({ page, request }) => {
    const name = await newItem(request);
    const dialog = await openEdit(page, name);
    await expect(dialog.getByText("Sets the quantity to 0 and puts it on the grocery list.")).toBeVisible();
    await expect(dialog.getByRole("button", { name: `Ran out: ${name}` })).toHaveAccessibleDescription(
      "Bought it adds what you bought, and clears it from the list if it is there. Sets the quantity to 0 and puts it on the grocery list.",
    );
    await dialog.getByRole("button", { name: `Ran out: ${name}` }).click();
    await expect(dialog).toHaveCount(0);
    await expect(row(page, name)).toContainText("Ran out");
    await expect(row(page, name)).toContainText("On the list");
    await expect(row(page, name)).toContainText("0 bag");
  });

  test("is not offered for an item already at 0", async ({ page, request }) => {
    const name = await newItem(request);
    const first = await openEdit(page, name);
    await first.getByRole("button", { name: `Ran out: ${name}` }).click();
    await expect(first).toHaveCount(0);
    await page.getByRole("button", { name: `Edit ${name}` }).click();
    await expect(page.getByRole("dialog")).toBeVisible();
    await expect(page.getByRole("dialog").getByRole("button", { name: /^Ran out/ })).toHaveCount(0);
  });

  test("is not offered while the form has unsaved changes, and comes back when they are undone", async ({
    page,
    request,
  }) => {
    const name = await newItem(request);
    const dialog = await openEdit(page, name);
    const ranOut = dialog.getByRole("button", { name: `Ran out: ${name}` });
    await expect(ranOut).toBeVisible();
    await dialog.getByLabel("Name").fill(`${name} changed`);
    await expect(ranOut).toHaveCount(0);
    await dialog.getByLabel("Name").fill(name);
    await expect(ranOut).toBeVisible();
    await dialog.getByLabel("Quantity").fill("5");
    await expect(ranOut).toHaveCount(0);
  });

  test("is not in the Add item dialog", async ({ page }) => {
    await page.goto("/stock?view=everything");
    await page.getByRole("button", { name: "Add item" }).click();
    await expect(page.getByRole("dialog").getByRole("button", { name: /^Ran out/ })).toHaveCount(0);
  });

  test("says what went wrong in the dialog, keeps it open and the item unchanged", async ({ page, request }) => {
    const name = await newItem(request);
    await interceptCall(page, "inventory.markOut", { answer: failure("Could not mark it out.") });
    const dialog = await openEdit(page, name);
    await dialog.getByRole("button", { name: `Ran out: ${name}` }).click();
    await expect(dialog.getByRole("alert")).toHaveText("Could not mark it out.");
    await expect(dialog.getByRole("button", { name: `Ran out: ${name}` })).toBeEnabled();
    await dialog.getByRole("button", { name: "Cancel" }).click();
    await expect(row(page, name)).toContainText("1 bag");
    await page.getByRole("button", { name: `Edit ${name}` }).click();
    await expect(page.getByRole("dialog").getByRole("alert")).toHaveCount(0);
  });

  test("the error goes away once the form is changed, and the button's lock holds against Save", async ({
    page,
    request,
  }) => {
    const name = await newItem(request);
    await interceptCall(page, "inventory.markOut", { answer: failure("Could not mark it out.") });
    const dialog = await openEdit(page, name);
    await dialog.getByRole("button", { name: `Ran out: ${name}` }).click();
    await expect(dialog.getByRole("alert")).toHaveText("Could not mark it out.");
    await dialog.getByLabel("Quantity").fill("4");
    await expect(dialog.getByRole("alert")).toHaveCount(0);
  });

  test("Save is disabled while Ran out is being saved", async ({ page, request }) => {
    const name = await newItem(request);
    const held = gate();
    await interceptCall(page, "inventory.markOut", { when: held.when });
    const dialog = await openEdit(page, name);
    try {
      await dialog.getByRole("button", { name: `Ran out: ${name}` }).click();
      await expect(dialog.getByRole("button", { name: "Save" })).toBeDisabled();
    } finally {
      held.release();
    }
    await expect(dialog).toHaveCount(0);
  });

  test("is disabled while it is being saved", async ({ page, request }) => {
    const name = await newItem(request);
    const held = gate();
    await interceptCall(page, "inventory.markOut", { when: held.when });
    const dialog = await openEdit(page, name);
    try {
      await dialog.getByRole("button", { name: `Ran out: ${name}` }).click();
      await expect(dialog.getByRole("button", { name: `Ran out: ${name}` })).toBeDisabled();
    } finally {
      held.release();
    }
    await expect(dialog).toHaveCount(0);
  });

  test("closing the dialog returns focus to the Edit button", async ({ page, request }) => {
    const name = await newItem(request);
    const dialog = await openEdit(page, name);
    await dialog.getByRole("button", { name: `Ran out: ${name}` }).click();
    await expect(dialog).toHaveCount(0);
    await expect(page.getByRole("button", { name: `Edit ${name}` })).toBeFocused();
  });

  test("has a 44px-tall button that fits the dialog, and keeps its contrast in dark mode", async ({
    page,
    request,
  }) => {
    const name = await newItem(request);
    await page.emulateMedia({ colorScheme: "dark" });
    const dialog = await openEdit(page, name);
    const button = dialog.getByRole("button", { name: `Ran out: ${name}` });
    expect((await button.boundingBox())?.height).toBeGreaterThanOrEqual(44);
    expect(await contrastOf(button)).toBeGreaterThanOrEqual(4.5);
  });

  test.describe("on a phone", () => {
    test.use({ viewport: { width: 375, height: 667 } });

    test("the dialog does not scroll sideways and the button stays inside the padding", async ({ page, request }) => {
      const name = await newItem(request);
      const dialog = await openEdit(page, name);
      await expect.poll(async () => (await dialog.boundingBox())?.y ?? 9999).toBeLessThan(400);
      expect(await dialog.evaluate((element) => element.scrollWidth - element.clientWidth)).toBeLessThanOrEqual(0);
      const box = await dialog.getByRole("button", { name: `Ran out: ${name}` }).boundingBox();
      expect((box?.x ?? 0) + (box?.width ?? 0)).toBeLessThanOrEqual(375 - DIALOG_PADDING + 1);
    });
  });
});

test.describe("a failed Remove item", () => {
  test("shows the error in the Edit dialog, which stays open, and the item stays", async ({ page, request }) => {
    const name = await newItem(request);
    await interceptCall(page, "inventory.archive", { answer: failure("Could not save. Try again.") });
    page.once("dialog", (confirm) => void confirm.accept());
    const dialog = await openEdit(page, name);
    await dialog.getByRole("button", { name: "Remove item" }).click();
    await expect(dialog.getByRole("alert")).toHaveText("Could not save. Try again. Refresh the list and try again.");
    // One message, in the dialog: nothing floats behind the modal where it cannot be reached.
    await expect(page.getByRole("alert")).toHaveCount(1);
    await dialog.getByRole("button", { name: "Cancel" }).click();
    await expect(row(page, name)).toBeVisible();
  });
});

test.describe("Bought it from the Edit dialog", () => {
  test("a failed restock shows its error in the restock dialog, and Cancel leaves the list as it was", async ({
    page,
    request,
  }) => {
    const name = await newItem(request);
    await interceptCall(page, "inventory.restock", { answer: failure("Could not save. Try again.") });
    const dialog = await openEdit(page, name);
    await dialog.getByRole("button", { name: `Bought it: ${name}` }).click();
    const restock = page.getByRole("dialog");
    await restock.getByRole("button", { name: "Save" }).click();
    await expect(restock).toContainText("Could not save. Try again.");
    await restock.getByRole("button", { name: "Cancel" }).click();
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await expect(row(page, name)).toBeVisible();
  });
});

test.describe("a long item name", () => {
  test("wraps inside the row at 360px and keeps its action inside the card", async ({ page, request }) => {
    const name = `Extra virgin cold pressed olive oil in the big tin ${randomUUID().slice(0, 8)}`;
    await seedItem(request, name);
    await page.setViewportSize({ width: 360, height: 800 });
    await page.goto("/stock?view=everything");
    const item = row(page, name);
    const box = (await item.boundingBox())!;
    const chip = (await item.getByText("On the list").boundingBox())!;
    expect(chip.x + chip.width).toBeLessThanOrEqual(box.x + box.width);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  });
});
