import { cx } from "../ui";

type Props = {
  title: string;
  // The time column. Empty for something with no time, so the titles still line up.
  when?: string | null;
  status?: { text: string; level: "warn" | "late" };
  // Who it is for, after the title.
  person?: string | null;
  // The time column holds a day ("Sat 28"), which is wider than a time.
  wideWhen?: boolean;
  // A time after the title, for a row whose first column holds the day.
  after?: string | null;
};

// One line of a TV list, always one line: a long title is cut with an ellipsis, so the height of a list is known and
// nothing runs off the screen. Nothing here can be tapped.
export const TvRow = ({ title, when, status, person, wideWhen, after }: Props) => (
  <li className="flex items-baseline gap-[1.25rem] py-[0.375rem] text-answer">
    {when !== undefined && (
      <span className={cx("shrink-0 text-muted", wideWhen ? "w-[6rem]" : "w-[4.5rem]")}>{when}</span>
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
