import { z } from "zod";
import { MAX_DAYS_PER_UNIT, MAX_QUANTITY, dateSchema, repeatSchema, timeSchema } from "./schemas";
import { dateFields } from "./dateWords";
import { schemaMessages, toolDescriptions, toolErrors } from "./copy";

const text = z.string().trim().min(1);
const amount = z.number().positive().max(MAX_QUANTITY);

// Models often send null for an optional field, so every optional is nullish.
const taskArgs = z
  .object({
    title: text,
    dueDate: dateSchema.nullish(),
    dueTime: timeSchema.nullish(),
    repeat: repeatSchema.nullish(),
    person: text.nullish(),
  })
  .refine(({ dueDate, dueTime, repeat }) => dueDate != null || (dueTime == null && repeat == null), {
    error: schemaMessages.dueDateNeeded,
    path: ["dueDate"],
  });

export const toolSchemas = {
  list_items: z.object({}),
  mark_out: z.object({ name: text }),
  restock_item: z.object({ name: text, quantity: amount }),
  add_item: z.object({
    name: text,
    unit: text,
    quantity: z.number().min(0).max(MAX_QUANTITY),
    daysPerUnit: z.number().positive().max(MAX_DAYS_PER_UNIT).nullish(),
  }),
  list_groceries: z.object({}),
  add_to_groceries: z.object({ name: text, quantity: amount.nullish() }),
  mark_bought: z.object({ name: text, quantity: amount.nullish() }),
  list_tasks: z.object({ from: dateSchema.nullish(), to: dateSchema.nullish() }),
  add_task: taskArgs,
  add_event: z.object({ title: text, date: dateSchema, time: timeSchema.nullish(), person: text.nullish() }),
  complete_task: z.object({ title: text }),
};

export type ToolName = keyof typeof toolSchemas;

export type ToolCall = { [N in ToolName]: { name: N; args: z.infer<(typeof toolSchemas)[N]> } }[ToolName];

export type ToolDefinition = {
  name: ToolName;
  description: string;
  // Whether the tool changes anything. Only these are journalled, and so can be undone.
  writes: boolean;
  parameters: Record<string, unknown>;
};

const writes: Record<ToolName, boolean> = {
  list_items: false,
  mark_out: true,
  restock_item: true,
  add_item: true,
  list_groceries: false,
  add_to_groceries: true,
  mark_bought: true,
  list_tasks: false,
  add_task: true,
  add_event: true,
  complete_task: true,
};

export const toolNames = Object.keys(toolSchemas) as ToolName[];

// A date may be said in words (see dateWords.ts), so the date fields do not advertise the strict pattern.
const withoutPattern = (value: unknown): unknown => {
  if (Array.isArray(value)) return value.map(withoutPattern);
  if (value === null || typeof value !== "object") return value;
  return Object.fromEntries(Object.entries(value).filter(([key]) => key !== "pattern").map(([key, inner]) => [key, withoutPattern(inner)]));
};

const toParameters = (schema: z.ZodType): Record<string, unknown> => {
  const { $schema: _unused, properties, ...rest } = z.toJSONSchema(schema) as Record<string, unknown> & { properties?: Record<string, unknown> };
  if (!properties) return rest;
  const relaxed = Object.fromEntries(Object.entries(properties).map(([name, spec]) => [name, dateFields.includes(name) ? withoutPattern(spec) : spec]));
  return { ...rest, properties: relaxed };
};

export const toolDefinitions: ToolDefinition[] = toolNames.map((name) => ({
  name,
  writes: writes[name],
  description: toolDescriptions[name],
  parameters: toParameters(toolSchemas[name]),
}));

export type ParsedToolCall = { ok: true; call: ToolCall } | { ok: false; error: string };

const readArgs = (args: unknown): unknown => {
  if (typeof args !== "string") return args;
  try {
    return JSON.parse(args);
  } catch {
    return args;
  }
};

const isToolName = (name: string): name is ToolName => Object.hasOwn(toolSchemas, name);

// The error text goes back to the model, so it says which field is wrong and why.
export const parseToolCall = (name: string, args: unknown): ParsedToolCall => {
  if (!isToolName(name)) return { ok: false, error: toolErrors.unknownTool(name, toolNames) };
  const parsed = toolSchemas[name].safeParse(readArgs(args) ?? {});
  if (parsed.success) return { ok: true, call: { name, args: parsed.data } as ToolCall };
  const problems = parsed.error.issues.map((issue) => toolErrors.problem(issue.path.join("."), issue.message === schemaMessages.invalidDate ? toolErrors.dateHint : issue.message));
  return { ok: false, error: toolErrors.invalidArguments(name, problems) };
};
