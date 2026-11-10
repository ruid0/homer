import type { ListEntry } from "../trpc";
import { ListRow } from "./ListRow";
import { quietButton, secondaryButton } from "./ui";
import { copy } from "../copy";

type Props = { entry: ListEntry; busy: boolean; onBought: () => void; onRemove: () => void };

const describeAmount = ({ quantity, unit }: ListEntry) =>
  quantity === null ? null : unit === null ? String(quantity) : `${quantity} ${unit}`;

export const GroceryRow = ({ entry, busy, onBought, onRemove }: Props) => (
  <ListRow
    title={entry.text}
    details={[
      describeAmount(entry),
      entry.addedBy === "auto" ? copy.groceries.addedAutomatically : copy.groceries.addedByHand,
    ].filter((part) => part !== null)}
    actions={
      <>
        <button
          type="button"
          className={quietButton}
          onClick={onRemove}
          disabled={busy}
          aria-label={copy.groceries.removeLabel(entry.text)}
        >
          {copy.groceries.remove}
        </button>
        <button
          type="button"
          className={`${secondaryButton} px-6`}
          onClick={onBought}
          disabled={busy}
          aria-label={copy.common.boughtLabel(entry.text)}
        >
          {copy.common.boughtIt}
        </button>
      </>
    }
  />
);
