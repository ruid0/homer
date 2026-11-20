import type { ListEntry } from "../trpc";
import { Row } from "./Row";
import { cx, rowAction, secondaryButton } from "./ui";
import { copy } from "../copy";

type Props = { entry: ListEntry; busy: boolean; onBought: () => void; onRemove: () => void };

const describeAmount = ({ quantity, unit }: ListEntry) =>
  quantity === null ? null : unit === null ? String(quantity) : `${quantity} ${unit}`;

export const GroceryRow = ({ entry, busy, onBought, onRemove }: Props) => (
  <Row
    title={entry.text}
    meta={[
      describeAmount(entry),
      entry.addedBy === "auto" ? copy.groceries.addedAutomatically : copy.groceries.addedByHand,
    ]
      .filter((part) => part !== null)
      .join(copy.common.separator)}
    action={
      <span className="flex items-center gap-2">
        <button
          type="button"
          className={cx(secondaryButton, "w-11 px-0 text-muted")}
          onClick={onRemove}
          disabled={busy}
          aria-label={copy.groceries.removeLabel(entry.text)}
        >
          {copy.groceries.removeMark}
        </button>
        <button
          type="button"
          className={cx(secondaryButton, rowAction)}
          onClick={onBought}
          disabled={busy}
          aria-label={copy.common.boughtLabel(entry.text)}
        >
          {copy.common.boughtIt}
        </button>
      </span>
    }
  />
);
