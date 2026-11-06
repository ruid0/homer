import type { ReactNode } from "react";
import { lateBar, statusClass } from "./ui";

type Props = { title: string; status: string; level: "late" | "warn" | "plain"; note?: string | null; overdue?: boolean; action: ReactNode };

// One row of a Home card: the name, one line of status, and the one button. Running out and Upkeep share it, so they cannot drift.
export const HomeRow = ({ title, status, level, note, overdue = false, action }: Props) => (
  <li className={`flex min-h-20 items-center gap-4 border-t border-line py-3 ${overdue ? lateBar : ""}`}>
    <div className="min-w-0 flex-1">
      <p className="text-title font-semibold">{title}</p>
      <p className={statusClass(level)}>{status}</p>
      {note && <p className="text-meta text-muted">{note}</p>}
    </div>
    {action}
  </li>
);
