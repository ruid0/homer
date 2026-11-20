import { expect, test, type Page } from "@playwright/test";
import { contrastOf } from "./contrast";
import { failure, gate, interceptCall } from "./intercept";
import { clearUpkeep, daysAgo, doneDates, seedUpkeep, todayUtc } from "./scratch";

test.describe.configure({ mode: "serial", timeout: 60_000 });

test.beforeEach(async ({ request }) => {
  await clearUpkeep(request);
});

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

// A date the way the app writes it: the year only when it is not this year.
const written = (daysFromToday: number): string => {
  const date = new Date(Date.parse(todayUtc()) + daysFromToday * 86_400_000);
  const year = date.getUTCFullYear() === Number(todayUtc().slice(0, 4)) ? "" : ` ${date.getUTCFullYear()}`;
  return `${date.getUTCDate()} ${MONTHS[date.getUTCMonth()]}${year}`;
};

// A weekly job last done 10 days ago: overdue, so it sits under Due now.
const dueToday = (name: string) => ({ name, every: 1, unit: "weeks" as const, lastDoneOn: daysAgo(10) });

const row = (page: Page, name: string) =>
  page.getByRole("listitem").filter({ has: page.getByText(name, { exact: true }) });
const toastOf = (page: Page, name: string) => page.getByRole("status").filter({ hasText: `${name} done` });

const markDone = async (page: Page, name: string) => {
  await page.goto("/upkeep");
  await row(page, name)
    .getByRole("button", { name: `Done: ${name}` })
    .click();
};

test.describe("the toast after Done", () => {
  test("says the job is done today and when it is next due, with Undo", async ({ page, request }) => {
    await seedUpkeep(request, dueToday("Filter job"));
    await markDone(page, "Filter job");
    await expect(toastOf(page, "Filter job")).toHaveText(
      new RegExp(`^Filter job done today\\. Next due ${written(7)}\\.`),
    );
    await expect(toastOf(page, "Filter job").getByRole("button", { name: "Undo" })).toBeVisible();
  });

  test("does not suggest an earlier day", async ({ page, request }) => {
    await seedUpkeep(request, dueToday("Plain job"));
    await markDone(page, "Plain job");
    await expect(toastOf(page, "Plain job")).toBeVisible();
    await expect(page.getByText("Done earlier?")).toHaveCount(0);
    for (const label of ["Yesterday", "2 days ago", "A week ago"])
      await expect(toastOf(page, "Plain job").getByRole("button", { name: label })).toHaveCount(0);
  });

  test("Undo removes the done date and the toast goes", async ({ page, request }) => {
    const { id } = await seedUpkeep(request, dueToday("Undo job"));
    await markDone(page, "Undo job");
    await toastOf(page, "Undo job").getByRole("button", { name: "Undo" }).click();
    await expect(toastOf(page, "Undo job")).toHaveCount(0);
    expect(await doneDates(request, id)).toEqual([daysAgo(10)]);
  });

  test("a failed Undo shows a red error toast and keeps the Undo toast", async ({ page, request }) => {
    await seedUpkeep(request, dueToday("Stuck job"));
    await markDone(page, "Stuck job");
    await interceptCall(page, "maintenance.undoDone", { answer: failure("Could not undo. Try again.") });
    await toastOf(page, "Stuck job").getByRole("button", { name: "Undo" }).click();
    await expect(page.getByRole("alert").filter({ hasText: "Could not undo. Try again." })).toBeVisible();
    await expect(toastOf(page, "Stuck job")).toBeVisible();
  });

  test("a job done today has no Done button and waits under Later, and is not on the Home card", async ({
    page,
    request,
  }) => {
    // Weekly and done today: due in 7 days, but it has just been done, so it waits under Later.
    const { id } = await seedUpkeep(request, { name: "Today job", every: 1, unit: "weeks", lastDoneOn: todayUtc() });
    await seedUpkeep(request, dueToday("Other job"));
    await page.goto("/upkeep");
    await expect(page.getByRole("region", { name: "Later" }).getByText("Today job", { exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "Done: Today job" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Done: Other job" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Edit Today job" })).toBeVisible();
    await page.goto("/");
    await expect(page.getByRole("region", { name: "Upkeep" }).getByText("Other job")).toBeVisible();
    await expect(page.getByRole("region", { name: "Upkeep" }).getByText("Today job")).toHaveCount(0);
    expect(await doneDates(request, id)).toEqual([todayUtc()]);
  });

  test("the Done button leaves the row the moment the job is done", async ({ page, request }) => {
    await seedUpkeep(request, dueToday("Gone job"));
    await markDone(page, "Gone job");
    await expect(page.getByRole("button", { name: "Done: Gone job" })).toHaveCount(0);
    await expect(row(page, "Gone job")).toContainText("Last done");
  });

  test("the Home card gives the same toast", async ({ page, request }) => {
    await seedUpkeep(request, dueToday("Home job"));
    await page.goto("/");
    await page.getByRole("button", { name: "Done: Home job" }).click();
    await expect(toastOf(page, "Home job")).toContainText(`done today. Next due ${written(7)}`);
  });

  test.describe("on a phone", () => {
    test.use({ viewport: { width: 375, height: 667 } });

    test("the toast fits the screen, with Undo and Dismiss inside it", async ({ page, request }) => {
      await seedUpkeep(request, dueToday("Phone job"));
      await markDone(page, "Phone job");
      const toast = toastOf(page, "Phone job");
      await expect(toast.getByRole("button", { name: "Undo" })).toBeVisible();
      const box = await toast.boundingBox();
      expect(box?.x).toBeGreaterThanOrEqual(0);
      expect((box?.x ?? 0) + (box?.width ?? 0)).toBeLessThanOrEqual(375);
      for (const name of ["Undo", "Dismiss"]) {
        const inside = await toast.getByRole("button", { name }).boundingBox();
        expect(inside?.x).toBeGreaterThanOrEqual(box?.x ?? 0);
        expect((inside?.x ?? 0) + (inside?.width ?? 0)).toBeLessThanOrEqual((box?.x ?? 0) + (box?.width ?? 0) + 0.5);
      }
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(375);
    });
  });
});

