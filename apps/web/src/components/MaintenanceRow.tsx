import { copy } from "../copy";
import { dueWords, rowDetails } from "../lib/maintenanceText";
import type { MaintenanceItem } from "../trpc";
import { ListRow } from "./ListRow";
import { doneSize, quietButton, secondaryButton, statusClass } from "./ui";

type Props = { item: MaintenanceItem; busy: boolean; justDone?: boolean; onDone: () => void; onEdit: () => void };

export const MaintenanceRow = ({ item, busy, justDone = false, onDone, onEdit }: Props) => {
  const late = item.status === "overdue" || item.status === "due";
  const urgent = late || item.status === "soon";
  const level = late ? "late" : urgent ? "warn" : "plain";
  return (
    <ListRow
      title={item.name}
      overdue={item.status === "overdue"}
      flash={justDone}
      status={<span className={statusClass(level)}>{dueWords(item)}</span>}
      details={rowDetails(item)}
      actions={
        <>
          <button type="button" className={quietButton} onClick={onEdit} aria-label={copy.maintenance.editLabel(item.name)}>
            {copy.maintenance.edit}
          </button>
          <button
            type="button"
            className={`${secondaryButton} ${doneSize}`}
            disabled={busy}
            data-done-action
            onClick={onDone}
            aria-label={copy.maintenance.doneLabel(item.name)}
          >
            {copy.maintenance.done}
          </button>
        </>
      }
    />
  );
};
