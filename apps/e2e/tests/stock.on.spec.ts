import { expect, test, type Page } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { contrastOf } from "./contrast";
import { failure, gate, interceptCall } from "./intercept";
import { seedListEntry, seedStocked } from "./scratch";

const unique = (label: string) => `${label} ${randomUUID().slice(0, 8)}`;

const view = (page: Page) => page.getByRole("group", { name: "View" });
const toBuy = (page: Page) => view(page).getByRole("button", { name: /^To buy/ });
const everything = (page: Page) => view(page).getByRole("button", { name: /^Everything/ });
const row = (page: Page, name: string) =>
  page.getByRole("listitem").filter({ has: page.getByText(name, { exact: true }) });

const countOf = async (button: ReturnType<typeof toBuy>) =>
  Number(/\((\d+)\)/.exec((await button.textContent()) ?? "")?.[1]);

test.describe("the two views", () => {
  test("opens on To buy, and the switch changes the view and the address", async ({ page, request }) => {
    const text = unique("Hand entry");
    await seedListEntry(request, text);
    await page.goto("/stock");
    await expect(page.getByRole("heading", { level: 1, name: "Stock" })).toBeVisible();
    await expect(toBuy(page)).toHaveAttribute("aria-pressed", "true");
    await expect(everything(page)).toHaveAttribute("aria-pressed", "false");
    await expect(row(page, text)).toBeVisible();
    await expect(page.getByLabel("Add to the list")).toBeVisible();

    await everything(page).click();
    await expect(page).toHaveURL(/\/stock\?view=everything$/);
    await expect(everything(page)).toHaveAttribute("aria-pressed", "true");
    await expect(page.getByRole("button", { name: "Add item" })).toBeVisible();
    await expect(page.getByLabel("Add to the list")).toHaveCount(0);

    await toBuy(page).click();
    await expect(page).toHaveURL(/\/stock$/);
    await expect(toBuy(page)).toHaveAttribute("aria-pressed", "true");
  });

  test("the Back button returns to the other view", async ({ page }) => {
    await page.goto("/stock");
    await everything(page).click();
    await page.goBack();
    await expect(toBuy(page)).toHaveAttribute("aria-pressed", "true");
  });

  test("the old addresses open the right view", async ({ page }) => {
    await page.goto("/groceries");
    await expect(page).toHaveURL(/\/stock$/);
    await expect(toBuy(page)).toHaveAttribute("aria-pressed", "true");
    await page.goto("/items");
    await expect(page).toHaveURL(/\/stock\?view=everything$/);
    await expect(everything(page)).toHaveAttribute("aria-pressed", "true");
  });

  test("each button says how many it holds, and a new entry adds one to To buy", async ({ page }) => {
    await page.goto("/stock");
    await expect(toBuy(page)).toHaveText(/^To buy \(\d+\)$/);
    await expect(everything(page)).toHaveText(/^Everything \(\d+\)$/);
    const before = await countOf(toBuy(page));
    await page.getByLabel("Add to the list").fill(unique("Counted"));
    await page.getByRole("button", { name: "Add", exact: true }).click();
    // Other tests add entries to the same list at the same time, so the count can only be said to have grown.
    await expect.poll(() => countOf(toBuy(page))).toBeGreaterThanOrEqual(before + 1);
  });

  test("a free-text entry is in To buy and not in Everything", async ({ page, request }) => {
    const text = unique("Charcoal");
    await seedListEntry(request, text);
    await page.goto("/stock");
    await expect(row(page, text)).toBeVisible();
    await everything(page).click();
    await expect(page.getByText(text, { exact: true })).toHaveCount(0);
  });
});

test.describe("Add to list", () => {
  test("puts a tracked item on the list, and then says so", async ({ page, request }) => {
    const name = unique("Rice");
    await seedStocked(request, name);
    await page.goto("/stock?view=everything");
    const item = row(page, name);
    await expect(item).not.toContainText("On the list");
    await item.getByRole("button", { name: `Add ${name} to the list` }).click();
    await expect(item).toContainText("On the list");
    await expect(item.getByRole("button", { name: `Add ${name} to the list` })).toHaveCount(0);
    await toBuy(page).click();
    await expect(row(page, name)).toBeVisible();
  });

  test("a failed add is a red toast and the button stays", async ({ page, request }) => {
    const name = unique("Flour");
    await seedStocked(request, name);
    await interceptCall(page, "groceries.add", { answer: failure("Could not save. Try again.") });
    await page.goto("/stock?view=everything");
    const item = row(page, name);
    await item.getByRole("button", { name: `Add ${name} to the list` }).click();
    await expect(page.getByRole("alert").filter({ hasText: "Could not save. Try again." })).toBeVisible();
    await expect(item.getByRole("button", { name: `Add ${name} to the list` })).toBeVisible();
    await expect(item).not.toContainText("On the list");
  });
});

