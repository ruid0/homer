import { expect, test, type Page } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { failure, interceptCall } from "./intercept";
import { daysAgo, daysAhead, seedTask, todayUtc } from "./scratch";

const unique = (label: string) => `${label} ${randomUUID().slice(0, 8)}`;

const row = (page: Page, title: string) =>
  page.getByRole("listitem").filter({ has: page.getByText(title, { exact: true }) });

const openAdd = async (page: Page) => {
  await page.goto("/schedule");
  await page.getByRole("button", { name: "Add task" }).click();
  return page.getByRole("dialog");
};

const showWeek = async (page: Page) => {
  await page.goto("/schedule");
  await page.getByRole("button", { name: "Week", exact: true }).click();
};

test.describe("adding a task with the date left blank", () => {
  test("the label says what blank means", async ({ page }) => {
    const dialog = await openAdd(page);
    await expect(dialog.getByLabel(/^Due date/)).toBeVisible();
    await expect(dialog.getByText("Due date (blank: anytime, or today with a time or repeat)")).toBeVisible();
  });

  test("a time with no date is today at that time", async ({ page }) => {
    const title = unique("Time only");
    const dialog = await openAdd(page);
    await dialog.getByLabel("What needs doing").fill(title);
    await dialog.getByLabel("Time (optional)").fill("07:45");
    await dialog.getByRole("button", { name: "Save" }).click();
    await expect(dialog).toHaveCount(0);
    const today = page.locator("section").filter({ has: page.getByRole("heading", { name: "Today" }) });
    await expect(today.getByRole("listitem").filter({ hasText: title })).toContainText("07:45");
  });

  test("a repeat with no date or time is today, and repeats", async ({ page }) => {
    const title = unique("Repeat only");
    const dialog = await openAdd(page);
    await dialog.getByLabel("What needs doing").fill(title);
    await dialog.getByRole("combobox", { name: "Repeat", exact: true }).selectOption("daily");
    await dialog.getByRole("button", { name: "Save" }).click();
    await expect(dialog).toHaveCount(0);
    const today = page.locator("section").filter({ has: page.getByRole("heading", { name: "Today" }) });
    await expect(today.getByRole("listitem").filter({ hasText: title })).toContainText("Repeats daily");
  });

  test("with no time or repeat it stays anytime", async ({ page }) => {
    const title = unique("Anytime");
    const dialog = await openAdd(page);
    await dialog.getByLabel("What needs doing").fill(title);
    await dialog.getByRole("button", { name: "Save" }).click();
    await expect(dialog).toHaveCount(0);
    const anytime = page.locator("section").filter({ has: page.getByRole("heading", { name: "Anytime" }) });
    await expect(anytime.getByRole("listitem").filter({ hasText: title })).toBeVisible();
  });

  test("a date that was typed is kept", async ({ page }) => {
    const title = unique("Typed date");
    const dialog = await openAdd(page);
    await dialog.getByLabel("What needs doing").fill(title);
    await dialog.getByLabel(/^Due date/).fill(daysAhead(2));
    await dialog.getByLabel("Time (optional)").fill("09:00");
    await dialog.getByRole("button", { name: "Save" }).click();
    await expect(dialog).toHaveCount(0);
    await page.getByRole("button", { name: "Week", exact: true }).click();
    await expect(row(page, title)).toHaveCount(1);
    await expect(row(page, title).getByRole("button", { name: `Mark ${title} done` })).toBeVisible();
  });

  test("clearing the date on an existing task with a time makes it today", async ({ page, request }) => {
    const title = unique("Clear date");
    await seedTask(request, { title, dueDate: daysAhead(3), dueTime: "10:00" });
    await page.goto("/schedule");
    await page.getByRole("button", { name: "Week", exact: true }).click();
    await page.getByRole("button", { name: `Edit ${title}` }).click();
    const dialog = page.getByRole("dialog");
    await dialog.getByLabel(/^Due date/).fill("");
    await dialog.getByRole("button", { name: "Save" }).click();
    await expect(dialog).toHaveCount(0);
    const today = page.locator("section").filter({ has: page.getByRole("heading", { name: /^Today/ }) });
    await expect(today.getByRole("listitem").filter({ hasText: title })).toContainText("10:00");
  });

  test("a blank title still says what is missing", async ({ page }) => {
    const dialog = await openAdd(page);
    await dialog.getByRole("combobox", { name: "Repeat", exact: true }).selectOption("daily");
    await dialog.getByRole("button", { name: "Save" }).click();
    await expect(dialog.getByRole("alert")).toHaveText("Enter what needs doing.");
  });
});

