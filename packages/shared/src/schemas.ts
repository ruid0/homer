import { z } from "zod";
import { schemaMessages } from "./copy";

export const DEFAULT_LOW_THRESHOLD_DAYS = 7;

// Bounds keep daysRemaining finite, since JSON turns Infinity into null.
export const MAX_QUANTITY = 100_000;
export const MAX_DAYS_PER_UNIT = 3_650;

const text = z.string().trim().min(1);
const quantity = z.number().min(0).max(MAX_QUANTITY);
const daysPerUnit = z.number().positive().max(MAX_DAYS_PER_UNIT);

export const itemInputSchema = z.object({
  name: text,
  unit: text,
  quantity,
  daysPerUnit: daysPerUnit.nullable(),
  lowThresholdDays: z.number().int().min(0).default(DEFAULT_LOW_THRESHOLD_DAYS),
});

export const idInputSchema = z.object({ id: z.number().int() });

export const nameInputSchema = z.object({ name: text });

export const updateItemInputSchema = itemInputSchema.extend(idInputSchema.shape);

export const itemSchema = z.object({
  id: z.number().int(),
  name: text,
  unit: text,
  quantity,
  daysPerUnitEntered: daysPerUnit.nullable(),
  daysPerUnitLearned: daysPerUnit.nullable(),
  lowThresholdDays: z.number().int().min(0),
  createdAt: z.string(),
  archivedAt: z.string().nullable(),
});

export const restockInputSchema = z.object({
  itemId: z.number().int(),
  quantity: z.number().positive().max(MAX_QUANTITY),
});

export type ItemInput = z.infer<typeof itemInputSchema>;
export type Item = z.infer<typeof itemSchema>;
export type RestockInput = z.infer<typeof restockInputSchema>;

const groceryQuantity = z.number().positive().max(MAX_QUANTITY);

export const grocerySourceSchema = z.enum(["auto", "manual"]);

export const groceryAddInputSchema = z.union([
  z.object({ itemId: z.number().int(), quantity: groceryQuantity.optional() }),
  z.object({ text, quantity: groceryQuantity.optional() }),
]);

export const groceryBoughtInputSchema = z.object({
  id: z.number().int(),
  quantity: groceryQuantity.optional(),
});

export const groceryEntrySchema = z.object({
  id: z.number().int(),
  itemId: z.number().int().nullable(),
  text,
  quantity: groceryQuantity.nullable(),
  addedBy: grocerySourceSchema,
  createdAt: z.string(),
  boughtAt: z.string().nullable(),
  removedAt: z.string().nullable(),
});

export type GroceryAddInput = z.infer<typeof groceryAddInputSchema>;
export type GroceryEntry = z.infer<typeof groceryEntrySchema>;

const isRealDate = (value: string) => {
  const parsed = Date.parse(`${value}T00:00:00Z`);
  return !Number.isNaN(parsed) && new Date(parsed).toISOString().slice(0, 10) === value;
};

export const dateSchema = z
  .string()
  // Years 1000 to 2999 keep date arithmetic far from the limits of Date.
  .regex(/^[12]\d{3}-\d{2}-\d{2}$/, schemaMessages.invalidDate)
  .refine(isRealDate, schemaMessages.invalidDate);

export const timeSchema = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, schemaMessages.invalidTime);

export const repeatValues = ["daily", "weekly", "monthly"] as const;

export const repeatSchema = z.enum(repeatValues);

export const MAX_SCHEDULE_DAYS = 31;

const personIdSchema = z.number().int();

export const personInputSchema = nameInputSchema;

export const renamePersonInputSchema = nameInputSchema.extend(idInputSchema.shape);

export const personSchema = z.object({
  id: z.number().int(),
  name: text,
  createdAt: z.string(),
  archivedAt: z.string().nullable(),
});

const taskFields = z.object({
  title: text,
  dueDate: dateSchema.nullable().default(null),
  dueTime: timeSchema.nullable().default(null),
  repeat: repeatSchema.nullable().default(null),
  personId: personIdSchema.nullable().default(null),
});

type TaskDates = { dueDate: string | null; dueTime: string | null; repeat: string | null };

const hasDueDateWhenNeeded = ({ dueDate, dueTime, repeat }: TaskDates) =>
  dueDate !== null || (dueTime === null && repeat === null);

