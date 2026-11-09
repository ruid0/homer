import { expect, test, type Page } from "@playwright/test";
import { clearUpkeep, daysAgo, seedUpkeep } from "./scratch";

test.describe.configure({ mode: "serial", timeout: 60_000 });

test.beforeEach(async ({ request }) => {
  await clearUpkeep(request);
});

const row = (page: Page, name: string) => page.getByRole("listitem").filter({ has: page.getByText(name, { exact: true }) });

const weekly = (name: string, lastDoneDaysAgo: number | null) => ({
  name,
  every: 1,
  unit: "weeks" as const,
  lastDoneOn: lastDoneDaysAgo === null ? null : daysAgo(lastDoneDaysAgo),
});

// A job that is not due for months: it sits under Later.
const far = (name: string) => ({ name, every: 6, unit: "months" as const, lastDoneOn: daysAgo(10) });

const seedLater = async (request: Parameters<typeof seedUpkeep>[0], count: number) => {
  for (const letter of "ABCDEFGH".slice(0, count)) await seedUpkeep(request, far(`Later ${letter}`));
};

test.describe("the chips", () => {
  test("a row shows how often and when it was last done, and a job never done says so", async ({ page, request }) => {
    await seedUpkeep(request, { name: "Done job", every: 3, unit: "months", lastDoneOn: daysAgo(20) });
    await seedUpkeep(request, weekly("Never job", null));
    await page.goto("/upkeep");
    await expect(row(page, "Done job").getByText("Every 3 months", { exact: true })).toBeVisible();
    await expect(row(page, "Done job").getByText(/^Last done \d+ \w+/)).toBeVisible();
    await expect(row(page, "Never job").getByText("Every week", { exact: true })).toBeVisible();
    // The status already says it, so a job never done has one "Not done yet", not a chip as well.
    await expect(row(page, "Never job").getByText("Not done yet", { exact: true })).toHaveCount(1);
    await expect(row(page, "Never job").getByRole("listitem")).toHaveCount(1);
  });
});

test.describe("opening a job", () => {
  test("tapping the row opens the editor", async ({ page, request }) => {
    await seedUpkeep(request, weekly("Gutters", 20));
    await page.goto("/upkeep");
    await row(page, "Gutters").getByText("Every week", { exact: true }).click();
    await expect(page.getByRole("dialog")).toContainText("Edit Gutters");
  });

  test("tapping Done marks it done and does not open the editor", async ({ page, request }) => {
    await seedUpkeep(request, weekly("Gutters", 20));
    await page.goto("/upkeep");
    await page.getByRole("button", { name: "Done: Gutters" }).click();
    await expect(page.getByRole("status").filter({ hasText: "Gutters marked done." })).toBeVisible();
    await expect(page.getByRole("dialog")).toHaveCount(0);
  });

  test("clicking Edit opens one editor, not two", async ({ page, request }) => {
    await seedUpkeep(request, weekly("Gutters", 20));
    await page.goto("/upkeep");
    await page.getByRole("button", { name: "Edit Gutters" }).click();
    await expect(page.getByRole("dialog")).toHaveCount(1);
  });

  test("selecting the text on a row does not open the editor", async ({ page, request }) => {
    await seedUpkeep(request, weekly("Gutters", 20));
    await page.goto("/upkeep");
    const name = await row(page, "Gutters").getByText("Gutters", { exact: true }).boundingBox();
    await page.mouse.move(name!.x + 1, name!.y + name!.height / 2);
    await page.mouse.down();
    await page.mouse.move(name!.x + name!.width - 1, name!.y + name!.height / 2, { steps: 5 });
    await page.mouse.up();
    expect(await page.evaluate(() => window.getSelection()?.toString())).not.toBe("");
    await expect(page.getByRole("dialog")).toHaveCount(0);
  });

  test("closing the editor opened from a row puts focus back on that row's Edit button", async ({ page, request }) => {
    await seedUpkeep(request, weekly("Gutters", 20));
    await page.goto("/upkeep");
    await row(page, "Gutters").getByText("Every week", { exact: true }).click();
    await expect(page.getByRole("dialog")).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Edit Gutters" })).toBeFocused();
  });

  test("Edit still opens it from the keyboard", async ({ page, request }) => {
    await seedUpkeep(request, weekly("Gutters", 20));
    await page.goto("/upkeep");
    await page.getByRole("button", { name: "Edit Gutters" }).focus();
    await page.keyboard.press("Enter");
    await expect(page.getByRole("dialog")).toHaveCount(1);
    await expect(page.getByRole("dialog")).toContainText("Edit Gutters");
  });
});

