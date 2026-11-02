import { z } from "zod";

export const DEFAULT_LOW_THRESHOLD_DAYS = 7;

const text = z.string().trim().min(1);

export const itemInputSchema = z.object({
  name: text,
  unit: text,
  quantity: z.number().min(0),
  daysPerUnit: z.number().positive().nullable(),
  lowThresholdDays: z.number().int().min(0).default(DEFAULT_LOW_THRESHOLD_DAYS),
});

export const itemSchema = z.object({
  id: z.number().int(),
  name: text,
  unit: text,
  quantity: z.number().min(0),
  daysPerUnitEntered: z.number().positive().nullable(),
  daysPerUnitLearned: z.number().positive().nullable(),
  lowThresholdDays: z.number().int().min(0),
  createdAt: z.string(),
  archivedAt: z.string().nullable(),
});

export const restockInputSchema = z.object({
  itemId: z.number().int(),
  quantity: z.number().positive(),
});

export type ItemInput = z.infer<typeof itemInputSchema>;
export type Item = z.infer<typeof itemSchema>;
export type RestockInput = z.infer<typeof restockInputSchema>;
