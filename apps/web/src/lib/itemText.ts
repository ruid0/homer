import { copy } from "../copy";

// Stock counts down in fractions of a unit, so it is shown to two decimals.
export const quantityText = (quantity: number): string => String(Math.round(quantity * 100) / 100);

type Stock = { quantity: number; daysRemaining: number | null };

export const describeRunsOut = ({ quantity, daysRemaining }: Stock): string => {
  if (quantity === 0) return copy.stock.outOfIt;
  if (daysRemaining === null) return copy.stock.noEstimate;
  if (daysRemaining === 0) return copy.stock.runsOutToday;
  return copy.stock.runsOutIn(daysRemaining);
};

const urgency = ({ quantity, daysRemaining }: Stock): number => {
  if (quantity === 0) return -1;
  return daysRemaining ?? Number.POSITIVE_INFINITY;
};

export const sortByUrgency = <T extends Stock & { name: string }>(items: readonly T[]): T[] =>
  [...items].sort((a, b) => {
    const [ua, ub] = [urgency(a), urgency(b)];
    return ua === ub ? a.name.localeCompare(b.name) : ua < ub ? -1 : 1;
  });