test.describe("a repeating task in the week view", () => {
  test("a daily task shows on every day, and only today's can be ticked", async ({ page, request }) => {
    const title = unique("Pills");
    await seedTask(request, { title, dueDate: todayUtc(), dueTime: "08:00", repeat: "daily" });
    await showWeek(page);
    await expect(row(page, title)).toHaveCount(7);
    await expect(row(page, title).getByRole("button", { name: `Mark ${title} done` })).toHaveCount(1);
    const later = row(page, title).nth(1);
    await expect(later).toContainText("Repeats daily");
    await expect(later).toContainText("08:00");
    await expect(later.getByRole("button", { name: /done/i })).toHaveCount(0);
    await expect(later.getByRole("button", { name: `Edit ${title}` })).toBeVisible();
  });

  test("a later day is greyed against the real one", async ({ page, request }) => {
    const title = unique("Grey");
    await seedTask(request, { title, dueDate: todayUtc(), repeat: "daily" });
    await showWeek(page);
    await expect(row(page, title).nth(1)).toHaveClass(/text-muted/);
    await expect(row(page, title).nth(0)).not.toHaveClass(/text-muted/);
  });

  test("ticking today's moves the real one to tomorrow", async ({ page, request }) => {
    const title = unique("Roll");
    await seedTask(request, { title, dueDate: todayUtc(), repeat: "daily" });
    await showWeek(page);
    await row(page, title)
      .first()
      .getByRole("button", { name: `Mark ${title} done` })
      .click();
    await expect(row(page, title)).toHaveCount(6);
    const tomorrow = page.locator("section").filter({ has: page.getByRole("heading", { name: /^Tomorrow/ }) });
    await expect(tomorrow.getByRole("button", { name: `Mark ${title} done` })).toBeVisible();
    await expect(page.getByRole("button", { name: `Mark ${title} done` })).toHaveCount(1);
  });

  test("a weekly task shows on its weekday only", async ({ page, request }) => {
    const title = unique("Bins");
    await seedTask(request, { title, dueDate: todayUtc(), repeat: "weekly" });
    await showWeek(page);
    await expect(row(page, title)).toHaveCount(1);
  });

  // A weekly or monthly task can only come round again inside the week when it is overdue, so that is how they are
  // reached here.
  test("an overdue weekly task is overdue once, then greyed on its next weekday", async ({ page, request }) => {
    const title = unique("Weekly late");
    await seedTask(request, { title, dueDate: daysAgo(6), repeat: "weekly" });
    await showWeek(page);
    await expect(row(page, title)).toHaveCount(2);
    await expect(row(page, title).first()).toContainText("6 days overdue");
    await expect(row(page, title).nth(1)).toContainText("Repeats weekly");
    await expect(row(page, title).nth(1).getByRole("button", { name: /done/i })).toHaveCount(0);
  });

  test("an overdue monthly task is greyed on its next day of the month", async ({ page, request }) => {
    const title = unique("Monthly late");
    await seedTask(request, { title, dueDate: daysAgo(27), repeat: "monthly" });
    await showWeek(page);
    await expect(row(page, title)).toHaveCount(2);
    await expect(row(page, title).nth(1)).toContainText("Repeats monthly");
    await expect(row(page, title).nth(1).getByRole("button", { name: /done/i })).toHaveCount(0);
  });

  test("an overdue repeating task is overdue once, then greyed from tomorrow", async ({ page, request }) => {
    const title = unique("Late");
    await seedTask(request, { title, dueDate: daysAgo(3), repeat: "daily" });
    await showWeek(page);
    const overdue = page.locator("section").filter({ has: page.getByRole("heading", { name: "Overdue" }) });
    await expect(overdue.getByRole("listitem").filter({ hasText: title })).toContainText("3 days overdue");
    await expect(row(page, title)).toHaveCount(7);
    await expect(page.getByRole("button", { name: `Mark ${title} done` })).toHaveCount(1);
  });

  test("Edit on a greyed row opens the real task with its real date", async ({ page, request }) => {
    const title = unique("Edit me");
    await seedTask(request, { title, dueDate: todayUtc(), repeat: "daily" });
    await showWeek(page);
    await row(page, title)
      .nth(2)
      .getByRole("button", { name: `Edit ${title}` })
      .click();
    await expect(page.getByLabel(/^Due date/)).toHaveValue(todayUtc());
  });

  test("the Today view lists a repeating task once", async ({ page, request }) => {
    const title = unique("Once");
    await seedTask(request, { title, dueDate: todayUtc(), repeat: "daily" });
    await page.goto("/schedule");
    await expect(row(page, title)).toHaveCount(1);
  });

  test("a task that does not repeat shows on its day only", async ({ page, request }) => {
    const title = unique("One off");
    await seedTask(request, { title, dueDate: daysAhead(2) });
    await showWeek(page);
    await expect(row(page, title)).toHaveCount(1);
  });

  test("a failed load of the week says so", async ({ page }) => {
    await interceptCall(page, "schedule.view", { answer: failure("down") });
    await page.goto("/schedule");
    await expect(page.getByRole("alert").filter({ hasText: "load the schedule" })).toBeVisible({ timeout: 15_000 });
  });
});
