type Stock = { quantity: number; daysRemaining: number | null };

export const describeRunsOut = ({ quantity, daysRemaining }: Stock): string => {
  if (quantity === 0) return "Out of it";
  if (daysRemaining === null) return "No estimate";
  if (daysRemaining === 0) return "Runs out today";
  return `Runs out in ${daysRemaining} ${daysRemaining === 1 ? "day" : "days"}`;
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
