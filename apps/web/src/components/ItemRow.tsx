import { describeRunsOut, quantityText } from "../lib/itemText";
import type { ListItem } from "../trpc";
import { ListRow } from "./ListRow";
import { doneSize, quietButton, secondaryButton, statusClass } from "./ui";
import { copy } from "../copy";

type Props = {
  item: ListItem;
  onList: boolean;
  onBought: () => void;
  onAddToList: () => void;
  adding: boolean;
  onEdit: () => void;
};

export const ItemRow = ({ item, onList, onBought, onAddToList, adding, onEdit }: Props) => {
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
      status={<span className={statusClass(urgent ? "warn" : "plain")}>{describeRunsOut(item)}</span>}
      details={[`${quantityText(item.quantity)} ${item.unit}`, onList ? copy.items.onGroceryList : null, note].filter(
        (part) => part !== null,
      )}
      actions={
        <>
          <button type="button" className={quietButton} onClick={onEdit} aria-label={copy.items.editLabel(item.name)}>
            {copy.items.edit}
          </button>
          {!onList && (
            <button
              type="button"
              className={secondaryButton}
              onClick={onAddToList}
              disabled={adding}
              aria-label={copy.stockPage.addToListLabel(item.name)}
            >
              {copy.stockPage.addToList}
            </button>
          )}
          <button
            type="button"
            className={`${secondaryButton} ${doneSize}`}
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
