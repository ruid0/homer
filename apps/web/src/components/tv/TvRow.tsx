import { cx } from "../ui";

// What stands in the first column: a time, a day, or a state in words (colour backs it up, never replaces it).
export type Lead = { text: string; level?: "late" | "day" };

type Props = {
  title: string;
  // The first column, the same width on every row of a list so the titles line up. Left out for a list with none.
  lead?: Lead;
  status?: { text: string; level: "warn" | "late" };
  // Who it is for, after the title.
  person?: string | null;
  // A time or an amount after the title.
  after?: string | null;
};

const leadStyle = { late: "font-semibold text-late", day: "font-semibold" };

// One line of a TV list, always one line: a long title is cut with an ellipsis, so the height of a list is known and
// nothing runs off the screen. Nothing here can be tapped.
export const TvRow = ({ title, lead, status, person, after }: Props) => (
  <li className="flex items-baseline gap-[1.25rem] py-[0.375rem] text-answer">
    {lead && (
      <span className={cx("w-[9.5rem] shrink-0", lead.level ? leadStyle[lead.level] : "text-muted")}>{lead.text}</span>
    )}
    <span className="min-w-0 flex-1 truncate font-semibold">{title}</span>
    {after && <span className="shrink-0 text-muted tabular-nums">{after}</span>}
    {person && <span className="shrink-0 text-muted">{person}</span>}
    {status && (
      <span className={cx("shrink-0 font-semibold", status.level === "late" ? "text-late" : "text-warn")}>
        {status.text}
      </span>
    )}
  </li>
);
