import { expect, test, type Page } from "@playwright/test";
import { failure, interceptCall } from "./intercept";
import { clearUpkeep, daysAgo, seedUpkeep, todayUtc } from "./scratch";

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
const overdue = (name: string) => ({ name, every: 1, unit: "weeks" as const, lastDoneOn: daysAgo(10) });
// Done yesterday: due in 6 days, so it is "soon": under Due now, but nothing to put off.
const notYet = (name: string) => ({ name, every: 1, unit: "weeks" as const, lastDoneOn: daysAgo(1) });

const row = (page: Page, name: string) =>
  page.getByRole("listitem").filter({ has: page.getByText(name, { exact: true }) });
const notToday = (page: Page, name: string) => page.getByRole("button", { name: `Not today: ${name}` });
const toastOf = (page: Page, name: string) => page.getByRole("status").filter({ hasText: `${name} snoozed` });
const choices = (page: Page, name: string) =>
  page.getByRole("dialog").filter({ has: page.getByRole("heading", { name: `Not today: ${name}` }) });

// On the Upkeep page Not today is in the job's Edit dialog; it closes that dialog and opens the choices.
const openChoices = async (page: Page, name: string) => {
  await page.getByRole("button", { name: `Edit ${name}` }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Not today", exact: true }).click();
};
const ask = async (page: Page, name: string) => {
  await page.goto("/upkeep");
  await openChoices(page, name);
};

test.describe("Not today on the Upkeep page", () => {
  test("is in the Edit dialog of a due or overdue job, and not of one that is only coming up", async ({
    page,
    request,
  }) => {
    await seedUpkeep(request, overdue("Due job"));
    await seedUpkeep(request, notYet("Soon job"));
    await page.goto("/upkeep");
    await expect(notToday(page, "Due job")).toHaveCount(0);
    await page.getByRole("button", { name: "Edit Due job" }).click();
    await expect(page.getByRole("dialog").getByRole("button", { name: "Not today", exact: true })).toBeVisible();
    await page.keyboard.press("Escape");
    await page.getByRole("button", { name: "Edit Soon job" }).click();
    await expect(page.getByRole("dialog").getByRole("button", { name: "Not today", exact: true })).toHaveCount(0);
  });

  test("opens three choices, each with its day", async ({ page, request }) => {
    await seedUpkeep(request, overdue("Choice job"));
    await ask(page, "Choice job");
    const dialog = choices(page, "Choice job");
    await expect(dialog.getByRole("button", { name: /^Tomorrow/ })).toContainText(written(1));
    await expect(dialog.getByRole("button", { name: /^In a week/ })).toContainText(written(7));
    await expect(dialog.getByRole("button", { name: /^In a month/ })).toBeVisible();
    await expect(dialog.getByRole("button", { name: "Cancel" })).toBeVisible();
  });

  test("Cancel and Escape change nothing", async ({ page, request }) => {
    await seedUpkeep(request, overdue("Kept job"));
    await ask(page, "Kept job");
    await choices(page, "Kept job").getByRole("button", { name: "Cancel" }).click();
    await expect(choices(page, "Kept job")).toHaveCount(0);
    await openChoices(page, "Kept job");
    await page.keyboard.press("Escape");
    await expect(choices(page, "Kept job")).toHaveCount(0);
    await expect(row(page, "Kept job")).toContainText("days overdue");
    await expect(page.getByRole("status").filter({ hasText: "snoozed" })).toHaveCount(0);
  });

  test("a choice moves the job to Later as Snoozed, with a toast", async ({ page, request }) => {
    await seedUpkeep(request, overdue("Moved job"));
    await ask(page, "Moved job");
    await choices(page, "Moved job")
      .getByRole("button", { name: /^In a week/ })
      .click();
    await expect(toastOf(page, "Moved job")).toHaveText(new RegExp(`^Moved job snoozed to ${written(7)}\\.`));
    const later = page.getByRole("region", { name: "Later" });
    await expect(later.getByRole("listitem").filter({ hasText: "Moved job" })).toContainText(
      `Snoozed to ${written(7)}`,
    );
    await expect(page.getByRole("region", { name: "Due now" }).getByText("Moved job")).toHaveCount(0);
    // Later rows have no Not today.
    await expect(notToday(page, "Moved job")).toHaveCount(0);
  });

  test("Undo puts the job back under Due now", async ({ page, request }) => {
    await seedUpkeep(request, overdue("Undone job"));
    await ask(page, "Undone job");
    await choices(page, "Undone job")
      .getByRole("button", { name: /^Tomorrow/ })
      .click();
    await toastOf(page, "Undone job").getByRole("button", { name: "Undo" }).click();
    await expect(toastOf(page, "Undone job")).toHaveCount(0);
    await expect(page.getByRole("region", { name: "Due now" }).getByText("Undone job")).toBeVisible();
    await expect(row(page, "Undone job")).toContainText("days overdue");
  });

  test("Done on a snoozed job clears the snooze", async ({ page, request }) => {
    await seedUpkeep(request, overdue("Done job"));
    await ask(page, "Done job");
    await choices(page, "Done job")
      .getByRole("button", { name: /^In a month/ })
      .click();
    await row(page, "Done job").getByRole("button", { name: "Done: Done job" }).click();
    await expect(row(page, "Done job")).toContainText("Due in 7 days");
    await expect(row(page, "Done job")).not.toContainText("Snoozed");
    // A Done closes the snooze toast, so only one toast is up.
    await expect(page.getByRole("status").filter({ hasText: "snoozed" })).toHaveCount(0);
  });

  test("a failed save says why and leaves the job under Due now", async ({ page, request }) => {
    await seedUpkeep(request, overdue("Failed job"));
    await interceptCall(page, "maintenance.snooze", { answer: failure("Could not save. Try again.") });
    await ask(page, "Failed job");
    await choices(page, "Failed job")
      .getByRole("button", { name: /^Tomorrow/ })
      .click();
    await expect(page.getByRole("alert").filter({ hasText: "Could not save. Try again." })).toBeVisible();
    await expect(page.getByRole("region", { name: "Due now" }).getByText("Failed job")).toBeVisible();
    await expect(toastOf(page, "Failed job")).toHaveCount(0);
  });

  test("a snoozed job leaves Due now and the empty line shows when it was the only one", async ({ page, request }) => {
    await seedUpkeep(request, overdue("Only job"));
    await ask(page, "Only job");
    await choices(page, "Only job")
      .getByRole("button", { name: /^Tomorrow/ })
      .click();
    await expect(page.getByText("Nothing due this week.")).toBeVisible();
  });
});

test.describe("Not today on the Home card", () => {
  const card = (page: Page) => page.getByRole("region", { name: "Upkeep" });

  test("snoozes a job off the card, and Undo brings it back", async ({ page, request }) => {
    await seedUpkeep(request, overdue("Home job"));
    await page.goto("/");
    await notToday(page, "Home job").click();
    await choices(page, "Home job")
      .getByRole("button", { name: /^Tomorrow/ })
      .click();
    await expect(toastOf(page, "Home job")).toContainText(`snoozed to ${written(1)}`);
    await expect(card(page).getByText("Home job")).toHaveCount(0);
    await toastOf(page, "Home job").getByRole("button", { name: "Undo" }).click();
    await expect(card(page).getByText("Home job")).toBeVisible();
  });
});

test.describe("Not today, more states", () => {
  test("a failed Undo keeps the toast, says why, and can be tried again", async ({ page, request }) => {
    await seedUpkeep(request, overdue("Retry job"));
    await ask(page, "Retry job");
    await choices(page, "Retry job")
      .getByRole("button", { name: /^Tomorrow/ })
      .click();
    await expect(toastOf(page, "Retry job")).toBeVisible();
    await interceptCall(page, "maintenance.snooze", { answer: failure("Could not undo. Try again.") });
    await toastOf(page, "Retry job").getByRole("button", { name: "Undo" }).click();
    await expect(page.getByRole("alert").filter({ hasText: "Could not undo. Try again." })).toBeVisible();
    await expect(toastOf(page, "Retry job")).toBeVisible();
    await page.unroute("**/trpc/**");
    await toastOf(page, "Retry job").getByRole("button", { name: "Undo" }).click();
    await expect(toastOf(page, "Retry job")).toHaveCount(0);
    await expect(page.getByRole("region", { name: "Due now" }).getByText("Retry job")).toBeVisible();
  });

  test("Escape on the Upkeep page puts focus back on the job's row", async ({ page, request }) => {
    await seedUpkeep(request, overdue("Focus job"));
    await ask(page, "Focus job");
    await page.keyboard.press("Escape");
    await expect(page.getByRole("button", { name: "Edit Focus job" })).toBeFocused();
  });

  test("on Home, Escape and Cancel leave the job and focus returns", async ({ page, request }) => {
    await seedUpkeep(request, overdue("Home focus job"));
    await page.goto("/");
    await notToday(page, "Home focus job").click();
    await page.keyboard.press("Escape");
    await expect(notToday(page, "Home focus job")).toBeFocused();
    await notToday(page, "Home focus job").click();
    await choices(page, "Home focus job").getByRole("button", { name: "Cancel" }).click();
    await expect(notToday(page, "Home focus job")).toBeFocused();
    await expect(page.getByRole("status").filter({ hasText: "snoozed" })).toHaveCount(0);
  });

  test("on Home, only one toast is up: a Done closes a snooze toast, and a snooze closes a Done toast", async ({
    page,
    request,
  }) => {
    await seedUpkeep(request, overdue("Snooze one"));
    await seedUpkeep(request, overdue("Done one"));
    await seedUpkeep(request, overdue("Snooze two"));
    await page.goto("/");
    await notToday(page, "Snooze one").click();
    await choices(page, "Snooze one")
      .getByRole("button", { name: /^Tomorrow/ })
      .click();
    await expect(toastOf(page, "Snooze one")).toBeVisible();
    await page.getByRole("button", { name: "Done: Done one" }).click();
    await expect(page.getByRole("status").filter({ hasText: "Done one done" })).toBeVisible();
    await expect(toastOf(page, "Snooze one")).toHaveCount(0);
    await notToday(page, "Snooze two").click();
    await choices(page, "Snooze two")
      .getByRole("button", { name: /^Tomorrow/ })
      .click();
    await expect(toastOf(page, "Snooze two")).toBeVisible();
    await expect(page.getByRole("status").filter({ hasText: "Done one done" })).toHaveCount(0);
  });
});

test.describe("Not today on a phone", () => {
  test.use({ viewport: { width: 375, height: 667 } });

  test("the button and the choices are 44px targets, and nothing scrolls sideways", async ({ page, request }) => {
    await seedUpkeep(request, overdue("Phone job"));
    await ask(page, "Phone job");
    const buttons = choices(page, "Phone job").getByRole("button");
    for (const button of await buttons.all()) expect((await button.boundingBox())?.height).toBeGreaterThanOrEqual(44);
    await choices(page, "Phone job").getByRole("button", { name: "Cancel" }).click();
    expect((await page.getByRole("button", { name: "Edit Phone job" }).boundingBox())?.height).toBeGreaterThanOrEqual(
      44,
    );
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await page.goto("/");
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  });

  test("on the Home card at 360px the name keeps room and the row stays short", async ({ page, request }) => {
    await page.setViewportSize({ width: 360, height: 640 });
    await seedUpkeep(request, overdue("Smoke alarm batteries"));
    await page.goto("/");
    const item = page
      .getByRole("region", { name: "Upkeep" })
      .getByRole("listitem")
      .filter({ hasText: "Smoke alarm batteries" });
    expect((await item.getByText("Smoke alarm batteries").boundingBox())?.width).toBeGreaterThanOrEqual(150);
    expect((await item.boundingBox())?.height).toBeLessThanOrEqual(96);
  });
});
