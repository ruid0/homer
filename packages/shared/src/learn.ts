import { MAX_DAYS_PER_UNIT } from "./schemas";

export const LEARN_MIN_RESTOCKS = 3;
export const LEARN_MIN_SPAN_DAYS = 14;
export const LEARN_WINDOW = 6;
const DAY_MS = 86_400_000;

export type RestockRow = { quantity: number; restockedAt: string };

export type Learned = { daysPerUnit: number; restocks: number };

type Trip = { at: number; quantity: number };

// A trip is every restock within a day of its first one, however many times "Bought it" was tapped. A chain of taps a little
// under a day apart does not stretch one trip forever: once a restock is a day past the trip's start, it is a new trip.
const trips = (rows: readonly RestockRow[]): Trip[] =>
  rows
    .map(({ quantity, restockedAt }) => ({ at: Date.parse(restockedAt), quantity }))
    .filter(({ at, quantity }) => Number.isFinite(at) && quantity > 0)
    .sort((first, second) => first.at - second.at)
    .reduce<Trip[]>((merged, row) => {
      const last = merged.at(-1);
      return last !== undefined && row.at - last.at < DAY_MS
        ? [...merged.slice(0, -1), { at: last.at, quantity: last.quantity + row.quantity }]
        : [...merged, row];
    }, []);

// How long a unit lasts, from the shop trips: the days between the first and last trip, over what was bought before the last one
// (the last trip's stock has not been used up yet). Null until there is enough history to trust.
export const learnDaysPerUnit = (rows: readonly RestockRow[]): Learned | null => {
  const recent = trips(rows).slice(-LEARN_WINDOW);
  if (recent.length < LEARN_MIN_RESTOCKS) return null;
  const days = (recent[recent.length - 1]!.at - recent[0]!.at) / DAY_MS;
  const used = recent.slice(0, -1).reduce((total, { quantity }) => total + quantity, 0);
  if (days < LEARN_MIN_SPAN_DAYS || used <= 0) return null;
  const daysPerUnit = Math.round((days / used) * 100) / 100;
  return daysPerUnit > 0 && daysPerUnit <= MAX_DAYS_PER_UNIT ? { daysPerUnit, restocks: recent.length } : null;
};
