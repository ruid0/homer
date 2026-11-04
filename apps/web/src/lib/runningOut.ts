import { sortByUrgency } from "./itemText";

type RunningOutItem = {
  id: number;
  name: string;
  quantity: number;
  daysRemaining: number | null;
  runningLow: boolean;
};

export type RunningOutRow<T> = { item: T; onList: boolean };

// An item at zero counts even without an estimate, because it is out whatever the estimate says.
export const runningOut = <T extends RunningOutItem>(
  items: readonly T[],
  listedIds: ReadonlySet<number>,
): RunningOutRow<T>[] =>
  sortByUrgency(items.filter((item) => item.runningLow || item.quantity === 0)).map((item) => ({
    item,
    onList: listedIds.has(item.id),
  }));
