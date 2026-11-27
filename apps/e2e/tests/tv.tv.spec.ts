import { randomUUID } from "node:crypto";
import { expect, test, type Page } from "@playwright/test";
import { failure, gate, interceptCall } from "./intercept";
import {
  call,
  daysAhead,
  daysAgo,
  seedEvent,
  seedItem,
  seedListEntry,
  seedTask,
  seedUpkeep,
  todayUtc,
} from "./scratch";

// The TV is a 1080p screen, and the page scales its type from the width, so a small one must look the same.
test.use({ viewport: { width: 1920, height: 1080 } });
test.describe.configure({ mode: "serial", timeout: 60_000 });

const unique = (name: string) => `${name} ${randomUUID().slice(0, 8)}`;

const section = (page: Page, name: string) => page.getByRole("region", { name, exact: true });

// Answers every call with an empty list, for the empty states: the scratch copy is shared with other specs, so its own
// data cannot be counted on to be absent.
const emptyHome = async (page: Page, answers: Record<string, unknown> = {}) => {
  const empty: Record<string, unknown> = {
    "schedule.view": {
      overdue: [],
      days: Array.from({ length: 7 }, (_, at) => ({ date: daysAhead(at), tasks: [], events: [] })),
      undated: [],
    },
    "inventory.list": [],
    "groceries.list": [],
    "maintenance.list": [],
    ...answers,
  };
  await page.route("**/trpc/**", async (route) => {
    const names = new URL(route.request().url()).pathname.replace("/trpc/", "").split(",");
    await route.fulfill({ json: names.map((name) => ({ result: { data: empty[name] ?? null } })) });
  });
};

