import { expect, test } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { daysAgo, seedItem, seedTask, todayUtc } from "./scratch";

test.describe("a long task title on a phone", () => {
  test.use({ viewport: { width: 375, height: 667 } });

  test("does not make Home or Schedule scroll sideways", async ({ page, request }) => {
    const title = `Pay the quarterly electricity and water bills before the end of the month ${randomUUID().slice(0, 8)}`;
    await seedTask(request, { title, dueDate: todayUtc(), dueTime: "08:00" });
    // The shapes that overflowed by a pixel in the full run: an overdue task and a running-out item with a short hex suffix.
    // Whether it overflows depends on the width of the letters, so several random names are tried.
    for (const _ of Array.from({ length: 8 })) {
      await seedTask(request, { title: `Late task ${randomUUID().slice(0, 8)}`, dueDate: daysAgo(3) });
      await seedItem(request, `Flour ${randomUUID().slice(0, 8)}`);
    }
    for (const path of ["/", "/schedule"]) {
      await page.goto(path);
      await expect(page.getByText(title, { exact: true })).toBeVisible();
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    }
  });
});
