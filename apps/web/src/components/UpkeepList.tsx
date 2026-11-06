import { copy } from "../copy";
import { dueWords } from "../lib/maintenanceText";
import type { MaintenanceItem } from "../trpc";
import { HomeRow } from "./HomeRow";
import { doneSize, secondaryButton } from "./ui";

type Props = { items: MaintenanceItem[]; busy: boolean; justDoneId?: number | null; onDone: (item: MaintenanceItem) => void };

export const UpkeepList = ({ items, busy, justDoneId = null, onDone }: Props) => (
  <ul>
    {items.map((item) => (
      <HomeRow
        key={item.id}
        title={item.name}
        status={dueWords(item)}
        level={item.status === "soon" ? "warn" : "late"}
        overdue={item.status === "overdue"}
        flash={item.id === justDoneId}
        action={
          <button
            type="button"
            className={`${secondaryButton} ${doneSize} shrink-0`}
            disabled={busy}
            data-done-action
            aria-label={copy.maintenance.doneLabel(item.name)}
            onClick={() => onDone(item)}
          >
            {copy.maintenance.done}
          </button>
        }
      />
    ))}
  </ul>
);
