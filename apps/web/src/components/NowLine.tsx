import { copy } from "../copy";

// The time now as a rule across a day's list, so what is past sits above it and what is coming below.
export const NowLine = ({ time }: { time: string }) => (
  <li className="sticky bottom-0 top-0 z-10 flex items-center gap-3 bg-card py-2">
    <span className="text-answer font-bold tabular-nums">{copy.home.now(time)}</span>
    <span aria-hidden="true" className="h-0.5 flex-1 rounded bg-ink" />
  </li>
);
