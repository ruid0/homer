import { describe, expect, it } from "vitest";
import { dateFields } from "./dateWords";
import { parseToolCall, toolDefinitions, toolNames } from "./tools";

describe("toolDefinitions", () => {
  it("lists the eleven MVP tools", () => {
    expect([...toolNames].sort()).toEqual(
      [
        "add_event",
        "add_item",
        "add_task",
        "add_to_groceries",
        "complete_task",
        "list_groceries",
        "list_items",
        "list_tasks",
        "mark_bought",
        "mark_out",
        "restock_item",
      ].sort(),
    );
    expect(toolDefinitions.map((tool) => tool.name)).toEqual([...toolNames]);
  });

  it("marks only the list tools as read-only", () => {
    const readOnly = toolDefinitions.filter((tool) => !tool.writes).map((tool) => tool.name);
    expect(readOnly.sort()).toEqual(["list_groceries", "list_items", "list_tasks"]);
  });

  it("gives every tool a description and an object schema without a $schema key", () => {
    for (const tool of toolDefinitions) {
      expect(tool.description.length).toBeGreaterThan(10);
      expect(tool.parameters).toMatchObject({ type: "object" });
      expect(tool.parameters).not.toHaveProperty("$schema");
    }
  });
});

describe("parseToolCall", () => {
  it("accepts a valid call and trims names", () => {
    expect(parseToolCall("mark_out", { name: " salt " })).toEqual({
      ok: true,
      call: { name: "mark_out", args: { name: "salt" } },
    });
  });

  it("accepts null for optional fields, as models often send them", () => {
    const result = parseToolCall("add_task", { title: "Call plumber", dueDate: "2026-11-06", dueTime: null, repeat: null, person: null });
    expect(result.ok).toBe(true);
  });

  it("reads arguments sent as a JSON string", () => {
    expect(parseToolCall("restock_item", '{"name":"milk","quantity":4}')).toEqual({
      ok: true,
      call: { name: "restock_item", args: { name: "milk", quantity: 4 } },
    });
  });

  it("rejects an unknown tool and names it", () => {
    const result = parseToolCall("delete_everything", {});
    expect(result.ok).toBe(false);
    expect(!result.ok && result.error).toContain("delete_everything");
  });

  it("rejects a missing field and names the field", () => {
    const result = parseToolCall("mark_out", {});
    expect(result.ok).toBe(false);
    expect(!result.ok && result.error).toContain("name");
  });

  it.each([
    ["restock_item", { name: "milk", quantity: 0 }],
    ["restock_item", { name: "milk", quantity: -2 }],
    ["add_item", { name: "salt", unit: "bag", quantity: -1 }],
    ["add_event", { title: "Dentist", date: "friday" }],
    ["add_task", { title: "Call", dueDate: "2026-02-30" }],
    ["add_task", { title: "Call", dueTime: "09:00" }],
    ["add_task", { title: "Call", repeat: "weekly" }],
    ["add_task", { title: "   " }],
    ["list_tasks", { from: "tomorrow" }],
  ])("rejects bad arguments for %s: %j", (name, args) => {
    expect(parseToolCall(name, args).ok).toBe(false);
  });

  it("says what is wrong in plain words, for the model to fix", () => {
    const result = parseToolCall("add_event", { title: "Dentist", date: "friday" });
    expect(!result.ok && result.error).toMatch(/date/);
    expect(!result.ok && result.error).toContain("2026-11-03");
  });

  it("accepts every read tool with no arguments", () => {
    for (const name of ["list_items", "list_groceries", "list_tasks"]) {
      expect(parseToolCall(name, {}).ok).toBe(true);
    }
  });

  it.each(["constructor", "toString", "__proto__"])("rejects %s as a tool name", (name) => {
    expect(parseToolCall(name, {}).ok).toBe(false);
  });

  it("rejects arguments that are not JSON", () => {
    expect(parseToolCall("mark_out", "{not json").ok).toBe(false);
  });

  it("rejects a daysPerUnit beyond the item limit", () => {
    expect(parseToolCall("add_item", { name: "Salt", unit: "bag", quantity: 1, daysPerUnit: 99999 }).ok).toBe(false);
  });

  it.each([
    ["mark_bought", { name: "Milk", quantity: 2 }],
    ["add_to_groceries", { name: "Milk" }],
    ["complete_task", { title: "Call plumber" }],
    ["add_event", { title: "Dentist", date: "2026-11-06", person: "Anna" }],
  ])("accepts valid %s arguments", (name, args) => {
    expect(parseToolCall(name, args).ok).toBe(true);
  });
});

describe("date fields in the tool schema", () => {
  const propertiesOf = (name: string) => (toolDefinitions.find((tool) => tool.name === name)!.parameters.properties ?? {}) as Record<string, unknown>;

  it("do not demand the strict date pattern, because a day can be said in words", () => {
    for (const tool of toolDefinitions) {
      for (const [field, spec] of Object.entries(propertiesOf(tool.name))) {
        if (dateFields.includes(field)) expect(JSON.stringify(spec)).not.toContain("pattern");
      }
    }
  });

  it("keep the pattern on a time", () => {
    expect(JSON.stringify(propertiesOf("add_task").dueTime)).toContain("pattern");
  });

  it("are only used by the tools that mean a day by them", () => {
    const using = toolDefinitions.filter((tool) => Object.keys(propertiesOf(tool.name)).some((field) => dateFields.includes(field)));
    expect(using.map((tool) => tool.name).sort()).toEqual(["add_event", "add_task", "list_tasks"]);
  });

  it("tell the model what a date can be when one is rejected", () => {
    const result = parseToolCall("add_task", { title: "x", dueDate: "friday 2026-11-06" });
    expect(!result.ok && result.error).toContain("weekday name");
  });
});
