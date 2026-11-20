import { expect, test, type Page } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { contrastOf } from "./contrast";
import { seedEvent, seedTask, todayUtc } from "./scratch";

const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

const unique = (label: string) => `${label} ${randomUUID().slice(0, 8)}`;

const fontSize = (locator: ReturnType<Page["locator"]>) =>
  locator.evaluate((element) => parseFloat(getComputedStyle(element).fontSize));

const todayParts = () => {
  const now = new Date();
  return { weekday: WEEKDAYS[now.getUTCDay()] ?? "", date: `${now.getUTCDate()} ${MONTHS[now.getUTCMonth()] ?? ""}` };
};

test.describe("Home heading and summary", () => {
  test("the weekday is big, the date is smaller and muted, and the heading still reads as one date", async ({
    page,
  }) => {
    await page.goto("/");
    const { weekday, date } = todayParts();
    const heading = page.getByRole("heading", { level: 1, name: `${weekday} ${date}` });
    await expect(heading).toBeVisible();
    const day = heading.getByText(weekday, { exact: true });
    const dateLine = heading.getByText(date, { exact: true });
    expect(await fontSize(day)).toBeGreaterThan((await fontSize(dateLine)) * 1.5);
    await expect(dateLine).toHaveClass(/text-muted/);
    expect(await contrastOf(dateLine)).toBeGreaterThanOrEqual(4.5);
  });

  test("a task due today shows in the one-line summary under the date", async ({ page, request }) => {
    await seedTask(request, { title: unique("Summary task"), dueDate: todayUtc() });
    await page.goto("/");
    const summary = page.locator("main header p");
    await expect(summary).toHaveText(/^\d+ tasks? left/);
  });

  test("the summary wraps inside the width at 360px and the heading does not overflow", async ({ page, request }) => {
    await seedTask(request, { title: unique("Summary task"), dueDate: todayUtc() });
    await seedEvent(request, { title: unique("Late event"), date: todayUtc(), time: "23:59" });
    await page.setViewportSize({ width: 360, height: 740 });
    await page.goto("/");
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    const box = await page.locator("main header p").boundingBox();
    expect(box!.x + box!.width).toBeLessThanOrEqual(360);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  });

  test("an event still to come is in the summary, so a day with only an event is not called empty", async ({
    page,
    request,
  }) => {
    await seedEvent(request, { title: unique("Late event"), date: todayUtc(), time: "23:59" });
    await page.goto("/");
    await expect(page.locator("main header p")).toContainText(/\d+ events? to come/);
  });

  test("the summary line keeps its height while the counts load", async ({ page }) => {
    await page.route("**/trpc/schedule.view*", async (route) => {
      await new Promise((resolve) => setTimeout(resolve, 600));
      await route.continue();
    });
    await page.goto("/");
    const line = page.locator("main header p");
    await expect(line).toBeVisible();
    const before = (await line.boundingBox())!.height;
    await expect(line).toHaveText(/\S/);
    expect((await line.boundingBox())!.height).toBeGreaterThanOrEqual(before);
    expect(before).toBeGreaterThanOrEqual(28);
  });

  for (const scheme of ["light", "dark"] as const) {
    test(`in ${scheme} mode the summary is readable`, async ({ page, request }) => {
      await seedTask(request, { title: unique("Summary task"), dueDate: todayUtc() });
      await page.emulateMedia({ colorScheme: scheme });
      await page.goto("/");
      const summary = page.getByText(/^\d+ tasks? left/);
      await expect(summary).toBeVisible();
      expect(await contrastOf(summary)).toBeGreaterThanOrEqual(4.5);
    });
  }
});