test.describe("Done is instant", () => {
  const region = (page: Page, name: string) => page.getByRole("region", { name });

  test("the row moves to Later before the api has answered", async ({ page, request }) => {
    // Every two weeks, so done today puts it 14 days out, under Later (a week out still counts as due soon).
    await seedUpkeep(request, { name: "Quick job", every: 2, unit: "weeks", lastDoneOn: daysAgo(15) });
    await seedUpkeep(request, { name: "Other job", every: 6, unit: "months", lastDoneOn: daysAgo(10) });
    await page.goto("/upkeep");
    await expect(region(page, "Due now").getByText("Quick job", { exact: true })).toBeVisible();
    const held = gate();
    await interceptCall(page, "maintenance.markDone", { when: held.when });
    try {
      await row(page, "Quick job").getByRole("button", { name: "Done: Quick job" }).click();
      await expect(region(page, "Due now").getByText("Quick job", { exact: true })).toHaveCount(0);
      await expect(region(page, "Later").getByText("Quick job", { exact: true })).toBeVisible();
      await expect(toastOf(page, "Quick job")).toHaveCount(0);
    } finally {
      held.release();
    }
    await expect(toastOf(page, "Quick job")).toBeVisible();
    await expect(region(page, "Later").getByText("Quick job", { exact: true })).toBeVisible();
  });

  test("after a slow save, focus moves on to the next Done button, not back to the top", async ({ page, request }) => {
    await seedUpkeep(request, dueToday("First slow"));
    await seedUpkeep(request, { name: "Second slow", every: 1, unit: "weeks", lastDoneOn: daysAgo(11) });
    await page.goto("/upkeep");
    const held = gate();
    await interceptCall(page, "maintenance.markDone", { when: held.when });
    try {
      await row(page, "Second slow").getByRole("button", { name: "Done: Second slow" }).click();
    } finally {
      held.release();
    }
    await expect(toastOf(page, "Second slow")).toBeVisible();
    await expect(page.locator("[data-done-action]:focus")).toHaveAttribute("aria-label", "Done: First slow");
  });

  test("a failed Done puts the row back under Due now and says why", async ({ page, request }) => {
    const { id } = await seedUpkeep(request, dueToday("Rollback job"));
    await page.goto("/upkeep");
    await interceptCall(page, "maintenance.markDone", { answer: failure("The api is not answering.") });
    await row(page, "Rollback job").getByRole("button", { name: "Done: Rollback job" }).click();
    await expect(page.getByRole("alert")).toContainText("The api is not answering.");
    await expect(region(page, "Due now").getByText("Rollback job", { exact: true })).toBeVisible();
    await expect(toastOf(page, "Rollback job")).toHaveCount(0);
    await expect(row(page, "Rollback job").getByRole("button", { name: "Done: Rollback job" })).toBeEnabled();
    expect(await doneDates(request, id)).toEqual([daysAgo(10)]);
  });

  test("a failed Done on the Home card puts the row back too", async ({ page, request }) => {
    await seedUpkeep(request, dueToday("Home rollback"));
    await page.goto("/");
    await interceptCall(page, "maintenance.markDone", { answer: failure("The api is not answering.") });
    await page.getByRole("button", { name: "Done: Home rollback" }).click();
    await expect(page.getByRole("alert")).toContainText("The api is not answering.");
    await expect(page.getByRole("button", { name: "Done: Home rollback" })).toBeVisible();
  });
});

