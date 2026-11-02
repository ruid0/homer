import { z } from "zod";

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
