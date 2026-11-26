import { z } from "zod";
import {
  MAX_DAYS_PER_UNIT,
  MAX_QUANTITY,
  MAX_SCHEDULE_DAYS,
  dateSchema,
  maintenanceItemInputSchema,
  repeatSchema,
  timeSchema,
} from "./schemas";
import type { MaintenanceStatus } from "./maintenance";

// Tools only the MCP listener offers. The in-app assistant keeps its own eleven.
const text = z.string().trim().min(1);

export const mcpToolSchemas = {
  list_due: z.object({ days: z.number().int().min(1).max(MAX_SCHEDULE_DAYS).nullish() }),
  complete_maintenance: z.object({ name: text, doneOn: dateSchema.nullish() }),
  snooze_maintenance: z.object({ name: text }),
  add_maintenance: z.object({
    name: maintenanceItemInputSchema.shape.name,
    every: maintenanceItemInputSchema.shape.every,
    unit: maintenanceItemInputSchema.shape.unit,
    lastDoneOn: dateSchema.nullish(),
  }),
  // The item or entry is found by its name. Whatever is left out stays as it is.
  update_item: z.object({
    name: text,
    newName: text.nullish(),
    unit: text.nullish(),
    quantity: z.number().min(0).max(MAX_QUANTITY).nullish(),
    daysPerUnit: z.number().positive().max(MAX_DAYS_PER_UNIT).nullish(),
    // Not the item schema's field: that one has a default, which would fill in a number when none was given.
    lowThresholdDays: z.number().int().min(0).nullish(),
  }),
  remove_item: z.object({ name: text }),
  remove_from_groceries: z.object({ name: text }),
  // A task or event is found by its title. `onDate` tells apart two that share one. Whatever is left out stays as it is;
  // `clear` takes a field off.
  update_task: z.object({
    title: text,
    onDate: dateSchema.nullish(),
    newTitle: text.nullish(),
    dueDate: dateSchema.nullish(),
    dueTime: timeSchema.nullish(),
    repeat: repeatSchema.nullish(),
    person: text.nullish(),
    clear: z.array(z.enum(["dueDate", "dueTime", "repeat", "person"])).nullish(),
  }),
  remove_task: z.object({ title: text, onDate: dateSchema.nullish() }),
  update_event: z.object({
    title: text,
    onDate: dateSchema.nullish(),
    newTitle: text.nullish(),
    date: dateSchema.nullish(),
    time: timeSchema.nullish(),
    person: text.nullish(),
    clear: z.array(z.enum(["time", "person"])).nullish(),
  }),
  remove_event: z.object({ title: text, onDate: dateSchema.nullish() }),
};

export type McpToolName = keyof typeof mcpToolSchemas;

export type DueMaintenance = { name: string; dueOn: string; daysUntil: number; status: MaintenanceStatus };

// Overdue and due jobs always show. Later days show only inside the window, which counts today as day one, as the task list does. A snoozed job reads as "later" with a
// due date in the past or today, so it stays hidden until its snooze day.
export const maintenanceInWindow = <T extends DueMaintenance>(rows: readonly T[], days: number): T[] =>
  rows.filter(
    ({ status, daysUntil }) => status === "overdue" || status === "due" || (daysUntil > 0 && daysUntil < days),
  );

export type RoutineRow = { name: string; targetPerDay: number; doneToday: number };
export type PersonRoutine = { person: string; rows: readonly RoutineRow[] };

// Only rows still short of today's target, and only people who have any.
export const routinesOpen = (people: readonly PersonRoutine[]) =>
  people
    .map(({ person, rows }) => ({
      person,
      open: rows
        .filter((row) => row.doneToday < row.targetPerDay)
        .map((row) => ({ name: row.name, left: row.targetPerDay - row.doneToday })),
    }))
    .filter(({ open }) => open.length > 0);