test.describe("the empty page", () => {
  const starters = (page: Page) => page.getByRole("list").getByRole("button");

  test("offers the five suggestions with how often, and says nothing is saved by tapping", async ({ page }) => {
    await page.goto("/upkeep");
    await expect(page.getByText(/^Nothing here yet/)).toBeVisible();
    await expect(starters(page)).toHaveCount(5);
    await expect(page.getByRole("button", { name: /^Furnace filter/ })).toContainText("Every 3 months");
    await expect(page.getByRole("button", { name: /^Water softener salt/ })).toContainText("Every month");
    await expect(page.getByRole("button", { name: /^Dryer vent/ })).toContainText("Every year");
    await expect(page.getByText(/Nothing is saved until you save it/)).toBeVisible();
  });

  test("a suggestion opens Add job with the name and cycle filled in, and Cancel saves nothing", async ({
    page,
    request,
  }) => {
    await page.goto("/upkeep");
    await page.getByRole("button", { name: /^Smoke alarm batteries/ }).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog.getByRole("textbox", { name: "Name" })).toHaveValue("Smoke alarm batteries");
    await expect(dialog.getByRole("spinbutton", { name: "Every" })).toHaveValue("6");
    await expect(
      dialog
        .locator("label")
        .filter({ hasText: /^months$/i })
        .locator("input"),
    ).toBeChecked();
    await dialog.getByRole("button", { name: "Cancel" }).click();
    await expect(starters(page)).toHaveCount(5);
    const list = await request.get(
      `/trpc/maintenance.list?input=${encodeURIComponent(JSON.stringify({ today: todayUtc() }))}`,
    );
    expect(((await list.json()) as { result: { data: unknown[] } }).result.data).toHaveLength(0);
  });

  test("a twelve month suggestion shows as one year, and saving it makes the job", async ({ page }) => {
    await page.goto("/upkeep");
    await page.getByRole("button", { name: /^Dryer vent/ }).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog.getByRole("spinbutton", { name: "Every" })).toHaveValue("1");
    await expect(
      dialog
        .locator("label")
        .filter({ hasText: /^years$/i })
        .locator("input"),
    ).toBeChecked();
    await dialog.getByRole("button", { name: "Save" }).click();
    await expect(dialog).toHaveCount(0);
    await expect(page.getByText("Dryer vent", { exact: true })).toBeVisible();
    await expect(page.getByText(/^Nothing here yet/)).toHaveCount(0);
  });

  test("Add job on an empty page still starts blank, and the suggestions leave once a job exists", async ({
    page,
    request,
  }) => {
    await page.goto("/upkeep");
    await page.getByRole("button", { name: /^Fridge coils/ }).click();
    await page.getByRole("dialog").getByRole("button", { name: "Cancel" }).click();
    await page.getByRole("button", { name: "Add job", exact: true }).click();
    await expect(page.getByRole("dialog").getByRole("textbox", { name: "Name" })).toHaveValue("");
    await page.getByRole("dialog").getByRole("button", { name: "Cancel" }).click();
    await seedUpkeep(request, dueToday("Now a job"));
    await page.reload();
    await expect(page.getByRole("button", { name: /^Furnace filter/ })).toHaveCount(0);
  });

  test("the suggestions are 44px tall, readable and reachable by keyboard", async ({ page }) => {
    await page.goto("/upkeep");
    const first = page.getByRole("button", { name: /^Furnace filter/ });
    expect((await first.boundingBox())?.height).toBeGreaterThanOrEqual(44);
    expect(await contrastOf(first.locator("span").last())).toBeGreaterThanOrEqual(4.5);
    await first.focus();
    await page.keyboard.press("Enter");
    await expect(page.getByRole("dialog").getByRole("textbox", { name: "Name" })).toHaveValue("Furnace filter");
  });

  test.describe("on a phone", () => {
    test.use({ viewport: { width: 375, height: 667 } });

    test("every suggestion fits the width without scrolling sideways", async ({ page }) => {
      await page.goto("/upkeep");
      await expect(starters(page)).toHaveCount(5);
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(375);
      for (const button of await starters(page).all()) {
        const box = await button.boundingBox();
        expect((box?.x ?? 0) + (box?.width ?? 0)).toBeLessThanOrEqual(375);
      }
    });
  });
});