test.describe("the Now line on Schedule", () => {
  test("sits between the earlier and the later timed items of today, and only in today's list", async ({
    page,
    request,
  }) => {
    const early = unique("Early task");
    const late = unique("Late task");
    await seedTask(request, { title: early, dueDate: todayUtc(), dueTime: "00:00" });
    await seedTask(request, { title: late, dueDate: todayUtc(), dueTime: "23:59" });
    await page.goto("/schedule");
    await expect(page.getByText(late, { exact: true })).toBeVisible();
    await expect(page.getByText(/^Now ·/)).toBeVisible();
    const texts = await page.getByRole("listitem").allTextContents();
    const at = (needle: string) => texts.findIndex((text) => text.includes(needle));
    const now = texts.findIndex((text) => text.startsWith("Now ·"));
    expect(now).toBeGreaterThan(-1);
    expect(at(early)).toBeLessThan(now);
    expect(at(late)).toBeGreaterThan(now);
  });

  test("shows once in the week view, on today's day", async ({ page, request }) => {
    await seedTask(request, { title: unique("Week task"), dueDate: todayUtc(), dueTime: "12:00" });
    await page.goto("/schedule");
    await page.getByRole("button", { name: "Week", exact: true }).click();
    await expect(page.getByText(/^Now ·/)).toHaveCount(1);
  });

  test("Home and Schedule show the same time on the line", async ({ page, request }) => {
    await seedTask(request, { title: unique("Same time"), dueDate: todayUtc(), dueTime: "12:00" });
    await page.goto("/");
    const home = await page.getByText(/^Now ·/).textContent();
    await page.goto("/schedule");
    const schedule = await page.getByText(/^Now ·/).textContent();
    expect(schedule).toBe(home);
  });
});

test.describe("time numerals", () => {
  test("the time of a task is bigger than its title, in tabular figures, on Home and on Schedule", async ({
    page,
    request,
  }) => {
    const title = unique("Timed task");
    await seedTask(request, { title, dueDate: todayUtc(), dueTime: "13:45" });
    for (const path of ["/", "/schedule"]) {
      await page.goto(path);
      const time = page.getByText("13:45", { exact: true }).first();
      const name = page.getByText(title, { exact: true });
      expect(await fontSize(time)).toBeGreaterThan(await fontSize(name));
      expect(await time.evaluate((element) => getComputedStyle(element).fontVariantNumeric)).toContain("tabular-nums");
    }
  });

  test("a long title keeps room beside the time on Home at 360px, and Done stays on its line", async ({
    page,
    request,
  }) => {
    const title = unique("Pick up the kids from school and then the dry cleaning");
    await seedTask(request, { title, dueDate: todayUtc(), dueTime: "17:30" });
    await page.setViewportSize({ width: 360, height: 740 });
    await page.goto("/");
    const name = (await page.getByText(title, { exact: true }).boundingBox())!;
    expect(name.width).toBeGreaterThanOrEqual(100);
    const done = (await page.getByRole("button", { name: `Mark ${title} done` }).boundingBox())!;
    expect(done.y).toBeLessThan(name.y + name.height);
  });

  test("a time fits its column at 360px", async ({ page, request }) => {
    await seedTask(request, { title: unique("Timed task"), dueDate: todayUtc(), dueTime: "23:59" });
    await page.setViewportSize({ width: 360, height: 740 });
    for (const path of ["/", "/schedule"]) {
      await page.goto(path);
      const time = page.getByText("23:59", { exact: true }).first();
      expect(await time.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(true);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    }
  });
});

test.describe("the wordmark", () => {
  for (const scheme of ["light", "dark"] as const) {
    test(`has a brand dot that shows against the house in ${scheme} mode`, async ({ page }) => {
      await page.emulateMedia({ colorScheme: scheme });
      await page.setViewportSize({ width: 375, height: 740 });
      await page.goto("/");
      const dot = page.locator("[data-spark]:visible").first();
      await expect(dot).toBeVisible();
      const [fill, ground] = await dot.evaluate((element) => [
        getComputedStyle(element).fill,
        getComputedStyle(element.parentElement?.querySelector("path") ?? element).fill,
      ]);
      expect(fill).not.toBe(ground);
      const ratio = await page.evaluate(
        ([a, b]) => {
          const toRgb = (colour: string) => {
            const probe = document.createElement("canvas").getContext("2d");
            if (!probe) return [0, 0, 0];
            probe.fillStyle = colour;
            probe.fillRect(0, 0, 1, 1);
            return Array.from(probe.getImageData(0, 0, 1, 1).data).slice(0, 3);
          };
          const lum = (rgb: number[]) => {
            const [r = 0, g = 0, b2 = 0] = rgb.map((v) => {
              const s = v / 255;
              return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
            });
            return 0.2126 * r + 0.7152 * g + 0.0722 * b2;
          };
          const [x, y] = [lum(toRgb(a ?? "")), lum(toRgb(b ?? ""))];
          return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
        },
        [fill, ground],
      );
      expect(ratio).toBeGreaterThanOrEqual(3);
    });
  }
});
