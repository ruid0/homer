import { copy } from "../copy";
import { dueWords, rowDetails } from "../lib/maintenanceText";
import type { MaintenanceItem } from "../trpc";
import { ListRow } from "./ListRow";
import { quietButton, secondaryButton } from "./ui";

type Props = { item: MaintenanceItem; busy: boolean; onDone: () => void; onEdit: () => void };

export const MaintenanceRow = ({ item, busy, onDone, onEdit }: Props) => {
  const late = item.status === "overdue" || item.status === "due";
  const urgent = late || item.status === "soon";
  return (
    <ListRow
      title={item.name}
      status={<span className={urgent ? `text-answer font-semibold ${late ? "text-late" : "text-warn"}` : "text-answer"}>{dueWords(item)}</span>}
      details={rowDetails(item)}
      actions={
        <>
          <button type="button" className={quietButton} onClick={onEdit} aria-label={copy.maintenance.editLabel(item.name)}>
            {copy.maintenance.edit}
          </button>
          <button
            type="button"
            className={`${secondaryButton} px-6`}
            disabled={busy}
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
