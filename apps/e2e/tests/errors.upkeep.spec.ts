import { expect, test } from "@playwright/test";
import { failure, interceptCall } from "./intercept";
import { clearUpkeep, daysAgo, seedTask, seedUpkeep, todayUtc } from "./scratch";
import { contrastOf } from "./contrast";

test.describe.configure({ mode: "serial", timeout: 60_000 });

test.beforeEach(async ({ request }) => {
  await clearUpkeep(request);
});

// The next spec in this project expects an empty list.
test.afterEach(async ({ request }) => {
  await clearUpkeep(request);
});

const overdue = (name: string) => ({ name, every: 1, unit: "weeks" as const, lastDoneOn: daysAgo(10) });

test.describe("error toasts", () => {
  test("a failed Done is a red toast above the bottom edge, not a line in the page", async ({ page, request }) => {
    await seedUpkeep(request, overdue("Fail job"));
    await interceptCall(page, "maintenance.markDone", { answer: failure("Could not save. Try again.") });
    await page.goto("/upkeep");
    await page.getByRole("button", { name: "Done: Fail job" }).click();
    const toast = page.getByRole("alert").filter({ hasText: "Could not save. Try again." });
    await expect(toast).toBeVisible();
    // At the bottom, so it never covers the buttons at the top of the page (Add job).
    const box = await toast.boundingBox();
    expect(box?.y).toBeGreaterThan((page.viewportSize()?.height ?? 0) / 2);
    await expect(page.getByRole("button", { name: "Add job" })).toBeVisible();
    expect(
      await page.getByRole("button", { name: "Add job" }).evaluate((element) => {
        const rect = element.getBoundingClientRect();
        return document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2) === element;
      }),
    ).toBe(true);
    // Floating over the page, not a line that moves the content.
    expect(await toast.evaluate((element) => getComputedStyle(element).position)).toBe("fixed");
  });

  test("it can be dismissed", async ({ page, request }) => {
    await seedUpkeep(request, overdue("Dismiss job"));
    await interceptCall(page, "maintenance.markDone", { answer: failure("Could not save. Try again.") });
    await page.goto("/upkeep");
    await page.getByRole("button", { name: "Done: Dismiss job" }).click();
    const toast = page.getByRole("alert").filter({ hasText: "Could not save. Try again." });
    await toast.getByRole("button", { name: "Dismiss" }).click();
    await expect(toast).toHaveCount(0);
  });

  test("it goes away by itself after a few seconds", async ({ page, request }) => {
    await seedUpkeep(request, overdue("Fade job"));
    await interceptCall(page, "maintenance.markDone", { answer: failure("Could not save. Try again.") });
    await page.goto("/upkeep");
    await page.getByRole("button", { name: "Done: Fade job" }).click();
    const toast = page.getByRole("alert").filter({ hasText: "Could not save. Try again." });
    await expect(toast).toBeVisible();
    await expect(toast).toBeHidden({ timeout: 15_000 });
  });

  test("it is readable: red ground with light or dark text at 4.5:1", async ({ page, request }) => {
    await seedUpkeep(request, overdue("Contrast job"));
    await interceptCall(page, "maintenance.markDone", { answer: failure("Could not save. Try again.") });
    await page.goto("/upkeep");
    await page.getByRole("button", { name: "Done: Contrast job" }).click();
    const toast = page.getByRole("alert").filter({ hasText: "Could not save. Try again." });
    await expect(toast).toBeVisible();
    expect(await contrastOf(toast)).toBeGreaterThanOrEqual(4.5);
  });

  test("it stays while the pointer is on it", async ({ page, request }) => {
    await seedUpkeep(request, overdue("Hold job"));
    await interceptCall(page, "maintenance.markDone", { answer: failure("Could not save. Try again.") });
    await page.goto("/upkeep");
    await page.getByRole("button", { name: "Done: Hold job" }).click();
    const toast = page.getByRole("alert").filter({ hasText: "Could not save. Try again." });
    await toast.hover();
    await page.waitForTimeout(9000);
    await expect(toast).toBeVisible();
  });

  test("the next failure shows a new toast after the first one was dismissed", async ({ page, request }) => {
    await seedUpkeep(request, overdue("Again job"));
    await interceptCall(page, "maintenance.markDone", { answer: failure("Could not save. Try again.") });
    await page.goto("/upkeep");
    const toast = page.getByRole("alert").filter({ hasText: "Could not save. Try again." });
    await page.getByRole("button", { name: "Done: Again job" }).click();
    await toast.getByRole("button", { name: "Dismiss" }).click();
    await page.getByRole("button", { name: "Done: Again job" }).click();
    await expect(toast).toBeVisible();
  });
});

test.describe("error toasts on the other pages", () => {
  const failed = (page: import("@playwright/test").Page) =>
    page.getByRole("alert").filter({ hasText: "Could not save. Try again." });

  test("Home: a failed task Done", async ({ page, request }) => {
    await seedTask(request, { title: "Home toast task", dueDate: todayUtc() });
    await interceptCall(page, "tasks.complete", { answer: failure("Could not save. Try again.") });
    await page.goto("/");
    await page.getByRole("button", { name: "Mark Home toast task done" }).click();
    await expect(failed(page)).toBeVisible();
    expect(await failed(page).evaluate((element) => getComputedStyle(element).position)).toBe("fixed");
  });

  test("Schedule: a failed task Done", async ({ page, request }) => {
    await seedTask(request, { title: "Schedule toast task", dueDate: todayUtc() });
    await interceptCall(page, "tasks.complete", { answer: failure("Could not save. Try again.") });
    await page.goto("/schedule");
    await page.getByRole("button", { name: "Mark Schedule toast task done" }).click();
    await expect(failed(page)).toBeVisible();
    expect(await failed(page).evaluate((element) => getComputedStyle(element).position)).toBe("fixed");
  });

  test("People: a failed add is a toast, a blank name stays beside the field", async ({ page }) => {
    await interceptCall(page, "people.add", { answer: failure("Could not save. Try again.") });
    await page.goto("/people");
    await page.getByRole("button", { name: "Add", exact: true }).click();
    await expect(page.getByRole("alert")).toHaveCount(1);
    await expect(page.getByRole("alert")).not.toHaveCSS("position", "fixed");
    await page.getByLabel("Add a person").fill("Toast person");
    await page.getByRole("button", { name: "Add", exact: true }).click();
    await expect(failed(page)).toBeVisible();
    expect(await failed(page).evaluate((element) => getComputedStyle(element).position)).toBe("fixed");
  });
});

test.describe("error toast in dark mode", () => {
  test.use({ colorScheme: "dark" });

  test("is readable in dark mode too", async ({ page, request }) => {
    await seedUpkeep(request, overdue("Dark job"));
    await interceptCall(page, "maintenance.markDone", { answer: failure("Could not save. Try again.") });
    await page.goto("/upkeep");
    await page.getByRole("button", { name: "Done: Dark job" }).click();
    const toast = page.getByRole("alert").filter({ hasText: "Could not save. Try again." });
    await expect(toast).toBeVisible();
    expect(await contrastOf(toast)).toBeGreaterThanOrEqual(4.5);
  });
});
