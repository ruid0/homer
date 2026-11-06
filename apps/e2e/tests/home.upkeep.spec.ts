import { expect, test, type Page } from "@playwright/test";
import { contrastOf } from "./contrast";
import { failure, gate, interceptCall } from "./intercept";
import { randomUUID } from "node:crypto";
import { clearUpkeep, daysAgo, seedEvent, seedItem, seedTask, seedUpkeep, todayUtc } from "./scratch";

const RETRIES = { timeout: 20_000 };

test.describe.configure({ mode: "serial", timeout: 60_000 });

test.beforeEach(async ({ request }) => {
  await clearUpkeep(request);
});

const row = (page: Page, name: string) => page.getByRole("listitem").filter({ has: page.getByText(name, { exact: true }) });

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

  test("after the last due item is done, focus stays on the card instead of dropping to the top of the page", async ({ page, request }) => {
    await seedUpkeep(request, fortnightly("Today job"));
    await page.goto("/");
    await card(page).getByRole("button", { name: "Done: Today job" }).click();
    await expect(card(page).getByText("Nothing due.")).toBeVisible();
    await expect(card(page).locator(":focus")).toHaveCount(1);
  });

  test("a second done on the same day is refused in words, and the item stays", async ({ page, request }) => {
    await seedUpkeep(request, weekly("Fresh job", 7));
    await page.goto("/");
    await card(page).getByRole("button", { name: "Done: Fresh job" }).click();
    await expect(card(page).getByText("Fresh job", { exact: true })).toBeVisible();
    await card(page).getByRole("button", { name: "Done: Fresh job" }).click();
    await expect(card(page).getByRole("alert")).toHaveText("Fresh job is already marked done today.");
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

const fontSize = (locator: ReturnType<Page["locator"]>) => locator.evaluate((element) => parseFloat(getComputedStyle(element).fontSize));
const weight = (locator: ReturnType<Page["locator"]>) => locator.evaluate((element) => parseInt(getComputedStyle(element).fontWeight, 10));
// The overdue bar is a pseudo-element: its width is 4px when there, and "auto" (no box) when not.
const barWidth = (locator: ReturnType<Page["locator"]>) =>
  locator.evaluate((element) => (getComputedStyle(element, "::before").content === "none" ? 0 : parseFloat(getComputedStyle(element, "::before").width)));
const titleLeft = (locator: ReturnType<Page["locator"]>) => locator.evaluate((element) => element.querySelector("p")?.getBoundingClientRect().left ?? -1);

// WCAG contrast of one rgb() string against another, for borders.
const ratio = (page: Page, edge: string, ground: string) =>
  page.evaluate(
    ([a, b]) => {
      const channels = (css: string) => (css.match(/[\d.]+/g) ?? []).slice(0, 3).map(Number);
      const luminance = (css: string) => {
        const [r = 0, g = 0, bl = 0] = channels(css).map((value) => {
          const unit = value / 255;
          return unit <= 0.03928 ? unit / 12.92 : ((unit + 0.055) / 1.055) ** 2.4;
        });
        return 0.2126 * r + 0.7152 * g + 0.0722 * bl;
      };
      const [light, dark] = [luminance(a), luminance(b)].sort((x, y) => y - x);
      return ((light ?? 0) + 0.05) / ((dark ?? 0) + 0.05);
    },
    [edge, ground] as const,
  );

test.describe("one look across screens", () => {
  test("the status line is the same size on every screen, and late is heavier than warn", async ({ page, request }) => {
    const tag = randomUUID().slice(0, 8);
    await seedUpkeep(request, weekly(`Late job ${tag}`, 20));
    await seedUpkeep(request, weekly(`Soon job ${tag}`, 5));
    await seedTask(request, { title: `Late task ${tag}`, dueDate: daysAgo(3) });
    await seedItem(request, `Flour ${tag}`);
    const inRow = (name: string) => page.getByRole("listitem").filter({ hasText: name });
    await page.goto("/");
    const home = {
      job: await fontSize(inRow(`Late job ${tag}`).getByText("13 days overdue")),
      soon: await fontSize(inRow(`Soon job ${tag}`).getByText("Due in 2 days")),
      task: await fontSize(inRow(`Late task ${tag}`).getByText("3 days overdue")),
      item: await fontSize(inRow(`Flour ${tag}`).getByText("Runs out in 2 days")),
    };
    expect(new Set(Object.values(home)).size).toBe(1);
    await page.goto("/upkeep");
    expect(await fontSize(row(page, `Late job ${tag}`).getByText("13 days overdue"))).toBe(home.job);
    expect(await weight(row(page, `Late job ${tag}`).getByText("13 days overdue"))).toBeGreaterThanOrEqual(600);
    expect(await weight(row(page, `Soon job ${tag}`).getByText("Due in 2 days"))).toBeLessThan(600);
    await page.goto("/schedule");
    expect(await fontSize(inRow(`Late task ${tag}`).getByText("3 days overdue"))).toBe(home.job);
    await page.goto("/items");
    expect(await fontSize(inRow(`Flour ${tag}`).getByText("Runs out in 2 days"))).toBe(home.job);
  });

  test("overdue rows carry a bar at the left edge and other rows do not, and no title moves for it", async ({ page, request }) => {
    const tag = randomUUID().slice(0, 8);
    await seedUpkeep(request, weekly(`Late job ${tag}`, 20));
    await seedUpkeep(request, weekly(`Soon job ${tag}`, 5));
    await seedTask(request, { title: `Late task ${tag}`, dueDate: daysAgo(3) });
    await page.goto("/");
    expect(await barWidth(card(page).getByRole("listitem").filter({ hasText: `Late job ${tag}` }))).toBeGreaterThanOrEqual(3);
    expect(await barWidth(card(page).getByRole("listitem").filter({ hasText: `Soon job ${tag}` }))).toBe(0);
    expect(await barWidth(page.getByRole("listitem").filter({ hasText: `Late task ${tag}` }))).toBeGreaterThanOrEqual(3);
    await page.goto("/upkeep");
    expect(await barWidth(row(page, `Late job ${tag}`))).toBeGreaterThanOrEqual(3);
    expect(await barWidth(row(page, `Soon job ${tag}`))).toBe(0);
    expect(await titleLeft(row(page, `Late job ${tag}`))).toBe(await titleLeft(row(page, `Soon job ${tag}`)));
  });

  for (const scheme of ["light", "dark"] as const) {
    test(`in ${scheme} mode a button and an input have an edge of at least 3:1 against the card`, async ({ page, request }) => {
      await seedUpkeep(request, weekly("Edge job", 7));
      await page.emulateMedia({ colorScheme: scheme });
      await page.goto("/upkeep");
      const done = page.getByRole("button", { name: "Done: Edge job" });
      const doneEdge = await done.evaluate((element) => getComputedStyle(element).borderTopColor);
      const ground = await page.getByRole("listitem").first().evaluate((element) => getComputedStyle(element.closest("section") ?? element).backgroundColor);
      expect(await ratio(page, doneEdge, ground)).toBeGreaterThanOrEqual(3);
      await page.getByRole("button", { name: "Add an item" }).click();
      const input = page.getByRole("dialog").getByRole("textbox", { name: "Name" });
      const [inputEdge, inputGround] = await input.evaluate((element) => [getComputedStyle(element).borderTopColor, getComputedStyle(element).backgroundColor]);
      expect(await ratio(page, inputEdge ?? "", inputGround ?? "")).toBeGreaterThanOrEqual(3);
    });
  }

  test("every list page puts its title and main action in the same place", async ({ page }) => {
    const tops: number[] = [];
    const sizes: number[] = [];
    for (const [path, title] of [["/items", "Items"], ["/upkeep", "Upkeep"], ["/groceries", "Groceries"], ["/schedule", "Schedule"], ["/people", "People"], ["/assistant", "Assistant"]] as const) {
      await page.goto(path);
      const heading = page.getByRole("heading", { level: 1, name: title });
      tops.push(Math.round((await heading.boundingBox())?.y ?? -1));
      sizes.push(await fontSize(heading));
    }
    expect(new Set(tops).size).toBe(1);
    expect(new Set(sizes).size).toBe(1);
  });

  test("the Upkeep note is one short sentence", async ({ page }) => {
    await page.goto("/upkeep");
    await expect(page.getByText("Jobs that come round every few weeks, months or years.", { exact: true })).toBeVisible();
    await expect(page.getByText(/Everyone in the household/)).toHaveCount(0);
  });

  test("Edit sits in the same place on an event row and a task row", async ({ page, request }) => {
    const tag = randomUUID().slice(0, 8);
    await seedTask(request, { title: `Plain task ${tag}`, dueDate: todayUtc(), dueTime: "10:00" });
    await seedEvent(request, { title: `Plain event ${tag}`, date: todayUtc(), time: "11:00" });
    await page.goto("/schedule");
    const taskEdit = await page.getByRole("button", { name: `Edit Plain task ${tag}` }).boundingBox();
    const eventEdit = await page.getByRole("button", { name: `Edit Plain event ${tag}` }).boundingBox();
    expect(Math.round(taskEdit?.x ?? -1)).toBe(Math.round(eventEdit?.x ?? -2));
  });

  test("the People page stops growing on a wide screen too", async ({ page }) => {
    await page.setViewportSize({ width: 1600, height: 900 });
    await page.goto("/people");
    const rootSize = await page.evaluate(() => parseFloat(getComputedStyle(document.documentElement).fontSize));
    const box = await page.getByRole("heading", { level: 1, name: "People" }).locator("xpath=ancestor::header/..").boundingBox();
    expect(box?.width ?? 9999).toBeLessThanOrEqual(48 * rootSize + 1);
  });

  test("the list pages stop growing on a wide screen, so a name and its button stay close", async ({ page, request }) => {
    await seedUpkeep(request, weekly("Width job", 7));
    await page.setViewportSize({ width: 1600, height: 900 });
    await page.goto("/upkeep");
    const box = await row(page, "Width job").boundingBox();
    const rootSize = await page.evaluate(() => parseFloat(getComputedStyle(document.documentElement).fontSize));
    expect(box?.width ?? 9999).toBeLessThanOrEqual(48 * rootSize + 1);
  });

  test("a card with more rows than fit shows a short fade, not a tall one", async ({ page, request }) => {
    for (let index = 0; index < 8; index += 1) await seedUpkeep(request, weekly(`Many ${index}`, 7));
    await page.setViewportSize({ width: 1280, height: 600 });
    await page.goto("/");
    const fade = card(page).getByTestId("scroll-fade");
    await expect(fade).toBeVisible();
    const rootSize = await page.evaluate(() => parseFloat(getComputedStyle(document.documentElement).fontSize));
    expect((await fade.boundingBox())?.height).toBeCloseTo(2 * rootSize, 0);
  });

  test("the Assistant page does not repeat its title in a card heading, but keeps it for screen readers", async ({ page }) => {
    await page.goto("/assistant");
    const heading = page.getByRole("heading", { name: "Chat" });
    await expect(heading).toBeAttached();
    expect((await heading.boundingBox())?.width ?? 99).toBeLessThanOrEqual(1);
  });
});
