import { describe, expect, it } from "vitest";
import { claimsChange, composeReply, reportLine, skippedLine, withChanges } from "./report";

describe("reportLine", () => {
  it.each([
    ["mark_out", { status: "done", item: "Salt" }, "Marked Salt as out and added it to groceries."],
    ["restock_item", { status: "done", item: "Milk", added: 4, quantity: 5, unit: "litre" }, "Restocked Milk: added 4 litre, now 5."],
    ["add_item", { status: "done", item: "Olive oil", quantity: 2, unit: "bottle" }, "Now tracking Olive oil: 2 bottle."],
    ["add_to_groceries", { status: "done", name: "Candles", quantity: null }, "Added Candles to the grocery list."],
    ["add_to_groceries", { status: "done", name: "Milk", quantity: 2 }, "Added 2 of Milk to the grocery list."],
    ["mark_bought", { status: "done", name: "Bread", restocked: null }, "Marked Bread as bought."],
    ["mark_bought", { status: "done", name: "Milk", restocked: 3 }, "Marked Milk as bought and restocked 3."],
    ["add_task", { status: "done", title: "Call the plumber", dueDate: "2026-11-06", dueTime: null, repeat: null, person: null }, 'Added the task "Call the plumber" for Friday 2026-11-06.'],
    ["add_task", { status: "done", title: "Gift", dueDate: null, dueTime: null, repeat: null, person: null }, 'Added the task "Gift" with no date.'],
    ["add_task", { status: "done", title: "Water plants", dueDate: "2026-11-08", dueTime: "18:00", repeat: "weekly", person: "Ben" }, 'Added the task "Water plants" for Sunday 2026-11-08 at 18:00, weekly, for Ben.'],
    ["add_event", { status: "done", title: "Dentist", date: "2026-11-05", time: "09:30", person: "Anna" }, 'Added the event "Dentist" on Thursday 2026-11-05 at 09:30 for Anna.'],
    ["add_event", { status: "done", title: "Parents' evening", date: "2026-11-10", time: null, person: null }, "Added the event \"Parents' evening\" on Tuesday 2026-11-10."],
    ["complete_task", { status: "done", title: "Call the plumber", nextDueDate: null }, 'Marked "Call the plumber" as done.'],
    ["complete_task", { status: "done", title: "Water plants", nextDueDate: "2026-11-11" }, 'Marked "Water plants" as done. The next one is due Wednesday 2026-11-11.'],
  ])("%s", (name, result, line) => {
    expect(reportLine(name, result)).toBe(line);
  });
});

describe("claimsChange", () => {
  it.each([
    "I've added the dentist appointment for Anna.",
    "I have marked milk as bought.",
    "Done! I added it to the list.",
    "I started tracking coffee.",
    "Added the dentist appointment.",
    "Got it, marked milk as bought.",
    "Okay, added it to the list.",
    "Sure, I've gone ahead and scheduled it.",
  ])("sees a claim in %j", (reply) => {
    expect(claimsChange(reply)).toBe(true);
  });

  it.each([
    "Which one do you mean, oat milk or soy milk?",
    "Flour isn't tracked yet. Do you want me to start tracking it?",
    "I haven't added anything. When should I remind you?",
    "You have 2 bags of salt.",
    "I can't delete items. You can remove it from the Items page.",
    "Hi! What can I help with?",
    "You need bread and 12 eggs.",
    "Your dentist appointment is scheduled for Thursday at 9:30.",
    "Salt has already been added to the list.",
    "Done with which task?",
    "The milk was added to the list yesterday.",
    "Milk is marked as out.",
  ])("sees no claim in %j", (reply) => {
    expect(claimsChange(reply)).toBe(false);
  });
});

describe("composeReply", () => {
  const done = [{ name: "mark_out", result: { status: "done", item: "Salt" } }];

  it("uses the code's line when something changed, not the model's words", () => {
    expect(composeReply({ done }, "Sure thing! I have gone ahead and marked salt.")).toBe("Marked Salt as out and added it to groceries.");
  });

  it("lists one line per change", () => {
    const two = [...done, { name: "add_to_groceries", result: { status: "done", name: "Bread", quantity: null } }];
    expect(composeReply({ done: two }, "ok")).toBe("Marked Salt as out and added it to groceries.\nAdded Bread to the grocery list.");
  });

  it("keeps a closing question from the model", () => {
    expect(composeReply({ done }, "I've marked it. Do you want me to add rice too?")).toBe(
      "Marked Salt as out and added it to groceries.\nDo you want me to add rice too?",
    );
  });

  it("passes the model's words through when nothing changed", () => {
    expect(composeReply({ done: [] }, "Which milk do you mean?")).toBe("Which milk do you mean?");
  });

  it("does not let a claim of change through when nothing changed", () => {
    expect(composeReply({ done: [] }, "I've added the dentist appointment for Anna.")).toBe("I didn't change anything. Try saying it again.");
  });

  it("falls back to a line when the model said nothing", () => {
    expect(composeReply({ done: [] }, "")).toBe("I couldn't work that out. Try saying it a different way.");
  });

  it("reports a failed call next to a successful one, so neither is lost", () => {
    const skipped = [{ status: "not_tracked", name: "flour" }];
    expect(composeReply({ done, skipped }, "Marked salt. I couldn't find flour.")).toBe(
      "Marked Salt as out and added it to groceries.\nflour isn't tracked, so nothing changed for it.",
    );
  });

  it("keeps the question when a claim of change is replaced", () => {
    expect(composeReply({ done: [] }, "I've added it. Which Anna do you mean?")).toBe(
      "I didn't change anything. Try saying it again.\nWhich Anna do you mean?",
    );
  });

  it("does not replace an honest read that sounds like a change", () => {
    expect(composeReply({ done: [] }, "Your dentist appointment is scheduled for Thursday at 9:30.")).toBe(
      "Your dentist appointment is scheduled for Thursday at 9:30.",
    );
  });
});

describe("skippedLine", () => {
  it.each([
    [{ status: "ambiguous", matches: ["Oat milk", "Soy milk"] }, "More than one matches: Oat milk, Soy milk. Which one?"],
    [{ status: "needs_quantity", name: "Milk" }, "How much Milk did you buy?"],
    [{ status: "person_not_found", name: "Zoe" }, "I don't know Zoe."],
    [{ status: "not_on_list", name: "Bread" }, "Bread isn't on the list."],
    [{ status: "not_found", title: "bins" }, 'No open task matches "bins".'],
    [{ status: "error", message: "Salt is already tracked." }, "Salt is already tracked."],
  ])("%j", (result, line) => {
    expect(skippedLine(result)).toBe(line);
  });
});

describe("withChanges", () => {
  it("puts the changes already made before a line about stopping early", () => {
    expect(withChanges({ done: [{ name: "mark_out", result: { status: "done", item: "Salt" } }] }, "That took too many steps.")).toBe(
      "Marked Salt as out and added it to groceries.\nThat took too many steps.",
    );
  });

  it("is only the line when nothing changed", () => {
    expect(withChanges({ done: [] }, "That took too many steps.")).toBe("That took too many steps.");
  });
});