// Rows as the api sends them, for the tests that need a known amount of everything.
const taskOf = (id: number, title: string, fields: Record<string, unknown> = {}) => ({
  id,
  title,
  dueDate: todayUtc(),
  dueTime: null,
  repeat: null,
  personId: null,
  createdAt: "2026-01-01T00:00:00.000Z",
  doneAt: null,
  removedAt: null,
  personName: null,
  daysOverdue: 0,
  projected: false,
  ...fields,
});
const eventOf = (id: number, title: string, date: string) => ({
  id,
  title,
  date,
  time: null,
  personId: null,
  createdAt: "2026-01-01T00:00:00.000Z",
  removedAt: null,
  personName: null,
});
const entryOf = (id: number, text: string, quantity: number | null, unit: string | null) => ({
  id,
  itemId: null,
  text,
  quantity,
  unit,
  usualRestock: null,
  addedBy: "manual",
  createdAt: "2026-01-01T00:00:00.000Z",
  boughtAt: null,
  removedAt: null,
});
const week = (days: Record<number, { tasks?: unknown[]; events?: unknown[] }>) =>
  Array.from({ length: 7 }, (_, at) => ({
    date: daysAhead(at),
    tasks: days[at]?.tasks ?? [],
    repeats: [],
    events: days[at]?.events ?? [],
  }));

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
    await expect(section(page, "Groceries").getByText("Nothing to buy.")).toBeVisible();
  });

  test("lists the groceries with their amounts and how many there are to buy", async ({ page }) => {
    await emptyHome(page, {
      "groceries.list": [entryOf(1, "Milk", 2, "L"), entryOf(2, "Eggs", 12, null), entryOf(3, "Bread", null, null)],
    });
    await page.goto("/tv");
    const groceries = section(page, "Groceries");
    await expect(groceries.getByRole("heading")).toContainText("3 to buy");
    const rows = groceries.getByRole("listitem");
    await expect(rows).toHaveCount(3);
    await expect(rows.nth(0)).toContainText(/Milk\s*2 L/);
    await expect(rows.nth(1)).toContainText(/Eggs\s*12/);
    await expect(rows.nth(2)).toHaveText("Bread");
  });

  test("names each day of Upcoming once, and shows every row while they all fit", async ({ page }) => {
    await emptyHome(page, {
      "schedule.view": {
        overdue: [],
        days: week({
          2: { events: [eventOf(1, "Swimming", daysAhead(2)), eventOf(2, "Soccer", daysAhead(2))] },
          3: { events: [eventOf(3, "Piano", daysAhead(3))] },
        }),
        undated: [],
      },
    });
    await page.goto("/tv");
    const rows = section(page, "Upcoming").getByRole("listitem");
    await expect(rows).toHaveCount(3);
    const day = (offset: number) => {
      const date = new Date(`${daysAhead(offset)}T00:00:00Z`);
      return `${["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][date.getUTCDay()]} ${date.getUTCDate()}`;
    };
    await expect(rows.nth(0)).toContainText(day(2));
    await expect(rows.nth(1)).not.toContainText(day(2));
    await expect(rows.nth(2)).toContainText(day(3));
    await expect(section(page, "Upcoming").getByText(/^\+\d+ more$/)).toHaveCount(0);
  });

  test("cuts Upcoming before Tomorrow or Any time, and then shows it a line a day", async ({ page }) => {
    const upcoming = [2, 3, 4, 5, 6].map((offset) => ({
      events: [1, 2, 3].map((at) => eventOf(offset * 10 + at, `Planned ${offset}-${at}`, daysAhead(offset))),
    }));
    await emptyHome(page, {
      "schedule.view": {
        overdue: [],
        days: week({
          0: { tasks: [1, 2, 3].map((id) => taskOf(id, `Today ${id}`)) },
          1: { tasks: [4, 5, 6].map((id) => taskOf(id, `Tomorrow ${id}`, { dueDate: daysAhead(1) })) },
          2: upcoming[0]!,
          3: upcoming[1]!,
          4: upcoming[2]!,
          5: upcoming[3]!,
          6: upcoming[4]!,
        }),
        undated: [7, 8, 9, 10, 11].map((id) => taskOf(id, `Whenever ${id}`, { dueDate: null })),
      },
    });
    await page.goto("/tv");
    await expect(section(page, "Today").getByRole("listitem")).toHaveCount(3);
    // Tomorrow and Any time are shown in full, with nothing left out.
    await expect(section(page, "Tomorrow").getByRole("listitem")).toHaveCount(3);
    await expect(section(page, "Tomorrow").getByText(/^\+\d+ more$/)).toHaveCount(0);
    await expect(section(page, "Any time").getByRole("listitem")).toHaveCount(5);
    await expect(section(page, "Any time").getByText(/^\+\d+ more$/)).toHaveCount(0);
    // Fifteen items will not fit under them: each day is a line, with how many more it holds, and the rest is counted.
    const lines = section(page, "Upcoming").getByRole("listitem");
    expect(await lines.count()).toBeLessThan(5);
    await expect(lines.first()).toContainText("+2 more");
    const left = await section(page, "Upcoming")
      .getByText(/^\+\d+ more$/)
      .last()
      .innerText();
    const shownItems = (await lines.count()) * 3;
    expect(Number(left.replace(/\D/g, ""))).toBe(15 - shownItems);
  });

  test("shrinks Upcoming to its heading and a count when Today and Tomorrow take the room", async ({ page }) => {
    await emptyHome(page, {
      "schedule.view": {
        overdue: [],
        days: week({
          0: { tasks: [1, 2, 3, 4].map((id) => taskOf(id, `Today ${id}`)) },
          1: { tasks: [5, 6, 7, 8].map((id) => taskOf(id, `Tomorrow ${id}`, { dueDate: daysAhead(1) })) },
          2: { events: [1, 2, 3, 4, 5].map((id) => eventOf(id, `Planned ${id}`, daysAhead(2))) },
        }),
        undated: [],
      },
    });
    await page.goto("/tv");
    await expect(section(page, "Today").getByRole("listitem")).toHaveCount(4);
    await expect(section(page, "Tomorrow").getByRole("listitem")).toHaveCount(4);
    await expect(section(page, "Tomorrow").getByText(/^\+\d+ more$/)).toHaveCount(0);
    await expect(section(page, "Upcoming").getByRole("heading")).toContainText("+5 more");
    await expect(section(page, "Upcoming").getByRole("listitem")).toHaveCount(0);
  });

  test("says Loading in Groceries while its list loads, not that there is nothing to buy", async ({ page }) => {
    const held = gate();
    await interceptCall(page, "groceries.list", { when: held.when });
    try {
      await page.goto("/tv");
      await expect(section(page, "Groceries").getByRole("status")).toHaveText("Loading.");
      await expect(section(page, "Groceries").getByText("Nothing to buy.")).toHaveCount(0);
    } finally {
      held.release();
    }
    await expect(section(page, "Groceries").getByRole("status")).toHaveCount(0);
  });

  test("says Groceries cannot load yet, and still shows the other sections", async ({ page, request }) => {
    const job = unique("Job beside groceries");
    await seedUpkeep(request, { name: job, every: 1, unit: "weeks", lastDoneOn: daysAgo(10) });
    await interceptCall(page, "groceries.list", { answer: failure("it broke") });
    await page.goto("/tv");
    await expect(section(page, "Groceries").getByRole("alert")).toHaveText(
      "Can't load this yet. HOMER will try again.",
      {
        timeout: 20_000,
      },
    );
    await expect(section(page, "Upkeep").getByText(job)).toBeVisible();
    await expect(section(page, "Upkeep").getByRole("alert")).toHaveCount(0);
    await expect(section(page, "Running out").getByRole("alert")).toHaveCount(0);
  });

  test("puts the time or the state in words in a first column, and the titles line up under it", async ({ page }) => {
    await emptyHome(page, {
      "schedule.view": {
        overdue: [taskOf(1, "Long overdue", { daysOverdue: 14, dueDate: daysAgo(14) })],
        days: week({
          0: { tasks: [taskOf(2, "Without a time"), taskOf(3, "With a time", { dueTime: "23:59" })] },
          1: {
            tasks: [
              taskOf(4, "Any hour tomorrow", { dueDate: daysAhead(1) }),
              taskOf(5, "Early tomorrow", { dueDate: daysAhead(1), dueTime: "09:30" }),
            ],
            events: [eventOf(6, "All day tomorrow", daysAhead(1))],
          },
        }),
        undated: [],
      },
    });
    await page.goto("/tv");
    const row = (name: string, title: string) => section(page, name).getByRole("listitem").filter({ hasText: title });
    const lead = (name: string, title: string) => row(name, title).locator("span").first();
    await expect(lead("Today", "Long overdue")).toHaveText("14 days overdue");
    expect(await lead("Today", "Long overdue").evaluate((node) => getComputedStyle(node).color)).toBe(
      "rgb(255, 154, 140)",
    );
    await expect(lead("Today", "Without a time")).toHaveText("Due today");
    await expect(lead("Today", "With a time")).toHaveText("23:59");
    await expect(lead("Tomorrow", "Any hour tomorrow")).toHaveText("Any time");
    await expect(lead("Tomorrow", "Early tomorrow")).toHaveText("09:30");
    await expect(lead("Tomorrow", "All day tomorrow")).toHaveText("All day");

    // The longest words stay on one line inside the column, and every title starts at the same place.
    const fits = await lead("Today", "Long overdue").evaluate((node) => {
      const line = parseFloat(getComputedStyle(node).lineHeight);
      return node.scrollWidth <= node.clientWidth && node.getBoundingClientRect().height <= line * 1.2;
    });
    expect(fits).toBe(true);
    const lefts = await page
      .getByRole("listitem")
      .filter({ has: page.locator("span") })
      .evaluateAll((rows) =>
        rows
          .filter((item) =>
            ["Today", "Tomorrow"].includes(item.closest("section")?.querySelector("h2 span")?.textContent ?? ""),
          )
          .map((item) => Math.round(item.querySelectorAll("span")[1]?.getBoundingClientRect().left ?? -1)),
      );
    expect(lefts).toHaveLength(6);
    expect(new Set(lefts).size).toBe(1);
  });

  test("cuts a title that is too long and keeps what follows it on the screen", async ({ page }) => {
    const long = "A title far too long to fit on one line of a television, so it has to be cut short";
    await emptyHome(page, {
      "schedule.view": {
        overdue: [],
        days: week({ 0: { tasks: [taskOf(1, long, { personName: "Igor" })] } }),
        undated: [],
      },
      "groceries.list": [entryOf(1, long, 12, "kg")],
    });
    await page.goto("/tv");
    const cut = (name: string) =>
      section(page, name)
        .getByText(long)
        .evaluate((node) => node.scrollWidth > node.clientWidth);
    expect(await cut("Today")).toBe(true);
    expect(await cut("Groceries")).toBe(true);
    await expect(section(page, "Today").getByText("Igor")).toBeVisible();
    await expect(section(page, "Groceries").getByText("12 kg")).toBeVisible();
    const right = await section(page, "Groceries")
      .getByText("12 kg")
      .evaluate((node) => node.getBoundingClientRect().right);
    expect(right).toBeLessThanOrEqual(1920 * 0.95);
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
      await seedListEntry(request, unique(`${long} ${at}`));
    }
    for (const size of [
      { width: 1920, height: 1080 },
      { width: 960, height: 540 },
    ]) {
      await page.setViewportSize(size);
      await page.goto("/tv");
      await expect(section(page, "Today").getByText(/^\+\d+ more$/)).toBeVisible();
      for (const name of ["Today", "Tomorrow", "Upcoming", "Any time", "Upkeep", "Running out", "Groceries"]) {
        // Upcoming gives way first, so with Today and Tomorrow this full it is gone altogether.
        if (name === "Upcoming") {
          await expect(section(page, name), `Upcoming at ${size.width}`).toHaveCount(0);
          continue;
        }
        // Ten of each were added, so what is shown and what is counted as left out add up to at least ten. Upcoming can
        // show a line a day, which stands for several, so it only has to account for its four days.
        const shown = await section(page, name).getByRole("listitem").count();
        const left = await section(page, name)
          .getByText(/^\+\d+ more$/)
          .last()
          .innerText()
          .then((text) => Number(text.replace(/\D/g, "")));
        expect(shown + left, `${name} at ${size.width}`).toBeGreaterThanOrEqual(name === "Upcoming" ? 4 : 10);
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
