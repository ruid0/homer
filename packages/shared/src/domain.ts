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
