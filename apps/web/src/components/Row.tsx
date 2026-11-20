import type { ReactNode } from "react";
import { copy } from "../copy";
import { cx, lateBar, rowStatus } from "./ui";

type Props = {
  when?: string | null;
  title: string;
  // The coloured answer ("2 days overdue") that opens the muted line under the title.
  status?: { text: string; level: "late" | "warn" };
  // The rest of that line, already joined.
  meta?: string;
  // Tapping the title and its details opens the editor. Without it the body is plain text.
  onOpen?: () => void;
  openLabel?: string;
  action?: ReactNode;
  overdue?: boolean;
  flash?: boolean;
  faded?: boolean;
};

// The compact row (Home, Schedule, Stock, Upkeep, People): an optional time, the body, and one action in a column on the right, all on one line.
export const Row = ({ when, title, status, meta, onOpen, openLabel, action, overdue, flash, faded }: Props) => {
  const body = (
    <>
      <span className="block text-title font-semibold">{title}</span>
      {(status || meta) && (
        <span className="block text-meta text-muted">
          {status && <span className={rowStatus(status.level)}>{status.text}</span>}
          {status && meta && copy.common.separator}
          {meta}
        </span>
      )}
    </>
  );
  return (
    <li
      className={cx(
        "grid min-h-16 items-center gap-x-3 border-t border-line py-2",
        when ? "grid-cols-[4rem_minmax(0,1fr)_auto]" : "grid-cols-[minmax(0,1fr)_auto]",
        overdue && lateBar,
        flash && "animate-row-flash",
        faded && "text-muted",
      )}
    >
      {when && <span className="whitespace-nowrap text-answer font-semibold tabular-nums">{when}</span>}
      {onOpen ? (
        <button
          type="button"
          className={cx(
            "min-h-11 min-w-0 rounded-lg py-1 text-left hover:bg-hover",
            "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink",
          )}
          onClick={onOpen}
          aria-label={[openLabel, status?.text, meta].filter(Boolean).join(copy.common.separator)}
        >
          {body}
        </button>
      ) : (
        <div className="min-w-0 py-1">{body}</div>
      )}
      {action}
    </li>
  );
};
