import { describe, expect, it, vi } from "vitest";
import { householdNotifications } from "./household";
import type { Notification } from "./ntfy";

describe("householdNotifications", () => {
  it("is off, with one log line, when no topic is set", () => {
    const log = vi.fn();
    expect(householdNotifications({}, log)).toBeNull();
    expect(log).toHaveBeenCalledTimes(1);
  });

  it("sends the list note to the household topic with counts only", async () => {
    const sent: Notification[] = [];
    const notifier = async (note: Notification) => (sent.push(note), true);
    householdNotifications({ NTFY_HOUSEHOLD_TOPIC: "topic-a" }, vi.fn(), notifier)?.announceListed(2);
    await vi.waitFor(() => expect(sent).toHaveLength(1));
    expect(sent[0]).toMatchObject({ topic: "topic-a", message: "2 items added to the grocery list.", path: "/groceries" });
  });

  it("logs the count, never the topic, when the send fails", async () => {
    const log = vi.fn();
    householdNotifications({ NTFY_HOUSEHOLD_TOPIC: "topic-a" }, log, async () => false)?.announceListed(1);
    await vi.waitFor(() => expect(log).toHaveBeenCalled());
    expect(JSON.stringify(log.mock.calls)).not.toContain("topic-a");
  });

  it("warns when a token would go over plain http", () => {
    const log = vi.fn();
    const settings = { NTFY_HOUSEHOLD_TOPIC: "t", NTFY_SERVER: "http://ntfy.example", NTFY_TOKEN: "x" };
    householdNotifications(settings, log, async () => true);
    expect(log).toHaveBeenCalledTimes(1);
  });
});