test.describe("Add to list while saving", () => {
  test("only the row being saved is disabled", async ({ page, request }) => {
    const first = unique("Pasta");
    const second = unique("Beans");
    await seedStocked(request, first);
    await seedStocked(request, second);
    const held = gate();
    await interceptCall(page, "groceries.add", { when: held.when });
    await page.goto("/stock?view=everything");
    try {
      await row(page, first)
        .getByRole("button", { name: `Add ${first} to the list` })
        .click();
      await expect(row(page, first).getByRole("button", { name: `Add ${first} to the list` })).toBeDisabled();
      await expect(row(page, second).getByRole("button", { name: `Add ${second} to the list` })).toBeEnabled();
    } finally {
      held.release();
    }
    await expect(row(page, first)).toContainText("On the list");
  });
});

test.describe("loading and failing", () => {
  test("when the list cannot load, To buy says so and the button has no count", async ({ page }) => {
    await interceptCall(page, "groceries.list", { answer: failure("down") });
    await page.goto("/stock");
    await expect(page.getByRole("alert").filter({ hasText: "Couldn't load the list" })).toBeVisible({
      timeout: 15_000,
    });
    await expect(toBuy(page)).toHaveText("To buy");
  });

  test("when the items cannot load, Everything says so and the button has no count", async ({ page }) => {
    await interceptCall(page, "inventory.list", { answer: failure("down") });
    await page.goto("/stock?view=everything");
    await expect(page.getByRole("alert").filter({ hasText: "Couldn't load items" })).toBeVisible({ timeout: 15_000 });
    await expect(everything(page)).toHaveText("Everything");
  });
});

test("the pressed button of the switch is filled, the other is not", async ({ page }) => {
  await page.goto("/stock");
  const fill = (button: ReturnType<typeof toBuy>) =>
    button.evaluate((element) => getComputedStyle(element).backgroundColor);
  const pressed = await fill(toBuy(page));
  const other = await fill(everything(page));
  expect(pressed).not.toBe(other);
  await everything(page).click();
  await expect.poll(() => fill(everything(page))).toBe(pressed);
});

test.describe("the bottom bar", () => {
  test("has Stock, and no Items or Groceries", async ({ page }) => {
    await page.goto("/stock");
    const nav = page.getByRole("navigation", { name: "Main" });
    await expect(nav.getByRole("link", { name: "Stock" })).toHaveAttribute("aria-current", "page");
    await expect(nav.getByRole("link", { name: "Items" })).toHaveCount(0);
    await expect(nav.getByRole("link", { name: "Groceries" })).toHaveCount(0);
  });
});

test.describe("on a phone", () => {
  test.use({ viewport: { width: 360, height: 740 } });

  test("the switch is 44px tall, fits the width, and a row with three buttons stays on screen", async ({
    page,
    request,
  }) => {
    const name = unique("Dishwasher tablets with a long name");
    await seedStocked(request, name);
    await page.goto("/stock?view=everything");
    for (const button of [toBuy(page), everything(page)]) {
      const box = await button.boundingBox();
      expect(box!.height).toBeGreaterThanOrEqual(44);
      expect(box!.x + box!.width).toBeLessThanOrEqual(360);
    }
    const item = row(page, name);
    for (const button of await item.getByRole("button").all()) {
      const box = (await button.boundingBox())!;
      expect(box.x + box.width).toBeLessThanOrEqual(360);
      expect(box.height).toBeGreaterThanOrEqual(44);
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  });
});

for (const scheme of ["light", "dark"] as const) {
  test(`in ${scheme} mode both buttons of the switch are readable`, async ({ page }) => {
    await page.emulateMedia({ colorScheme: scheme });
    await page.goto("/stock");
    expect(await contrastOf(toBuy(page))).toBeGreaterThanOrEqual(4.5);
    expect(await contrastOf(everything(page))).toBeGreaterThanOrEqual(4.5);
  });
}
