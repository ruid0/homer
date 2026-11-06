import { expect, test, type Page } from "@playwright/test";
import { contrastOf } from "./contrast";
import { failure, gate, interceptCall } from "./intercept";
import { clearUpkeep, daysAgo, seedUpkeep } from "./scratch";

const RETRIES = { timeout: 20_000 };

test.describe.configure({ mode: "serial", timeout: 60_000 });

test.beforeEach(async ({ request }) => {
  await clearUpkeep(request);
});

const card = (page: Page) => page.getByRole("region", { name: "Due soon" });

// Due today, and after Done due in two weeks, so it leaves the card.
const fortnightly = (name: string) => ({ name, every: 2, unit: "weeks" as const, lastDoneOn: daysAgo(14) });

const weekly = (name: string, lastDoneDaysAgo: number) => ({ name, every: 1, unit: "weeks" as const, lastDoneOn: daysAgo(lastDoneDaysAgo) });

test.describe("the Due soon card on Home", () => {
  test("says nothing is due when the list is empty or everything is later", async ({ page, request }) => {
    await page.goto("/");
    await expect(card(page).getByText("Nothing due.")).toBeVisible();
    await seedUpkeep(request, { name: "Far job", every: 6, unit: "months", lastDoneOn: daysAgo(10) });
    await page.reload();
    await expect(card(page).getByText("Nothing due.")).toBeVisible();
    await expect(card(page).getByText("Far job")).toHaveCount(0);
  });

  test("shows a loading line, not the empty one, while the list loads", async ({ page, request }) => {
    await seedUpkeep(request, weekly("Held job", 7));
    const held = gate();
    await interceptCall(page, "maintenance.list", { when: held.when });
    try {
      await page.goto("/");
      await expect(card(page).getByRole("status")).toHaveText("Loading.");
      await expect(card(page).getByText("Nothing due.")).toHaveCount(0);
    } finally {
      held.release();
    }
    await expect(card(page).getByText("Held job", { exact: true })).toBeVisible();
  });

  test("says so when the list cannot be loaded, and not that nothing is due", async ({ page }) => {
    await interceptCall(page, "maintenance.list", { answer: failure("down") });
    await page.goto("/");
    await expect(card(page).getByRole("alert")).toHaveText(/Couldn't load what is due/, RETRIES);
    await expect(card(page).getByText("Nothing due.")).toHaveCount(0);
  });

  test("lists what is overdue, due today and due this week in words, most urgent first", async ({ page, request }) => {
    await seedUpkeep(request, weekly("Overdue job", 20));
    await seedUpkeep(request, weekly("Today job", 7));
    await seedUpkeep(request, weekly("Soon job", 5));
    await page.goto("/");
    const names = await card(page).getByRole("listitem").evaluateAll((rows) => rows.map((row) => row.querySelector("p")?.textContent));
    expect(names).toEqual(["Overdue job", "Today job", "Soon job"]);
    await expect(card(page)).toContainText("13 days overdue");
    await expect(card(page)).toContainText("Due today");
    await expect(card(page)).toContainText("Due in 2 days");
  });

  test("Done moves the item off the card, and Undo brings it back", async ({ page, request }) => {
    await seedUpkeep(request, fortnightly("Today job"));
    await page.goto("/");
    await card(page).getByRole("button", { name: "Done: Today job" }).click();
    const toast = page.getByRole("status").filter({ hasText: "Today job marked done." });
    await expect(toast).toBeVisible();
    await expect(card(page).getByText("Nothing due.")).toBeVisible();
    await toast.getByRole("button", { name: "Undo" }).click();
    await expect(card(page).getByText("Today job", { exact: true })).toBeVisible();
  });

  test("shows the error and keeps the item when Done fails", async ({ page, request }) => {
    await seedUpkeep(request, weekly("Today job", 7));
    await interceptCall(page, "maintenance.markDone", { answer: failure("Could not mark it done.") });
    await page.goto("/");
    await card(page).getByRole("button", { name: "Done: Today job" }).click();
    await expect(card(page).getByRole("alert")).toHaveText("Could not mark it done.");
    await expect(card(page).getByText("Today job", { exact: true })).toBeVisible();
  });

  test("Done is disabled while the done is being saved", async ({ page, request }) => {
    await seedUpkeep(request, fortnightly("Today job"));
    const held = gate();
    await interceptCall(page, "maintenance.markDone", { when: held.when });
    await page.goto("/");
    try {
      await card(page).getByRole("button", { name: "Done: Today job" }).click();
      await expect(card(page).getByRole("button", { name: "Done: Today job" })).toBeDisabled();
    } finally {
      held.release();
    }
    await expect(card(page).getByText("Nothing due.")).toBeVisible();
  });

  test("the Done button is at least 44px tall and keyboard reachable", async ({ page, request }) => {
    await seedUpkeep(request, weekly("Today job", 7));
    await page.goto("/");
    const done = card(page).getByRole("button", { name: "Done: Today job" });
    expect((await done.boundingBox())?.height).toBeGreaterThanOrEqual(44);
    await done.focus();
    await expect(done).toBeFocused();
  });

  test.describe("on a phone", () => {
    test.use({ viewport: { width: 375, height: 700 } });

    test("the card fits the width and its button can be reached", async ({ page, request }) => {
      await seedUpkeep(request, weekly("Long name ".repeat(7).trim().slice(0, 80), 20));
      await page.goto("/");
      await card(page).scrollIntoViewIfNeeded();
      await expect(card(page).getByRole("button", { name: /^Done: Long name/ })).toBeInViewport();
      expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0);
    });
  });

  for (const scheme of ["light", "dark"] as const) {
    test(`in ${scheme} mode the due words are readable`, async ({ page, request }) => {
      await seedUpkeep(request, weekly("Overdue job", 20));
      await seedUpkeep(request, weekly("Soon job", 5));
      await page.emulateMedia({ colorScheme: scheme });
      await page.goto("/");
      for (const text of [card(page).getByText("13 days overdue"), card(page).getByText("Due in 2 days"), card(page).getByRole("heading", { name: "Due soon" })]) {
        expect(await contrastOf(text)).toBeGreaterThanOrEqual(4.5);
      }
    });
  }
});
