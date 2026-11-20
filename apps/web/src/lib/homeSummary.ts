import { copy } from "../copy";

export type DayCounts = { tasks: number; events: number; jobs: number; low: number };

// One line under the date: what is left, in the order a day goes. Zeros are left out.
export const homeSummary = ({ tasks, events, jobs, low }: DayCounts): string => {
  const parts = [
    tasks > 0 ? copy.home.summary.tasks(tasks) : null,
    events > 0 ? copy.home.summary.events(events) : null,
    jobs > 0 ? copy.home.summary.jobs(jobs) : null,
    low > 0 ? copy.home.summary.low(low) : null,
  ].filter((part) => part !== null);
  return parts.length === 0 ? copy.home.summary.nothing : parts.join(copy.common.separator);
};
