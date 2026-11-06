import { describeRunsOut, quantityText } from "../lib/itemText";
import type { ListItem } from "../trpc";
import { ListRow } from "./ListRow";
import { quietButton, secondaryButton } from "./ui";
import { copy } from "../copy";

type Props = {
  item: ListItem;
  busy: boolean;
  onList: boolean;
  onBought: () => void;
  onOut: () => void;
  onEdit: () => void;
};

export const ItemRow = ({ item, busy, onList, onBought, onOut, onEdit }: Props) => {
  const urgent = item.runningLow || item.quantity === 0;
  const note =
    item.estimateSource === "learned" && item.learnedFrom !== null
      ? copy.items.learnedFrom(item.learnedFrom)
      : item.estimateSource
        ? copy.items.estimateSource[item.estimateSource]
        : null;

  return (
    <ListRow
      title={item.name}
      status={<span className={urgent ? "font-semibold text-warn" : undefined}>{describeRunsOut(item)}</span>}
      details={[`${quantityText(item.quantity)} ${item.unit}`, onList ? copy.items.onGroceryList : null, note].filter(
        (part) => part !== null,
      )}
      actions={
        <>
          <button type="button" className={quietButton} onClick={onEdit} aria-label={copy.items.editLabel(item.name)}>
            {copy.items.edit}
          </button>
          {item.quantity > 0 && (
            <button
              type="button"
              className={secondaryButton}
              onClick={onOut}
              disabled={busy}
              aria-label={copy.items.outLabel(item.name)}
            >
              {copy.stock.outOfIt}
            </button>
          )}
          <button
            type="button"
            className={`${secondaryButton} px-6`}
            onClick={onBought}
            aria-label={copy.common.boughtLabel(item.name)}
          >
            {copy.common.boughtIt}
          </button>
        </>
      }
    />
  );
};
