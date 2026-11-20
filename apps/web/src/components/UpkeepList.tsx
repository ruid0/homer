import { copy } from "../copy";
import { dueWords, isDoneToday } from "../lib/maintenanceText";
import type { MaintenanceItem } from "../trpc";
import { Row } from "./Row";
import { cx, rowAction, secondaryButton } from "./ui";

type Props = {
  items: MaintenanceItem[];
  busy: boolean;
  justDoneId?: number | null;
  onDone: (item: MaintenanceItem) => void;
  onSnooze: (item: MaintenanceItem) => void;
};

// Done is the one button. Tapping the row asks "Not today", the only other thing this card does.
export const UpkeepList = ({ items, busy, justDoneId = null, onDone, onSnooze }: Props) => (
  <ul>
    {items.map((item) => (
      <Row
        key={item.id}
        title={item.name}
        status={{ text: dueWords(item), level: item.status === "soon" ? "warn" : "late" }}
        overdue={item.status === "overdue"}
        flash={item.id === justDoneId}
        onOpen={item.status === "soon" ? undefined : () => onSnooze(item)}
        openLabel={item.status === "soon" ? undefined : copy.maintenance.notTodayLabel(item.name)}
        action={
          isDoneToday(item) ? undefined : (
            <button
              type="button"
              className={cx(secondaryButton, rowAction)}
              disabled={busy}
              data-done-action
              aria-label={copy.maintenance.doneLabel(item.name)}
              onClick={() => onDone(item)}
            >
              {copy.maintenance.done}
            </button>
          )
        }
      />
    ))}
  </ul>
);
