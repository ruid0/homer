import { expect, test, type Page } from "@playwright/test";
import { contrastOf } from "./contrast";
import { failure, gate, interceptCall } from "./intercept";
import { randomUUID } from "node:crypto";
import { clearUpkeep, daysAgo, seedEvent, seedItem, seedPerson, seedTask, seedUpkeep, todayUtc } from "./scratch";

const RETRIES = { timeout: 20_000 };

test.describe.configure({ mode: "serial", timeout: 60_000 });

test.beforeEach(async ({ request }) => {
  await clearUpkeep(request);
});

const row = (page: Page, name: string) => page.getByRole("listitem").filter({ has: page.getByText(name, { exact: true }) });

const card = (page: Page) => page.getByRole("region", { name: "Upkeep" });

// Due today, and after Done due in two weeks, so it leaves the card.
const fortnightly = (name: string) => ({ name, every: 2, unit: "weeks" as const, lastDoneOn: daysAgo(14) });

const weekly = (name: string, lastDoneDaysAgo: number) => ({ name, every: 1, unit: "weeks" as const, lastDoneOn: daysAgo(lastDoneDaysAgo) });

test.describe("the Upkeep card on Home", () => {
  test("says nothing is due when the list is empty or everything is later", async ({ page, request }) => {
    await page.goto("/");
    await expect(card(page).getByText("Nothing due this week.")).toBeVisible();
    await seedUpkeep(request, { name: "Far job", every: 6, unit: "months", lastDoneOn: daysAgo(10) });
    await page.reload();
    await expect(card(page).getByText("Nothing due this week.")).toBeVisible();
    await expect(card(page).getByText("Far job")).toHaveCount(0);
  });

  test("shows a loading line, not the empty one, while the list loads", async ({ page, request }) => {
    await seedUpkeep(request, weekly("Held job", 7));
    const held = gate();
    await interceptCall(page, "maintenance.list", { when: held.when });
    try {
      await page.goto("/");
      await expect(card(page).getByRole("status")).toHaveText("Loading.");
      await expect(card(page).getByText("Nothing due this week.")).toHaveCount(0);
    } finally {
      held.release();
    }
    await expect(card(page).getByText("Held job", { exact: true })).toBeVisible();
  });

  test("says so when the list cannot be loaded, and not that nothing is due", async ({ page }) => {
    await interceptCall(page, "maintenance.list", { answer: failure("down") });
    await page.goto("/");
    await expect(card(page).getByRole("alert")).toHaveText(/Couldn't load what is due/, RETRIES);
    await expect(card(page).getByText("Nothing due this week.")).toHaveCount(0);
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
    await expect(card(page).getByText("Nothing due this week.")).toBeVisible();
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
    await expect(card(page).getByText("Nothing due this week.")).toBeVisible();
  });

  test("after the last due item is done, focus stays on the card instead of dropping to the top of the page", async ({ page, request }) => {
    await seedUpkeep(request, fortnightly("Today job"));
    await page.goto("/");
    await card(page).getByRole("button", { name: "Done: Today job" }).click();
    await expect(card(page).getByText("Nothing due this week.")).toBeVisible();
    await expect(card(page).locator(":focus")).toHaveCount(1);
  });

  test("a second done on the same day is refused in words, and the item stays", async ({ page, request }) => {
    await seedUpkeep(request, weekly("Fresh job", 7));
    await page.goto("/");
    await card(page).getByRole("button", { name: "Done: Fresh job" }).click();
    // The first save has to finish first: a button is disabled while it saves, so an early second tap does nothing.
    await expect(page.getByRole("status").filter({ hasText: "Fresh job marked done." })).toBeVisible();
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
      for (const text of [card(page).getByText("13 days overdue"), card(page).getByText("Due in 2 days"), card(page).getByRole("heading", { name: "Upkeep" })]) {
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
      await page.getByRole("button", { name: "Add job" }).click();
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

  test("Today scrolls inside itself and shows a short fade when it has more rows than fit", async ({ page, request }) => {
    const tag = randomUUID().slice(0, 8);
    for (let index = 0; index < 14; index += 1) await seedTask(request, { title: `Fade task ${tag} ${index}`, dueDate: todayUtc(), dueTime: "23:59" });
    await page.setViewportSize({ width: 1280, height: 600 });
    await page.goto("/");
    const fade = page.getByRole("region", { name: "Today" }).getByTestId("scroll-fade");
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

const animationName = (locator: ReturnType<Page["locator"]>, pseudo?: string) =>
  locator.evaluate((element, which) => getComputedStyle(element, which ?? null).animationName, pseudo);

test.describe("motion", () => {
  test("a dialog opens with a short fade and scale on a wide screen, centred", async ({ page, request }) => {
    await seedUpkeep(request, weekly("Gutters", 7));
    await page.goto("/upkeep");
    await page.getByRole("button", { name: "Add job" }).click();
    const dialog = page.getByRole("dialog");
    expect(await animationName(dialog)).toBe("dialog-in");
    expect(await animationName(dialog, "::backdrop")).toBe("backdrop-in");
    const box = await dialog.boundingBox();
    expect(Math.round((box?.x ?? 0) + (box?.width ?? 0) / 2)).toBe(640);
  });

  test.describe("on a phone", () => {
    test.use({ viewport: { width: 375, height: 700 } });

    test("a dialog is a sheet that slides up from the bottom edge, full width", async ({ page }) => {
      await page.goto("/upkeep");
      await page.getByRole("button", { name: "Add job" }).click();
      const dialog = page.getByRole("dialog");
      expect(await animationName(dialog)).toBe("sheet-up");
      await expect.poll(async () => Math.round(((await dialog.boundingBox())?.y ?? 0) + ((await dialog.boundingBox())?.height ?? 0))).toBe(700);
      expect(Math.round((await dialog.boundingBox())?.width ?? 0)).toBe(375);
    });
  });

  test("a Done flashes the row that moved and slides the toast in, and nothing else flashes", async ({ page, request }) => {
    await seedUpkeep(request, weekly("Moved job", 20));
    await seedUpkeep(request, weekly("Other job", 10));
    await page.goto("/upkeep");
    await page.getByRole("button", { name: "Done: Moved job" }).click();
    await expect(page.getByRole("status").filter({ hasText: "Moved job marked done." })).toBeVisible();
    expect(await animationName(row(page, "Moved job"))).toBe("row-flash");
    expect(await animationName(row(page, "Other job"))).toBe("none");
    expect(await animationName(page.getByRole("status").filter({ hasText: "Moved job marked done." }))).toBe("toast-in");
  });

  test("the flash is one short moment: the row stops being marked once it has played", async ({ page, request }) => {
    await seedUpkeep(request, weekly("Brief job", 20));
    await page.goto("/upkeep");
    await page.getByRole("button", { name: "Done: Brief job" }).click();
    await expect.poll(() => animationName(row(page, "Brief job"))).toBe("row-flash");
    await expect.poll(() => animationName(row(page, "Brief job")), { timeout: 5_000 }).toBe("none");
  });

  test("a done on Home flashes the row that stays on the card", async ({ page, request }) => {
    await seedUpkeep(request, weekly("Stays job", 7));
    await page.goto("/");
    await card(page).getByRole("button", { name: "Done: Stays job" }).click();
    await expect(page.getByRole("status").filter({ hasText: "Stays job marked done." })).toBeVisible();
    expect(await animationName(card(page).getByRole("listitem").filter({ hasText: "Stays job" }))).toBe("row-flash");
  });

  test("a toast settles in the middle of the screen once it has slid in", async ({ page, request }) => {
    await seedUpkeep(request, weekly("Centre job", 20));
    await page.goto("/upkeep");
    await page.getByRole("button", { name: "Done: Centre job" }).click();
    const toast = page.getByRole("status").filter({ hasText: "Centre job marked done." });
    await expect(toast).toBeVisible();
    await expect
      .poll(async () => {
        const box = await toast.boundingBox();
        return Math.round((box?.x ?? 0) + (box?.width ?? 0) / 2);
      })
      .toBe(640);
  });

  test("a button that is saving does not shrink when pressed", async ({ page, request }) => {
    await seedUpkeep(request, weekly("Busy job", 7));
    const held = gate();
    await interceptCall(page, "maintenance.markDone", { when: held.when });
    await page.goto("/upkeep");
    try {
      await page.getByRole("button", { name: "Done: Busy job" }).click();
      const done = page.getByRole("button", { name: "Done: Busy job" });
      await expect(done).toBeDisabled();
      const box = await done.boundingBox();
      await page.mouse.move((box?.x ?? 0) + 10, (box?.y ?? 0) + 10);
      await page.mouse.down();
      expect(await done.evaluate((element) => getComputedStyle(element).scale)).not.toBe("0.97");
      await page.mouse.up();
    } finally {
      held.release();
    }
  });

  test("a button gives a small press response while it is held down", async ({ page, request }) => {
    await seedUpkeep(request, weekly("Press job", 7));
    await page.goto("/upkeep");
    const done = page.getByRole("button", { name: "Done: Press job" });
    const box = await done.boundingBox();
    await page.mouse.move((box?.x ?? 0) + 10, (box?.y ?? 0) + 10);
    await page.mouse.down();
    await expect.poll(() => done.evaluate((element) => getComputedStyle(element).scale)).toBe("0.97");
    await page.mouse.move(0, 0);
    await page.mouse.up();
  });

  test("with reduced motion asked for, the dialog, backdrop, toast, flash, press response and nav fade are all off", async ({ page, request }) => {
    await seedUpkeep(request, weekly("Calm job", 20));
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto("/upkeep");
    await page.getByRole("button", { name: "Done: Calm job" }).click();
    const toast = page.getByRole("status").filter({ hasText: "Calm job marked done." });
    await expect(toast).toBeVisible();
    expect(await animationName(toast)).toBe("none");
    expect(await animationName(row(page, "Calm job"))).toBe("none");
    await page.getByRole("button", { name: "Add job" }).click();
    const dialog = page.getByRole("dialog");
    expect(await animationName(dialog)).toBe("none");
    expect(await animationName(dialog, "::backdrop")).toBe("none");
    expect(await page.getByRole("button", { name: "Save" }).evaluate((element) => getComputedStyle(element).transitionDuration)).toBe("0s");
    await page.getByRole("button", { name: "Cancel" }).click();
    expect(await page.getByRole("link", { name: "Home" }).first().evaluate((element) => getComputedStyle(element).transitionDuration)).toBe("0s");
  });
});

test.describe("Home layout, naming and the nav", () => {
  test("from lg the cards sit in two columns: Today on the left, Upkeep over Running out on the right", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto("/");
    const today = await page.getByRole("region", { name: "Today" }).boundingBox();
    const upkeep = await page.getByRole("region", { name: "Upkeep" }).boundingBox();
    const running = await page.getByRole("region", { name: "Running out" }).boundingBox();
    expect(upkeep?.x ?? 0).toBeGreaterThan((today?.x ?? 0) + (today?.width ?? 0) - 1);
    expect(Math.round(running?.x ?? -1)).toBe(Math.round(upkeep?.x ?? -2));
    expect(running?.y ?? 0).toBeGreaterThan((upkeep?.y ?? 0) + (upkeep?.height ?? 0) - 1);
  });

  test.describe("on a tablet in portrait", () => {
    test.use({ viewport: { width: 820, height: 1180 } });

    test("the cards stack in one column, and an overdue job puts Upkeep first", async ({ page, request }) => {
      await page.goto("/");
      const y = async (name: string) => (await page.getByRole("region", { name }).boundingBox())?.y ?? -1;
      expect(await y("Today")).toBeLessThan(await y("Upkeep"));
      await seedUpkeep(request, weekly("Late job", 20));
      await page.reload();
      await expect(card(page).getByText("13 days overdue")).toBeVisible();
      expect(await y("Upkeep")).toBeLessThan(await y("Today"));
      const x = async (name: string) => Math.round((await page.getByRole("region", { name }).boundingBox())?.x ?? -1);
      expect(new Set([await x("Today"), await x("Upkeep"), await x("Running out")]).size).toBe(1);
    });
  });

  test("Upkeep and Running out are as tall as their rows: all rows show and nothing fades or scrolls inside", async ({ page, request }) => {
    for (let index = 0; index < 8; index += 1) await seedUpkeep(request, weekly(`Many ${index}`, 7));
    await page.setViewportSize({ width: 1280, height: 600 });
    await page.goto("/");
    await expect(card(page).getByRole("listitem")).toHaveCount(8);
    await expect(card(page).getByTestId("scroll-fade")).toHaveCount(0);
    expect(await card(page).evaluate((element) => element.scrollHeight - element.clientHeight)).toBeLessThanOrEqual(0);
  });

  test("the Upkeep card title is a link to the Upkeep page", async ({ page }) => {
    await page.goto("/");
    await card(page).getByRole("link", { name: "Upkeep" }).click();
    await expect(page).toHaveURL(/\/upkeep$/);
  });

  test("the nav lists the pages in the agreed order", async ({ page }) => {
    await page.goto("/");
    const labels = await page.getByRole("navigation", { name: "Main" }).getByRole("link").allTextContents();
    expect(labels.map((label) => label.replace(/\d+\+?/g, "").trim()).filter((label) => label !== "" && label !== "HOMER")).toEqual([
      "Home", "Groceries", "Schedule", "Upkeep", "Items", "People", "Assistant",
    ]);
  });

  test("the Upkeep nav item shows how many jobs need doing, in words for a screen reader, and nothing when none do", async ({ page, request }) => {
    await page.goto("/");
    const nav = page.getByRole("navigation", { name: "Main" });
    await expect(nav.getByRole("link", { name: "Upkeep", exact: true })).toBeVisible();
    await seedUpkeep(request, weekly("Late one", 20));
    await seedUpkeep(request, weekly("Soon one", 5));
    await page.reload();
    await expect(nav.getByRole("link", { name: "Upkeep 2 due" })).toBeVisible();
    await expect(nav.getByRole("link", { name: "Upkeep 2 due" })).toContainText("2");
  });

  test("the badge is red when something is late, amber when jobs are only due this week", async ({ page, request }) => {
    await seedUpkeep(request, weekly("Soon only", 5));
    await page.goto("/");
    const badge = page.getByRole("navigation", { name: "Main" }).getByRole("link", { name: /^Upkeep/ }).locator("[data-level]");
    await expect(badge).toHaveAttribute("data-level", "soon", RETRIES);
    await seedUpkeep(request, weekly("Now late", 20));
    await page.reload();
    await expect(badge).toHaveAttribute("data-level", "late", RETRIES);
  });

  test("marking a job done lowers the badge count", async ({ page, request }) => {
    await seedUpkeep(request, { name: "Badge done", every: 2, unit: "weeks", lastDoneOn: daysAgo(30) });
    await seedUpkeep(request, weekly("Badge stays", 20));
    await page.goto("/");
    const nav = page.getByRole("navigation", { name: "Main" });
    await expect(nav.getByRole("link", { name: "Upkeep 2 due" })).toBeVisible();
    await page.getByRole("button", { name: "Done: Badge done" }).click();
    await expect(nav.getByRole("link", { name: "Upkeep 1 due" })).toBeVisible(RETRIES);
  });

  test("the badge stops at 9+", async ({ page, request }) => {
    for (let index = 0; index < 11; index += 1) await seedUpkeep(request, weekly(`Badge ${index}`, 20));
    await page.goto("/");
    await expect(page.getByRole("navigation", { name: "Main" }).getByRole("link", { name: /^Upkeep/ }).getByText("9+")).toBeVisible();
  });

  test("Items calls the stock button 'Ran out', not 'Out of it'", async ({ page, request }) => {
    const tag = randomUUID().slice(0, 8);
    await seedItem(request, `Naming ${tag}`);
    await page.goto("/items");
    await expect(page.getByRole("button", { name: `Ran out: Naming ${tag}` })).toBeVisible();
    await expect(page.getByRole("button", { name: /^Out of it/ })).toHaveCount(0);
  });

  test("the routine page links back with 'Back to People'", async ({ page, request }) => {
    const personId = await seedPerson(request);
    await page.goto(`/people/${personId}/routine`);
    await expect(page.getByRole("link", { name: "Back to People" })).toBeVisible();
  });

  test("buying from Running out says what was bought, in one short line", async ({ page, request }) => {
    const tag = randomUUID().slice(0, 8);
    await seedItem(request, `Toast ${tag}`);
    await page.goto("/");
    await page.getByRole("button", { name: `Bought it: Toast ${tag}` }).click();
    await page.getByRole("dialog").getByRole("button", { name: "Save" }).click();
    await expect(page.getByRole("status").filter({ hasText: `Toast ${tag}: 1 bought.` })).toBeVisible();
  });

  test("every page says 'Loading.' while it loads, not its own sentence", async ({ page }) => {
    const held = gate();
    await interceptCall(page, "inventory.list", { when: held.when });
    try {
      await page.goto("/items");
      await expect(page.getByText("Loading.", { exact: true })).toBeVisible();
    } finally {
      held.release();
    }
  });
});
