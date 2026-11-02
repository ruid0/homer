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
