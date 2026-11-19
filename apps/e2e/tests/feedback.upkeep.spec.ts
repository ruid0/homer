import { expect, test, type Page } from "@playwright/test";
import { contrastOf } from "./contrast";
import { failure, gate, interceptCall } from "./intercept";
import { clearUpkeep, daysAgo, doneDates, seedDone, seedUpkeep, todayUtc } from "./scratch";

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

// A weekly job last done 10 days ago: overdue, so it sits under Due now, and no chip lands on its done date.
const dueToday = (name: string) => ({ name, every: 1, unit: "weeks" as const, lastDoneOn: daysAgo(10) });

const row = (page: Page, name: string) => page.getByRole("listitem").filter({ has: page.getByText(name, { exact: true }) });
const toastOf = (page: Page, name: string) => page.getByRole("status").filter({ hasText: `${name} done` });
const earlierChip = (page: Page, name: string, label: string) => toastOf(page, name).getByRole("button", { name: label });

const markDone = async (page: Page, name: string) => {
  await page.goto("/upkeep");
  await row(page, name).getByRole("button", { name: `Done: ${name}` }).click();
};

test.describe("the toast after Done", () => {
  test("says the job is done and when it is next due", async ({ page, request }) => {
    await seedUpkeep(request, dueToday("Filter job"));
    await markDone(page, "Filter job");
    await expect(toastOf(page, "Filter job")).toHaveText(new RegExp(`^Filter job done\\. Next due ${written(7)}\\.`));
  });

  test("offers Yesterday, 2 days ago and A week ago under Done earlier?", async ({ page, request }) => {
    await seedUpkeep(request, dueToday("Chip job"));
    await markDone(page, "Chip job");
    const group = toastOf(page, "Chip job").getByRole("group", { name: "Done earlier?" });
    await expect(group.getByRole("button")).toHaveText(["Yesterday", "2 days ago", "A week ago"]);
  });

  test("a chip moves the done date back, updates the toast and keeps Undo", async ({ page, request }) => {
    const { id } = await seedUpkeep(request, dueToday("Moved job"));
    await markDone(page, "Moved job");
    await earlierChip(page, "Moved job", "2 days ago").click();
    await expect(toastOf(page, "Moved job")).toHaveText(new RegExp(`^Moved job done ${written(-2)}\\. Next due ${written(5)}\\.`));
    // The chip just used is not offered again; the others stay.
    await expect(earlierChip(page, "Moved job", "2 days ago")).toHaveCount(0);
    await expect(earlierChip(page, "Moved job", "Yesterday")).toBeVisible();
    await expect(toastOf(page, "Moved job").getByRole("button", { name: "Undo" })).toBeVisible();
    expect(await doneDates(request, id)).toEqual([daysAgo(2), daysAgo(10)]);
    await expect(row(page, "Moved job")).toContainText("Due in 5 days");
  });

  test("Undo after a chip removes that done date", async ({ page, request }) => {
    const { id } = await seedUpkeep(request, dueToday("Undo job"));
    await markDone(page, "Undo job");
    await earlierChip(page, "Undo job", "A week ago").click();
    await expect(toastOf(page, "Undo job")).toContainText(`done ${written(-7)}`);
    await toastOf(page, "Undo job").getByRole("button", { name: "Undo" }).click();
    await expect(toastOf(page, "Undo job")).toHaveCount(0);
    expect(await doneDates(request, id)).toEqual([daysAgo(10)]);
  });

  test("a day that already has a done date is refused in words, and the toast stays", async ({ page, request }) => {
    const { id } = await seedUpkeep(request, dueToday("Twice job"));
    await seedDone(request, id, daysAgo(1));
    await markDone(page, "Twice job");
    await earlierChip(page, "Twice job", "Yesterday").click();
    await expect(page.getByRole("alert")).toHaveText("Twice job is already marked done on that day.");
    await expect(toastOf(page, "Twice job").getByRole("button", { name: "Undo" })).toBeVisible();
    expect(await doneDates(request, id)).toEqual([todayUtc(), daysAgo(1), daysAgo(10)]);
  });

  test("a failed move shows the error and leaves the done date as it was", async ({ page, request }) => {
    const { id } = await seedUpkeep(request, dueToday("Failing job"));
    await markDone(page, "Failing job");
    await interceptCall(page, "maintenance.redateDone", { answer: failure("The api is not answering.") });
    await earlierChip(page, "Failing job", "Yesterday").click();
    await expect(page.getByRole("alert")).toContainText("The api is not answering.");
    await expect(toastOf(page, "Failing job")).toContainText(`Next due ${written(7)}`);
    await expect(earlierChip(page, "Failing job", "Yesterday")).toBeEnabled();
    expect(await doneDates(request, id)).toEqual([todayUtc(), daysAgo(10)]);
  });

  test("the chips are held while a move is on its way", async ({ page, request }) => {
    await seedUpkeep(request, dueToday("Held job"));
    await markDone(page, "Held job");
    const held = gate();
    await interceptCall(page, "maintenance.redateDone", { when: held.when });
    try {
      await earlierChip(page, "Held job", "Yesterday").click();
      await expect(earlierChip(page, "Held job", "A week ago")).toBeDisabled();
      // Undo waits too, so it cannot race the move.
      await expect(toastOf(page, "Held job").getByRole("button", { name: "Undo" })).toBeDisabled();
    } finally {
      held.release();
    }
    await expect(toastOf(page, "Held job")).toContainText(`done ${written(-1)}`);
  });

  test("the chips stay readable in dark mode", async ({ page, request }) => {
    await page.emulateMedia({ colorScheme: "dark" });
    await seedUpkeep(request, dueToday("Dark job"));
    await markDone(page, "Dark job");
    const chip = earlierChip(page, "Dark job", "Yesterday");
    await expect(chip).toBeVisible();
    expect(await contrastOf(chip)).toBeGreaterThanOrEqual(4.5);
    expect(await contrastOf(toastOf(page, "Dark job").getByRole("button", { name: "Undo" }))).toBeGreaterThanOrEqual(4.5);
  });

  test("the toast stays up while a chip has focus, so a slow tap is not lost", async ({ page, request }) => {
    await seedUpkeep(request, dueToday("Slow job"));
    await markDone(page, "Slow job");
    await page.clock.install();
    await earlierChip(page, "Slow job", "Yesterday").focus();
    await page.clock.fastForward(20_000);
    await expect(earlierChip(page, "Slow job", "Yesterday")).toBeVisible();
  });

  test("the chips are 44px tall, readable, and reachable by keyboard", async ({ page, request }) => {
    await seedUpkeep(request, dueToday("Keys job"));
    await markDone(page, "Keys job");
    const chip = earlierChip(page, "Keys job", "Yesterday");
    expect((await chip.boundingBox())?.height).toBeGreaterThanOrEqual(44);
    expect(await contrastOf(chip)).toBeGreaterThanOrEqual(4.5);
    await chip.focus();
    await page.keyboard.press("Enter");
    await expect(toastOf(page, "Keys job")).toContainText(`done ${written(-1)}`);
  });

  test("choosing again keeps working: each chip leaves only while its date is the chosen one", async ({ page, request }) => {
    await seedUpkeep(request, dueToday("Plain job"));
    await markDone(page, "Plain job");
    await earlierChip(page, "Plain job", "Yesterday").click();
    await earlierChip(page, "Plain job", "2 days ago").click();
    await earlierChip(page, "Plain job", "A week ago").click();
    await expect(toastOf(page, "Plain job")).toContainText(`done ${written(-7)}`);
    await expect(toastOf(page, "Plain job").getByRole("group", { name: "Done earlier?" }).getByRole("button")).toHaveText(["Yesterday", "2 days ago"]);
  });

  test("the Home card gives the same toast and chips", async ({ page, request }) => {
    await seedUpkeep(request, dueToday("Home job"));
    await page.goto("/");
    await page.getByRole("button", { name: "Done: Home job" }).click();
    await expect(toastOf(page, "Home job")).toContainText(`Next due ${written(7)}`);
    await earlierChip(page, "Home job", "Yesterday").click();
    await expect(toastOf(page, "Home job")).toContainText(`done ${written(-1)}`);
  });

  test.describe("on a phone", () => {
    test.use({ viewport: { width: 375, height: 667 } });

    test("the toast fits the screen, with every chip and button inside it", async ({ page, request }) => {
      await seedUpkeep(request, dueToday("Phone job"));
      await markDone(page, "Phone job");
      const toast = toastOf(page, "Phone job");
      await expect(toast.getByRole("button", { name: "A week ago" })).toBeVisible();
      const box = await toast.boundingBox();
      expect(box?.x).toBeGreaterThanOrEqual(0);
      expect((box?.x ?? 0) + (box?.width ?? 0)).toBeLessThanOrEqual(375);
      for (const name of ["Yesterday", "2 days ago", "A week ago", "Undo", "Dismiss"]) {
        const button = toast.getByRole("button", { name }).boundingBox();
        const inside = await button;
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

  test("a suggestion opens Add job with the name and cycle filled in, and Cancel saves nothing", async ({ page, request }) => {
    await page.goto("/upkeep");
    await page.getByRole("button", { name: /^Smoke alarm batteries/ }).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog.getByRole("textbox", { name: "Name" })).toHaveValue("Smoke alarm batteries");
    await expect(dialog.getByRole("spinbutton", { name: "Every" })).toHaveValue("6");
    await expect(dialog.locator("label").filter({ hasText: /^months$/i }).locator("input")).toBeChecked();
    await dialog.getByRole("button", { name: "Cancel" }).click();
    await expect(starters(page)).toHaveCount(5);
    const list = await request.get(`/trpc/maintenance.list?input=${encodeURIComponent(JSON.stringify({ today: todayUtc() }))}`);
    expect(((await list.json()) as { result: { data: unknown[] } }).result.data).toHaveLength(0);
  });

  test("a twelve month suggestion shows as one year, and saving it makes the job", async ({ page }) => {
    await page.goto("/upkeep");
    await page.getByRole("button", { name: /^Dryer vent/ }).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog.getByRole("spinbutton", { name: "Every" })).toHaveValue("1");
    await expect(dialog.locator("label").filter({ hasText: /^years$/i }).locator("input")).toBeChecked();
    await dialog.getByRole("button", { name: "Save" }).click();
    await expect(dialog).toHaveCount(0);
    await expect(page.getByText("Dryer vent", { exact: true })).toBeVisible();
    await expect(page.getByText(/^Nothing here yet/)).toHaveCount(0);
  });

  test("Add job on an empty page still starts blank, and the suggestions leave once a job exists", async ({ page, request }) => {
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
