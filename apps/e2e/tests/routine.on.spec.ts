import { expect, test, type Page } from "@playwright/test";
import { contrastOf } from "./contrast";
import { failure, interceptCall } from "./intercept";
import { addRow, seedEmptyPerson, seedPerson, todayLabel } from "./scratch";

const open = async (page: Page, id: number) => {
  await page.goto(`/people/${id}/routine`);
  await expect(page.getByRole("heading", { name: /'s routine$/ })).toBeVisible();
};

const circles = (page: Page, name: string) => page.getByRole("button", { name: new RegExp(`^${name}, today`) });
const days = (page: Page, name: string) => page.getByRole("button", { name: new RegExp(`^${name}, \\w{3} \\d+: `) });
const card = (page: Page, name: string) => page.getByRole("listitem").filter({ has: page.getByRole("button", { name: `Edit ${name}` }) });

const background = (locator: ReturnType<Page["locator"]>) => locator.evaluate((element) => getComputedStyle(element).backgroundColor);

// What the `ok` token paints, resolved the way the browser does.
const okColour = (page: Page) =>
  page.evaluate(() => {
    const probe = document.createElement("div");
    probe.style.backgroundColor = "var(--ok)";
    document.body.append(probe);
    const colour = getComputedStyle(probe).backgroundColor;
    probe.remove();
    return colour;
  });

test.describe("a card for each row", () => {
  test("has the name, one circle for each time today, the count and a week strip", async ({ page, request }) => {
    const id = await seedPerson(request);
    await open(page, id);
    const row = card(page, "Row A");
    await expect(row.getByRole("button", { name: "Edit Row A" })).toBeVisible();
    await expect(circles(page, "Row A")).toHaveCount(2);
    await expect(row.getByText("0 of 2")).toBeVisible();
    await expect(row.getByText(`Today, ${todayLabel()}`)).toBeVisible();
    // Days up to today are buttons; the days still to come are not.
    await expect(days(page, "Row A").or(row.getByRole("img"))).toHaveCount(7);
    await expect(days(page, "Row A").filter({ hasText: "" }).first()).toBeVisible();
  });

  test("has a key for done, part done, not done and not yet", async ({ page, request }) => {
    const id = await seedPerson(request);
    await open(page, id);
    const key = page.getByRole("group", { name: "Key" });
    for (const text of ["Done", "Part done", "Not done", "Not yet"]) await expect(key.getByText(text, { exact: true })).toBeVisible();
  });

  test("a row that is done once a day says Not done, then Done today", async ({ page, request }) => {
    const id = await seedEmptyPerson(request);
    await addRow(request, id, "Stretch");
    await open(page, id);
    await expect(circles(page, "Stretch")).toHaveCount(1);
    await expect(card(page, "Stretch")).toContainText("Not done");
    await circles(page, "Stretch").click();
    await expect(card(page, "Stretch")).toContainText("Done today");
  });

  test("with no rows there is a way to start", async ({ page, request }) => {
    const id = await seedEmptyPerson(request);
    await open(page, id);
    await expect(page.getByText(/^No rows yet/)).toBeVisible();
    await expect(page.getByRole("button", { name: "Add a row" })).toBeVisible();
    await expect(page.getByRole("group", { name: "Key" })).toHaveCount(0);
  });
});

test.describe("today's circles", () => {
  test("tap to tick, and the count follows; the last one says Done today", async ({ page, request }) => {
    const id = await seedPerson(request);
    await open(page, id);
    const saves: string[] = [];
    page.on("response", (response) => {
      if (response.url().includes("routines.setCount") && response.request().method() === "POST") saves.push(response.url());
    });
    await circles(page, "Row A").first().click();
    await expect(card(page, "Row A").getByText("1 of 2")).toBeVisible();
    await expect(circles(page, "Row A").first()).toHaveAttribute("aria-pressed", "true");
    await expect(circles(page, "Row A").last()).toHaveAttribute("aria-pressed", "false");
    await circles(page, "Row A").last().click();
    await expect(card(page, "Row A").getByText("Done today")).toBeVisible();
    await expect.poll(() => saves.length).toBe(2);
    await page.reload();
    await expect(card(page, "Row A").getByText("Done today")).toBeVisible();
  });

  test("tapping a ticked circle takes it and the ones after it away", async ({ page, request }) => {
    const id = await seedPerson(request);
    await open(page, id);
    await circles(page, "Row A").last().click();
    await expect(card(page, "Row A").getByText("Done today")).toBeVisible();
    await circles(page, "Row A").first().click();
    await expect(card(page, "Row A").getByText("0 of 2")).toBeVisible();
  });

  test("done is a green check, not done is a grey check", async ({ page, request }) => {
    const id = await seedPerson(request);
    await open(page, id);
    const first = circles(page, "Row A").first();
    const ok = await okColour(page);
    await expect(first.locator("svg")).toBeVisible();
    expect(await background(first)).not.toBe(ok);
    await first.click();
    await expect(first).toHaveAttribute("aria-pressed", "true");
    expect(await background(first)).toBe(ok);
    await expect(first.locator("svg")).toBeVisible();
    expect(await contrastOf(first)).toBeGreaterThanOrEqual(3);
  });

  test("a failed tap is a red toast, and the circle goes back", async ({ page, request }) => {
    const id = await seedPerson(request);
    await interceptCall(page, "routines.setCount", { answer: failure("Could not save. Try again.") });
    await open(page, id);
    await circles(page, "Row A").first().click();
    const toast = page.getByRole("alert").filter({ hasText: "Could not save. Try again." });
    await expect(toast).toBeVisible();
    expect(await toast.evaluate((element) => getComputedStyle(element).position)).toBe("fixed");
    await expect(circles(page, "Row A").first()).toHaveAttribute("aria-pressed", "false");
    await expect(card(page, "Row A").getByText("0 of 2")).toBeVisible();
  });
});

test.describe("the week strip", () => {
  test("today's square follows the circles, and a tap on it cycles the count", async ({ page, request }) => {
    const id = await seedPerson(request);
    await open(page, id);
    const today = page.getByRole("button", { name: new RegExp(`^Row A, ${todayLabel()}: `) });
    await expect(today).toHaveAccessibleName(`Row A, ${todayLabel()}: not done`);
    await today.click();
    await expect(today).toHaveAccessibleName(`Row A, ${todayLabel()}: 1 of 2`);
    await expect(today).toContainText("1/2");
    await today.click();
    await expect(today).toHaveAccessibleName(`Row A, ${todayLabel()}: done`);
    await expect(circles(page, "Row A").last()).toHaveAttribute("aria-pressed", "true");
    await today.click();
    await expect(today).toHaveAccessibleName(`Row A, ${todayLabel()}: not done`);
  });

  test("done is a solid square and not done an outline, so the difference is not only the hue", async ({ page, request }) => {
    const id = await seedPerson(request);
    await open(page, id);
    const today = page.getByRole("button", { name: new RegExp(`^Row A, ${todayLabel()}: `) });
    const ok = await okColour(page);
    expect(await background(today)).not.toBe(ok);
    // The edge of a button that can be pressed is the control colour, readable against the card (3:1), not the faint divider colour.
    expect(await contrastOf(today)).toBeGreaterThanOrEqual(3);
    expect(await contrastOf(circles(page, "Row A").first())).toBeGreaterThanOrEqual(3);
    await today.click();
    await today.click();
    expect(await background(today)).toBe(ok);
  });

  test("a done day is green with a check, a partial day shows its count", async ({ page, request }) => {
    const id = await seedPerson(request);
    await open(page, id);
    const today = page.getByRole("button", { name: new RegExp(`^Row A, ${todayLabel()}: `) });
    await today.click();
    await expect(today).toContainText("1/2");
    expect(await contrastOf(today.getByText("1/2"))).toBeGreaterThanOrEqual(4.5);
    await today.click();
    await expect(today.locator("svg")).toBeVisible();
  });

  test("an earlier week has no circles, every day can be changed, and This week brings you back", async ({ page, request }) => {
    const id = await seedPerson(request);
    await open(page, id);
    await expect(page.getByRole("button", { name: "Later week" })).toBeDisabled();
    await expect(page.getByRole("button", { name: "This week" })).toHaveCount(0);
    await page.getByRole("button", { name: "Earlier week" }).click();
    await expect(circles(page, "Row A")).toHaveCount(0);
    await expect(days(page, "Row A")).toHaveCount(7);
    await expect(page.getByRole("button", { name: "Later week" })).toBeEnabled();
    const first = days(page, "Row A").first();
    await first.click();
    await expect(first).toHaveAccessibleName(/: 1 of 2$/);
    await page.getByRole("button", { name: "This week" }).click();
    await expect(circles(page, "Row A")).toHaveCount(2);
  });

  test("the earliest week cannot go further back", async ({ page, request }) => {
    const id = await seedPerson(request);
    await open(page, id);
    const earlier = page.getByRole("button", { name: "Earlier week" });
    for (let step = 0; step < 20 && (await earlier.isEnabled()); step += 1) await earlier.click();
    await expect(earlier).toBeDisabled();
  });
});

test.describe("the row dialog points at things that exist", () => {
  test("the reminders note says where to look, and it is not a grid", async ({ page, request }) => {
    const id = await seedPerson(request);
    await open(page, id);
    await page.getByRole("button", { name: "Edit Row A" }).click();
    await expect(page.getByRole("dialog")).not.toContainText("grid");
  });
});

test.describe("loading and failing", () => {
  test("a failed load says so and offers no rows", async ({ page, request }) => {
    const id = await seedPerson(request);
    await interceptCall(page, "routines.week", { answer: failure("down") });
    await page.goto(`/people/${id}/routine`);
    await expect(page.getByRole("alert").filter({ hasText: "Couldn't load the routine" })).toBeVisible({ timeout: 15_000 });
    await expect(circles(page, "Row A")).toHaveCount(0);
  });
});

test.describe("on a phone", () => {
  test.use({ viewport: { width: 375, height: 667 } });

  test("on a narrow phone, off the current week, the date range stays on one line", async ({ page, request }) => {
    const id = await seedPerson(request);
    await page.setViewportSize({ width: 360, height: 640 });
    await open(page, id);
    await page.getByRole("button", { name: "Earlier week" }).click();
    const range = page.getByRole("status", { name: "Week" });
    await expect(range).toContainText(" to ");
    expect((await range.boundingBox())!.height).toBeLessThan(32);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  });

  test("the card fits the screen, the circles and strip are touch size and nothing scrolls sideways", async ({ page, request }) => {
    const id = await seedPerson(request);
    await addRow(request, id, "Herbs", 3);
    await open(page, id);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    for (const circle of await circles(page, "Herbs").all()) {
      const box = (await circle.boundingBox())!;
      expect(box.width).toBeGreaterThanOrEqual(44);
      expect(box.height).toBeGreaterThanOrEqual(44);
    }
    for (const square of await days(page, "Herbs").all()) {
      const box = (await square.boundingBox())!;
      expect(box.height).toBeGreaterThanOrEqual(44);
      expect(box.width).toBeGreaterThanOrEqual(40);
    }
    // The first card, with today's circles, is on the first screen without scrolling.
    await expect(card(page, "Row A")).toBeInViewport({ ratio: 1 });
  });

  test("twenty times a day wraps onto rows and stays inside the card on a phone", async ({ page, request }) => {
    const id = await seedEmptyPerson(request);
    await addRow(request, id, "Water", 20);
    await page.setViewportSize({ width: 360, height: 740 });
    await open(page, id);
    await expect(circles(page, "Water")).toHaveCount(20);
    const box = await card(page, "Water").boundingBox();
    const boxes = await circles(page, "Water").evaluateAll((all) => all.map((element) => element.getBoundingClientRect().toJSON()));
    expect(box).not.toBeNull();
    for (const circle of boxes) {
      expect(circle.right).toBeLessThanOrEqual(box!.x + box!.width);
      expect(circle.width).toBeGreaterThanOrEqual(44);
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    // Ticking the last circle fills all twenty, and the card says so.
    await circles(page, "Water").nth(19).click();
    await expect(card(page, "Water").getByText("Done today")).toBeVisible();
  });
});
