import { expect, test } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { daysAgo, seedEvent, seedTask, todayUtc } from "./scratch";

const unique = (label: string) => `${label} ${randomUUID().slice(0, 8)}`;

test.use({ viewport: { width: 360, height: 800 } });

test.describe("rows on Home and Schedule", () => {
  test("Done sits on the title's line, in one right-hand column, and a row is short", async ({ page, request }) => {
    const names = [unique("Row A"), unique("Row B"), unique("Row C")];
    await seedTask(request, { title: names[0] ?? "", dueDate: daysAgo(1) });
    await seedTask(request, { title: names[1] ?? "", dueDate: todayUtc(), dueTime: "23:50" });
    await seedTask(request, { title: names[2] ?? "", dueDate: todayUtc() });
    await page.goto("/");
    const boxes = [];
    for (const name of names) {
      const row = page.getByRole("listitem").filter({ hasText: name });
      await expect(row).toBeVisible();
      const done = (await row.getByRole("button", { name: `Mark ${name} done` }).boundingBox())!;
      const title = (await row.getByText(name, { exact: true }).boundingBox())!;
      const whole = (await row.boundingBox())!;
      // The button is level with the body, not below it.
      expect(done.y).toBeLessThan(title.y + title.height);
      expect(whole.height).toBeLessThanOrEqual(96);
      boxes.push(done);
    }
    expect(new Set(boxes.map((box) => Math.round(box.x + box.width))).size).toBe(1);
  });

  test("a task with no time shows no 'Any time' label", async ({ page, request }) => {
    const name = unique("No time");
    await seedTask(request, { title: name, dueDate: todayUtc() });
    await page.goto("/");
    await expect(page.getByRole("listitem").filter({ hasText: name }).getByText("Any time")).toHaveCount(0);
  });

  test("an overdue row says so on one muted line with the person", async ({ page, request }) => {
    const name = unique("Late");
    await seedTask(request, { title: name, dueDate: daysAgo(2) });
    await page.goto("/");
    await expect(page.getByRole("listitem").filter({ hasText: name })).toContainText("2 days overdue");
  });

  test("Schedule: tapping the row opens Edit, Done is on the line, an event has no button", async ({
    page,
    request,
  }) => {
    const task = unique("Sched task");
    const event = unique("Sched event");
    await seedTask(request, { title: task, dueDate: todayUtc(), dueTime: "23:40" });
    await seedEvent(request, { title: event, date: todayUtc(), time: "23:45" });
    await page.goto("/schedule");
    const taskRow = page.getByRole("listitem").filter({ hasText: task });
    const done = (await taskRow.getByRole("button", { name: `Mark ${task} done` }).boundingBox())!;
    const title = (await taskRow.getByText(task, { exact: true }).boundingBox())!;
    expect(done.y).toBeLessThan(title.y + title.height);
    await expect(
      page.getByRole("listitem").filter({ hasText: event }).getByRole("button", { name: /done/i }),
    ).toHaveCount(0);
    await page.getByRole("button", { name: `Edit ${event}` }).click();
    await expect(page.getByRole("dialog")).toBeVisible();
  });

  test("Done on a row still marks it done", async ({ page, request }) => {
    const name = unique("Finish me");
    await seedTask(request, { title: name, dueDate: todayUtc() });
    await page.goto("/");
    await page.getByRole("button", { name: `Mark ${name} done` }).click();
    await expect(page.getByRole("listitem").filter({ hasText: name })).toHaveCount(0);
  });

  test("tapping a task row opens that task's editor, and its overdue line carries the person", async ({
    page,
    request,
  }) => {
    const name = unique("Open me");
    await seedTask(request, { title: name, dueDate: daysAgo(2) });
    await page.goto("/schedule");
    const row = page.getByRole("listitem").filter({ hasText: name });
    await expect(row).toContainText("2 days overdue");
    await row.getByRole("button", { name: `Edit ${name}` }).click();
    await expect(page.getByRole("dialog").getByLabel("What needs doing")).toHaveValue(name);
  });

  test("at tablet width Done is still level with the title at the right edge", async ({ page, request }) => {
    const name = unique("Wide");
    await seedTask(request, { title: name, dueDate: todayUtc(), dueTime: "23:30" });
    await page.setViewportSize({ width: 820, height: 900 });
    await page.goto("/");
    const row = page.getByRole("listitem").filter({ hasText: name });
    const done = (await row.getByRole("button", { name: `Mark ${name} done` }).boundingBox())!;
    const title = (await row.getByText(name, { exact: true }).boundingBox())!;
    const whole = (await row.boundingBox())!;
    expect(done.y).toBeLessThan(title.y + title.height);
    expect(whole.x + whole.width - (done.x + done.width)).toBeLessThanOrEqual(8);
  });

  test("in dark mode an overdue row keeps its words and weight", async ({ page, request }) => {
    const name = unique("Dark late");
    await seedTask(request, { title: name, dueDate: daysAgo(1) });
    await page.emulateMedia({ colorScheme: "dark" });
    await page.goto("/");
    const late = page.getByRole("listitem").filter({ hasText: name }).getByText("1 day overdue");
    await expect(late).toBeVisible();
    expect(await late.evaluate((element) => Number(getComputedStyle(element).fontWeight))).toBeGreaterThanOrEqual(600);
  });
});