test.describe("Done on a Later row", () => {
  test("is quiet, with no outline, and is still a full-size target; Due now keeps its outline", async ({ page, request }) => {
    await seedUpkeep(request, weekly("Due job", 20));
    await seedUpkeep(request, far("Far job"));
    await page.goto("/upkeep");
    const outline = (name: string) =>
      page.getByRole("button", { name: `Done: ${name}` }).evaluate((element) => Number.parseFloat(getComputedStyle(element).borderTopWidth));
    expect(await outline("Due job")).toBeGreaterThan(0);
    expect(await outline("Far job")).toBe(0);
    const box = await page.getByRole("button", { name: "Done: Far job" }).boundingBox();
    expect(box?.height).toBeGreaterThanOrEqual(44);
    expect(box?.width).toBeGreaterThanOrEqual(44);
  });

  test("still marks the job done", async ({ page, request }) => {
    await seedUpkeep(request, far("Far job"));
    await page.goto("/upkeep");
    await page.getByRole("button", { name: "Done: Far job" }).click();
    await expect(page.getByRole("status").filter({ hasText: "Far job marked done." })).toBeVisible();
  });
});

test.describe("a long Later list", () => {
  test("up to 5 rows stay open under a plain Later heading", async ({ page, request }) => {
    await seedLater(request, 5);
    await page.goto("/upkeep");
    await expect(page.getByRole("heading", { name: "Later", exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: /^Later \(/ })).toHaveCount(0);
    for (const letter of "ABCDE") await expect(page.getByText(`Later ${letter}`, { exact: true })).toBeVisible();
  });

  test("6 rows fold away behind a button with the count, and say which job comes next", async ({ page, request }) => {
    await seedLater(request, 6);
    await page.goto("/upkeep");
    const toggle = page.getByRole("button", { name: "Later (6)" });
    await expect(toggle).toHaveAttribute("aria-expanded", "false");
    await expect(page.getByText(/^Next: Later A, due /)).toBeVisible();
    await expect(page.getByText("Later B", { exact: true })).toHaveCount(0);
  });

  test("opens and closes from the keyboard, and the next-job note goes while it is open", async ({ page, request }) => {
    await seedLater(request, 6);
    await page.goto("/upkeep");
    const toggle = page.getByRole("button", { name: "Later (6)" });
    await toggle.focus();
    await page.keyboard.press("Enter");
    await expect(toggle).toHaveAttribute("aria-expanded", "true");
    await expect(page.getByText("Later F", { exact: true })).toBeVisible();
    await expect(page.getByText(/^Next: /)).toHaveCount(0);
    await page.keyboard.press("Space");
    await expect(toggle).toHaveAttribute("aria-expanded", "false");
    await expect(page.getByText("Later F", { exact: true })).toHaveCount(0);
    await expect(page.getByText(/^Next: Later A/)).toBeVisible();
  });

  test("a job in an opened Later can still be edited", async ({ page, request }) => {
    await seedLater(request, 6);
    await page.goto("/upkeep");
    await page.getByRole("button", { name: "Later (6)" }).click();
    await page.getByRole("button", { name: "Edit Later C" }).click();
    await expect(page.getByRole("dialog")).toContainText("Edit Later C");
  });

  test("when removing a job brings Later down to 5 it opens again under a plain heading", async ({ page, request }) => {
    await seedLater(request, 6);
    await page.goto("/upkeep");
    await page.getByRole("button", { name: "Later (6)" }).click();
    await page.getByRole("button", { name: "Edit Later F" }).click();
    await page.getByRole("button", { name: "Remove item" }).click();
    await page.getByRole("button", { name: "Yes, remove it" }).click();
    await expect(page.getByRole("heading", { name: "Later", exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: /^Later \(/ })).toHaveCount(0);
    await expect(page.getByText("Later E", { exact: true })).toBeVisible();
  });

  test("once Later is short and then long again it starts folded, not open", async ({ page, request }) => {
    await seedLater(request, 6);
    await page.goto("/upkeep");
    await page.getByRole("button", { name: "Later (6)" }).click();
    await page.getByRole("button", { name: "Edit Later F" }).click();
    await page.getByRole("button", { name: "Remove item" }).click();
    await page.getByRole("button", { name: "Yes, remove it" }).click();
    await expect(page.getByRole("button", { name: /^Later \(/ })).toHaveCount(0);

    await page.getByRole("button", { name: "Add job" }).click();
    const dialog = page.getByRole("dialog");
    await dialog.getByRole("button", { name: "Dryer vent" }).click();
    await dialog.getByLabel("Not done yet").uncheck();
    await dialog.getByLabel("Last done").fill(daysAgo(10));
    await dialog.getByRole("button", { name: "Save" }).click();
    await expect(page.getByRole("button", { name: "Later (6)" })).toHaveAttribute("aria-expanded", "false");
  });

  test("a due job sits above the fold and its Done still works", async ({ page, request }) => {
    await seedLater(request, 6);
    await seedUpkeep(request, weekly("Due job", 20));
    await page.goto("/upkeep");
    await page.getByRole("button", { name: "Done: Due job" }).click();
    await expect(page.getByRole("status").filter({ hasText: "Due job marked done." })).toBeVisible();
  });
});

test.describe("layout", () => {
  test.describe("on a phone", () => {
    test.use({ viewport: { width: 375, height: 700 } });

    test("Done is on the name's line, the status below, and Edit on the chips' line", async ({ page, request }) => {
      await seedUpkeep(request, weekly("Gutters", 20));
      await page.goto("/upkeep");
      const item = row(page, "Gutters");
      const name = await item.getByText("Gutters", { exact: true }).boundingBox();
      const done = await page.getByRole("button", { name: "Done: Gutters" }).boundingBox();
      const status = await item.getByText("days overdue").boundingBox();
      const chip = await item.getByText("Every week", { exact: true }).boundingBox();
      const edit = await page.getByRole("button", { name: "Edit Gutters" }).boundingBox();
      expect(done && name && Math.abs(done.y + done.height / 2 - (name.y + name.height / 2))).toBeLessThan(name!.height);
      expect(status!.y).toBeGreaterThan(name!.y + name!.height - 1);
      expect(chip!.y).toBeGreaterThan(status!.y);
      expect(edit!.y + edit!.height).toBeGreaterThan(chip!.y);
      expect(edit!.y).toBeGreaterThan(done!.y + done!.height - 1);
    });

    test("a long list folds into one line of Later and the page does not scroll sideways", async ({ page, request }) => {
      await seedLater(request, 8);
      await page.goto("/upkeep");
      await expect(page.getByRole("button", { name: "Later (8)" })).toBeInViewport();
      expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0);
    });
  });

  test.describe("on a tablet", () => {
    test.use({ viewport: { width: 820, height: 1000 } });

    test("Edit and Done sit together at the right, level with the middle of the row", async ({ page, request }) => {
      await seedUpkeep(request, weekly("Gutters", 20));
      await page.goto("/upkeep");
      const name = await row(page, "Gutters").getByText("Gutters", { exact: true }).boundingBox();
      const edit = await page.getByRole("button", { name: "Edit Gutters" }).boundingBox();
      const done = await page.getByRole("button", { name: "Done: Gutters" }).boundingBox();
      expect(edit!.x).toBeGreaterThan(name!.x + 100);
      expect(done!.x).toBeGreaterThan(edit!.x);
      expect(Math.abs(done!.y - edit!.y)).toBeLessThan(2);
    });
  });
});
