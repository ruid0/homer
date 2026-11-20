import { copy } from "../copy";
import { dueWords, isDoneToday, needsDoing, rowChips } from "../lib/maintenanceText";
import type { MaintenanceItem } from "../trpc";
import { Row } from "./Row";
import { cx, quietButton, rowAction, secondaryButton } from "./ui";

type Props = {
  item: MaintenanceItem;
  busy: boolean;
  justDone?: boolean;
  onDone: () => void;
  onEdit: () => void;
};

// Tap the row to edit (Not today is in that dialog); Done is the one button. A job done today has no Done, since a
// second done on the same day is refused.
export const MaintenanceRow = ({ item, busy, justDone = false, onDone, onEdit }: Props) => {
  const late = item.status === "overdue" || item.status === "due";
  const words = dueWords(item);
  const status = late
    ? { text: words, level: "late" as const }
    : item.status === "soon"
      ? { text: words, level: "warn" as const }
      : undefined;
  // Later rows are not asked for yet, so their Done is quiet; Due now rows keep the outlined one.
  const doneStyle = needsDoing(item.status) ? secondaryButton : quietButton;
  return (
    <Row
      title={item.name}
      status={status}
      meta={[...(status ? [] : [words]), ...rowChips(item)].join(copy.common.separator)}
      overdue={item.status === "overdue"}
      flash={justDone}
      onOpen={onEdit}
      openLabel={copy.maintenance.editLabel(item.name)}
      action={
        isDoneToday(item) ? undefined : (
          <button
            type="button"
            className={cx(doneStyle, rowAction)}
            disabled={busy}
            data-done-action
            onClick={onDone}
            aria-label={copy.maintenance.doneLabel(item.name)}
          >
            {copy.maintenance.done}
          </button>
        )
      }
    />
  );
};
