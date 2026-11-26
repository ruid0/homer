import { randomUUID } from "node:crypto";
import { expect, test, type Page } from "@playwright/test";
import { failure, gate, interceptCall } from "./intercept";
import { call, daysAhead, daysAgo, seedEvent, seedItem, seedTask, seedUpkeep, todayUtc } from "./scratch";

// The TV is a 1080p screen, and the page scales its type from the width, so a small one must look the same.
test.use({ viewport: { width: 1920, height: 1080 } });
test.describe.configure({ mode: "serial", timeout: 60_000 });

const unique = (name: string) => `${name} ${randomUUID().slice(0, 8)}`;

const section = (page: Page, name: string) => page.getByRole("region", { name, exact: true });

// Answers every call with an empty list, for the empty states: the scratch copy is shared with other specs, so its own
// data cannot be counted on to be absent.
const emptyHome = async (page: Page) => {
  const empty: Record<string, unknown> = {
    "schedule.view": {
      overdue: [],
      days: Array.from({ length: 7 }, (_, at) => ({ date: daysAhead(at), tasks: [], events: [] })),
      undated: [],
    },
    "inventory.list": [],
    "groceries.list": [],
    "maintenance.list": [],
  };
  await page.route("**/trpc/**", async (route) => {
    const names = new URL(route.request().url()).pathname.replace("/trpc/", "").split(",");
    await route.fulfill({ json: names.map((name) => ({ result: { data: empty[name] ?? null } })) });
  });
};

