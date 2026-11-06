import type { ReactNode } from "react";
import { copy } from "../copy";
import { lateBar } from "./ui";

type Props = { when?: ReactNode; title: string; status?: ReactNode; details: string[]; actions: ReactNode; overdue?: boolean };

// Wide: an optional time, the title and the buttons in one line. Narrow: the buttons drop to a second line.
export const ListRow = ({ when, title, status, details, actions, overdue = false }: Props) => (
  <li
    className={`grid min-h-20 items-center gap-x-4 gap-y-2 border-t border-line py-3 ${overdue ? `${lateBar} ` : ""}${
      when === undefined ? "grid-cols-1 sm:grid-cols-[1fr_auto]" : "grid-cols-[5.5rem_1fr] sm:grid-cols-[5.5rem_1fr_auto]"
    }`}
  >
    {when !== undefined && <div className="text-title font-semibold tabular-nums">{when}</div>}
    <div className="min-w-0">
      <p className="text-title font-semibold">{title}</p>
      {status && <p>{status}</p>}
      {details.length > 0 && <p className="text-meta text-muted">{details.join(copy.common.separator)}</p>}
    </div>
    <div className={`flex flex-wrap justify-end gap-2 ${when === undefined ? "" : "col-span-2 sm:col-span-1"}`}>{actions}</div>
  </li>
);