const dueDateRule = { error: schemaMessages.dueDateNeeded, path: ["dueDate"] };

export const taskInputSchema = taskFields.refine(hasDueDateWhenNeeded, dueDateRule);

export const updateTaskInputSchema = taskFields
  .extend(idInputSchema.shape)
  .refine(hasDueDateWhenNeeded, dueDateRule);

export const completeTaskInputSchema = z.object({ id: z.number().int(), today: dateSchema });

export const taskSchema = z.object({
  id: z.number().int(),
  title: text,
  dueDate: dateSchema.nullable(),
  dueTime: timeSchema.nullable(),
  repeat: repeatSchema.nullable(),
  personId: personIdSchema.nullable(),
  createdAt: z.string(),
  doneAt: z.string().nullable(),
  removedAt: z.string().nullable(),
});

export const eventInputSchema = z.object({
  title: text,
  date: dateSchema,
  time: timeSchema.nullable().default(null),
  personId: personIdSchema.nullable().default(null),
});

export const updateEventInputSchema = eventInputSchema.extend(idInputSchema.shape);

export const eventSchema = z.object({
  id: z.number().int(),
  title: text,
  date: dateSchema,
  time: timeSchema.nullable(),
  personId: personIdSchema.nullable(),
  createdAt: z.string(),
  removedAt: z.string().nullable(),
});

export const scheduleViewInputSchema = z.object({
  today: dateSchema,
  days: z.number().int().min(1).max(MAX_SCHEDULE_DAYS),
  personId: personIdSchema.optional(),
});

export const MAX_ROUTINE_TARGET = 20;
export const MAX_ROUTINE_COUNT = 99;
export const MAX_ROUTINE_WEEKS_BACK = 8;

const routineName = text.max(80);
const routineTarget = z.number().int().min(1).max(MAX_ROUTINE_TARGET);

export const routineItemInputSchema = z.object({
  personId: personIdSchema,
  name: routineName,
  targetPerDay: routineTarget.default(1),
});

// The target is required here, so a rename that leaves it out cannot silently reset it to 1.
export const updateRoutineItemInputSchema = z.object({ name: routineName, targetPerDay: routineTarget }).extend(idInputSchema.shape);

export const moveRoutineItemInputSchema = idInputSchema.extend({ direction: z.enum(["up", "down"]) });

export const routineWeekInputSchema = z.object({ personId: personIdSchema, today: dateSchema, weekOf: dateSchema.optional() });

export const setRoutineCountInputSchema = z.object({
  itemId: z.number().int(),
  date: dateSchema,
  today: dateSchema,
  count: z.number().int().min(0).max(MAX_ROUTINE_COUNT),
});

export const routineItemSchema = z.object({
  id: z.number().int(),
  personId: personIdSchema,
  name: text,
  targetPerDay: z.number().int().min(1),
  position: z.number().int(),
  createdAt: z.string(),
  removedAt: z.string().nullable(),
});

export const routineTickSchema = z.object({
  id: z.number().int(),
  routineItemId: z.number().int(),
  date: dateSchema,
  count: z.number().int().min(0),
});

export type PersonInput = z.infer<typeof personInputSchema>;
export type Person = z.infer<typeof personSchema>;
export type TaskInput = z.infer<typeof taskInputSchema>;
export type UpdateTaskInput = z.infer<typeof updateTaskInputSchema>;
export type CompleteTaskInput = z.infer<typeof completeTaskInputSchema>;
export type Task = z.infer<typeof taskSchema>;
export type EventInput = z.infer<typeof eventInputSchema>;
export type UpdateEventInput = z.infer<typeof updateEventInputSchema>;
export type ScheduleEvent = z.infer<typeof eventSchema>;
export type ScheduleViewInput = z.infer<typeof scheduleViewInputSchema>;
export type RoutineItemInput = z.infer<typeof routineItemInputSchema>;
export type UpdateRoutineItemInput = z.infer<typeof updateRoutineItemInputSchema>;
export type RoutineWeekInput = z.infer<typeof routineWeekInputSchema>;
export type SetRoutineCountInput = z.infer<typeof setRoutineCountInputSchema>;
export type RoutineItem = z.infer<typeof routineItemSchema>;
export type RoutineTick = z.infer<typeof routineTickSchema>;