test.describe("the TV page", () => {
  // First: after midnight yesterday's tasks are overdue, so it needs a copy with nothing else in it.
  test("moves to the new day at midnight without a reload, and what was tomorrow's is today's", async ({
    page,
    request,
  }) => {
    const next = unique("Starts tomorrow");
    await seedTask(request, { title: next, dueDate: daysAhead(1), dueTime: "09:00" });
    await page.clock.install({ time: new Date(`${todayUtc()}T23:59:50Z`) });
    await page.goto("/tv");
    await expect(page.locator("time")).toHaveText("23:59");
    await expect(section(page, "Tomorrow").getByText(next)).toBeVisible();
    const weekday = await page.getByRole("heading", { level: 1 }).innerText();
    await page.clock.runFor(30_000);
    await expect(page.locator("time")).toHaveText("00:00");
    await expect(page.getByRole("heading", { level: 1 })).not.toHaveText(weekday);
    await expect(section(page, "Today").getByText(next)).toBeVisible();
    await expect(section(page, "Tomorrow").getByText(next)).toHaveCount(0);
  });

  test("shows the day, upkeep and what is running out, with nothing to tap", async ({ page, request }) => {
    const [late, soon, past, tomorrow, job, low, soonEvent, laterTask, anytime] = [
      "Late task",
      "Soon task",
      "Past task",
      "Tomorrow task",
      "Filter job",
      "Low item",
      "Event this week",
      "Task this week",
      "Whenever task",
    ].map(unique);
    await seedTask(request, { title: late!, dueDate: daysAgo(2) });
    await seedTask(request, { title: soon!, dueDate: todayUtc(), dueTime: "23:59" });
    // Its time has passed and it is still open, so it stays on the screen.
    await seedTask(request, { title: past!, dueDate: todayUtc(), dueTime: "00:00" });
    await seedEvent(request, { title: tomorrow!, date: daysAhead(1), time: "08:15" });
    await seedUpkeep(request, { name: job!, every: 1, unit: "weeks", lastDoneOn: daysAgo(10) });
    await seedUpkeep(request, { name: unique("Coming job"), every: 1, unit: "weeks", lastDoneOn: daysAgo(4) });
    await seedItem(request, low!);
    await seedEvent(request, { title: soonEvent!, date: daysAhead(3), time: "10:30" });
    await seedTask(request, { title: laterTask!, dueDate: daysAhead(6) });
    await seedTask(request, { title: anytime!, dueDate: null });

    await page.goto("/tv");

    await expect(section(page, "Today").getByText(late!)).toBeVisible();
    await expect(section(page, "Today").getByText("2 days overdue").first()).toBeVisible();
    await expect(section(page, "Today").getByText(soon!)).toBeVisible();
    await expect(section(page, "Today").getByText(past!)).toBeVisible();
    await expect(section(page, "Tomorrow").getByText(tomorrow!)).toBeVisible();
    // After tomorrow, up to a week out from today: each row says which day, and the time follows the title.
    const weekDay = (offset: number) => {
      const date = new Date(`${daysAhead(offset)}T00:00:00Z`);
      return `${["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][date.getUTCDay()]} ${date.getUTCDate()}`;
    };
    const eventRow = section(page, "Upcoming").getByRole("listitem").filter({ hasText: soonEvent! });
    await expect(eventRow).toContainText(weekDay(3));
    await expect(eventRow).toContainText("10:30");
    await expect(section(page, "Upcoming").getByRole("listitem").filter({ hasText: laterTask! })).toContainText(
      weekDay(6),
    );
    await expect(section(page, "Any time").getByText(anytime!)).toBeVisible();
    await expect(section(page, "Upkeep").getByText(job!)).toBeVisible();
    // Colour backs up the words: late is red, coming up is amber.
    const colour = (text: RegExp) =>
      section(page, "Upkeep")
        .getByText(text)
        .first()
        .evaluate((node) => getComputedStyle(node).color);
    expect(await colour(/days overdue$/)).toBe("rgb(255, 154, 140)");
    expect(await colour(/^Due in \d+ days$/)).toBe("rgb(245, 189, 82)");
    await expect(section(page, "Running out").getByText(low!)).toBeVisible();
    await expect(page.getByText(/^Updated \d\d:\d\d$/)).toBeVisible();

    // Read-only and a screen of its own: no navigation, no buttons, no links.
    await expect(page.getByRole("navigation")).toHaveCount(0);
    await expect(page.getByRole("button")).toHaveCount(0);
    await expect(page.getByRole("link")).toHaveCount(0);
  });

  test("shows a recurring task on the days it falls on, in Upcoming", async ({ page, request }) => {
    const title = unique("Bin day");
    // Due three days ago and weekly, so it falls again four days from now.
    const { id } = await seedTask(request, { title, dueDate: daysAgo(3), repeat: "weekly" });
    try {
      await page.goto("/tv");
      const date = new Date(`${daysAhead(4)}T00:00:00Z`);
      const day = `${["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][date.getUTCDay()]} ${date.getUTCDate()}`;
      await expect(section(page, "Upcoming").getByRole("listitem").filter({ hasText: title })).toContainText(day);
    } finally {
      await call(request, "tasks.remove", { id });
    }
  });

  test("is always the dark palette", async ({ page }) => {
    await page.emulateMedia({ colorScheme: "light" });
    await page.goto("/tv");
    await expect(section(page, "Today")).toBeVisible();
    expect(await page.evaluate(() => getComputedStyle(document.body).backgroundColor)).toBe("rgb(10, 9, 8)");
  });

  test("looks the same on a 960 by 540 screen, where TV browsers often report their size", async ({ page }) => {
    await page.setViewportSize({ width: 960, height: 540 });
    await page.goto("/tv");
    await expect(section(page, "Today")).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    const size = await page.evaluate(() => parseFloat(getComputedStyle(document.documentElement).fontSize));
    expect(size).toBeCloseTo(960 * 0.0125, 1);
  });

  test("says Loading while the lists load, not that they are empty", async ({ page }) => {
    const held = gate();
    await interceptCall(page, "schedule.view", { when: held.when });
    try {
      await page.goto("/tv");
      await expect(section(page, "Today").getByRole("status")).toHaveText("Loading.");
      for (const name of ["Tomorrow", "Upcoming", "Any time"]) {
        await expect(section(page, name).getByRole("status"), name).toHaveText("Loading.");
      }
      await expect(section(page, "Today").getByText("Nothing planned today.")).toHaveCount(0);
    } finally {
      held.release();
    }
    await expect(section(page, "Today").getByRole("status")).toHaveCount(0);
  });

  test("says so in each section when there is nothing to show", async ({ page }) => {
    await emptyHome(page);
    await page.goto("/tv");
    await expect(section(page, "Today").getByText("Nothing planned today.")).toBeVisible();
    await expect(section(page, "Tomorrow").getByText("Nothing planned tomorrow.")).toBeVisible();
    await expect(section(page, "Upcoming").getByText("Nothing planned for the coming days.")).toBeVisible();
    await expect(section(page, "Any time").getByText("No tasks without a day.")).toBeVisible();
    await expect(section(page, "Upkeep").getByText("Nothing due this week.")).toBeVisible();
    await expect(section(page, "Running out").getByText("Nothing running out.")).toBeVisible();
  });

  test("says a section cannot load yet, and still shows the others", async ({ page, request }) => {
    const job = unique("Failing job");
    await seedUpkeep(request, { name: job, every: 1, unit: "weeks", lastDoneOn: daysAgo(10) });
    await interceptCall(page, "inventory.list", { answer: failure("it broke") });
    await page.goto("/tv");
    await expect(section(page, "Running out").getByRole("alert")).toHaveText(
      "Can't load this yet. HOMER will try again.",
      { timeout: 20_000 },
    );
    await expect(section(page, "Upkeep").getByText(job)).toBeVisible();
    // Nothing had loaded, so it does not claim to be showing a last update.
    await expect(page.getByText("Can't reach HOMER. Showing the last update.")).toHaveCount(0);
  });

  test("keeps the last update on screen and says so when HOMER stops answering, then recovers", async ({
    page,
    request,
  }) => {
    await seedTask(request, { title: unique("Stays on screen"), dueDate: todayUtc(), dueTime: "23:59" });
    await page.goto("/tv");
    // The rows are shared out by the room there is, and this copy holds other tests' rows, so it follows what is shown.
    const first = section(page, "Today").getByRole("listitem").first();
    await expect(first).toBeVisible();
    const row = await first.innerText();

    await page.route("**/trpc/**", (route) => route.fulfill({ status: 500, json: [failure("down")] }));
    await page.evaluate(() => document.dispatchEvent(new Event("visibilitychange", { bubbles: true })));
    await expect(page.getByRole("alert")).toHaveText("Can't reach HOMER. Showing the last update.", {
      timeout: 20_000,
    });
    await expect(first).toHaveText(row, { useInnerText: true });

    await page.unroute("**/trpc/**");
    await page.evaluate(() => document.dispatchEvent(new Event("visibilitychange", { bubbles: true })));
    await expect(page.getByText("Can't reach HOMER. Showing the last update.")).toHaveCount(0, { timeout: 20_000 });
  });

  // Last: it fills the lists, and the tests above need to see their own rows.
  test("keeps every list inside the safe margin when each one is full, and counts what it leaves out", async ({
    page,
    request,
  }) => {
    // Titles long enough to wrap onto a second line on a television: the worst case for height. Upkeep names are
    // limited to 80 characters, so the base is short enough for all four.
    const long = "A title far too long to fit on one line of a television, so";
    for (const at of Array.from({ length: 10 }, (_, number) => number)) {
      await seedTask(request, { title: unique(`${long} ${at}`), dueDate: todayUtc(), dueTime: "23:59" });
      await seedEvent(request, { title: unique(`${long} ${at}`), date: daysAhead(1), time: "08:00" });
      await seedEvent(request, { title: unique(`${long} ${at}`), date: daysAhead(3 + (at % 4)), time: "09:00" });
      await seedTask(request, { title: unique(`${long} ${at}`), dueDate: null });
      await seedUpkeep(request, { name: unique(`${long} ${at}`), every: 1, unit: "weeks", lastDoneOn: daysAgo(10) });
      await seedItem(request, unique(`${long} ${at}`));
    }
    for (const size of [
      { width: 1920, height: 1080 },
      { width: 960, height: 540 },
    ]) {
      await page.setViewportSize(size);
      await page.goto("/tv");
      await expect(section(page, "Today").getByText(/^\+\d+ more$/)).toBeVisible();
      for (const name of ["Today", "Tomorrow", "Upcoming", "Any time", "Upkeep", "Running out"]) {
        // Ten of each were added, so what is shown and what is counted as left out add up to at least ten.
        const shown = await section(page, name).getByRole("listitem").count();
        const left = await section(page, name)
          .getByText(/^\+\d+ more$/)
          .innerText()
          .then((text) => Number(text.replace(/\D/g, "")));
        expect(shown + left, `${name} at ${size.width}`).toBeGreaterThanOrEqual(10);
        const bottom = await section(page, name).evaluate((node) => node.getBoundingClientRect().bottom);
        expect(bottom, `${name} at ${size.width}`).toBeLessThanOrEqual(size.height * 0.95);
      }
      // A long title is cut, never pushed past the edge, so each row's status stays on the screen.
      const right = await page
        .getByRole("listitem")
        .evaluateAll((rows) => Math.max(...rows.map((row) => row.getBoundingClientRect().right)));
      expect(right, `rows at ${size.width}`).toBeLessThanOrEqual(size.width * 0.95);
    }
  });
});
