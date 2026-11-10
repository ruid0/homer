import { useRef, type MouseEvent } from "react";
import { copy } from "../copy";
import { dueWords, needsDoing, rowChips } from "../lib/maintenanceText";
import type { MaintenanceItem } from "../trpc";
import { UpkeepChips } from "./UpkeepChips";
import { doneSize, lateBar, quietButton, secondaryButton, statusClass } from "./ui";

type Props = { item: MaintenanceItem; busy: boolean; justDone?: boolean; onDone: () => void; onEdit: () => void };

// Phone: the name and Done share a line, then the status, then the chips with Edit at the end.
// Wide: the three text lines on the left, Edit and Done together on the right.
// Edit comes before Done in the markup, so Tab follows the wide layout left to right.
export const MaintenanceRow = ({ item, busy, justDone = false, onDone, onEdit }: Props) => {
  const late = item.status === "overdue" || item.status === "due";
  const level = late ? "late" : item.status === "soon" ? "warn" : "plain";
  // Later rows are not asked for yet, so their Done is quiet; Due now rows keep the outlined one.
  const doneStyle = needsDoing(item.status) ? secondaryButton : quietButton;

  const editButton = useRef<HTMLButtonElement>(null);

  // The row opens the editor; its own buttons keep their own job, and selecting text on the row (to copy it) is not a tap.
  // Focus goes to Edit first, so closing the dialog returns focus to this row and not to the top of the page.
  const openFromRow = (event: MouseEvent<HTMLLIElement>) => {
    if ((event.target as HTMLElement).closest("button") || !window.getSelection()?.isCollapsed) return;
    editButton.current?.focus();
    onEdit();
  };

  return (
    <li
      onClick={openFromRow}
      className={`grid min-h-20 cursor-pointer grid-cols-[1fr_auto] items-center gap-x-3 border-t border-line py-3 sm:grid-cols-[1fr_auto_auto] ${
        item.status === "overdue" ? `${lateBar} ` : ""
      }${justDone ? "animate-row-flash" : ""}`}
    >
      <p className="col-start-1 row-start-1 min-w-0 text-title font-semibold">{item.name}</p>
      <p className="col-span-2 row-start-2 sm:col-span-1 sm:col-start-1">
        <span className={statusClass(level)}>{dueWords(item)}</span>
      </p>
      <div className="col-start-1 row-start-3 mt-1.5">
        <UpkeepChips chips={rowChips(item)} />
      </div>
      <button
        ref={editButton}
        type="button"
        className={`${quietButton} col-start-2 row-start-3 sm:row-span-3 sm:row-start-1 sm:self-center`}
        onClick={onEdit}
        aria-label={copy.maintenance.editLabel(item.name)}
      >
        {copy.maintenance.edit}
      </button>
      <button
        type="button"
        className={`${doneStyle} ${doneSize} col-start-2 row-start-1 sm:col-start-3 sm:row-span-3 sm:self-center`}
        disabled={busy}
        data-done-action
        onClick={onDone}
        aria-label={copy.maintenance.doneLabel(item.name)}
      >
        {copy.maintenance.done}
      </button>
    </li>
  );
};
