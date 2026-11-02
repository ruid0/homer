export type EstimateSource = "entered" | "learned";

export type Estimate = { daysPerUnit: number; source: EstimateSource };

type EstimateFields = {
  daysPerUnitEntered: number | null;
  daysPerUnitLearned: number | null;
};

export const effectiveEstimate = ({
  daysPerUnitEntered,
  daysPerUnitLearned,
}: EstimateFields): Estimate | null => {
  if (daysPerUnitLearned !== null) return { daysPerUnit: daysPerUnitLearned, source: "learned" };
  if (daysPerUnitEntered !== null) return { daysPerUnit: daysPerUnitEntered, source: "entered" };
  return null;
};

export const daysRemaining = (quantity: number, daysPerUnit: number | null): number | null =>
  daysPerUnit === null ? null : Math.max(0, Math.floor(quantity * daysPerUnit));

export const isRunningLow = (days: number | null, thresholdDays: number): boolean =>
  days !== null && days <= thresholdDays;

type StockState = { quantity: number; daysRemaining: number | null; lowThresholdDays: number };

// Out always counts, so an item with no usage estimate still lands on the list when it runs out.
export const needsRestock = ({ quantity, daysRemaining, lowThresholdDays }: StockState): boolean =>
  quantity === 0 || isRunningLow(daysRemaining, lowThresholdDays);

export type GrocerySource = "auto" | "manual";

export type GroceryAction = "add" | "remove" | "keep";

export const groceryAction = (needed: boolean, openEntry: { addedBy: GrocerySource } | null): GroceryAction => {
  if (needed) return openEntry ? "keep" : "add";
  return openEntry?.addedBy === "auto" ? "remove" : "keep";
};
