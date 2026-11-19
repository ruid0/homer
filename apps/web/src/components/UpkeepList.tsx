import { copy } from "../copy";
import { dueWords, isDoneToday } from "../lib/maintenanceText";
import type { MaintenanceItem } from "../trpc";
import { HomeRow } from "./HomeRow";
import { doneSize, quietButton, secondaryButton } from "./ui";

type Props = { items: MaintenanceItem[]; busy: boolean; justDoneId?: number | null; onDone: (item: MaintenanceItem) => void; onSnooze: (item: MaintenanceItem) => void };

// Buttons stack on a phone, so the name keeps its width.
export const UpkeepList = ({ items, busy, justDoneId = null, onDone, onSnooze }: Props) => (
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
          <div className="flex shrink-0 flex-col items-end sm:flex-row sm:items-center">
            {item.status !== "soon" && (
              <button type="button" className={quietButton} disabled={busy} aria-label={copy.maintenance.notTodayLabel(item.name)} onClick={() => onSnooze(item)}>
                {copy.maintenance.notToday}
              </button>
            )}
            {!isDoneToday(item) && (
              <button
                type="button"
                className={`${secondaryButton} ${doneSize}`}
                disabled={busy}
                data-done-action
                aria-label={copy.maintenance.doneLabel(item.name)}
                onClick={() => onDone(item)}
              >
                {copy.maintenance.done}
              </button>
            )}
          </div>
        }
      />
    ))}
  </ul>
);
