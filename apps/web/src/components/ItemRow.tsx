import { describeRunsOut, quantityText } from "../lib/itemText";
import type { ListItem } from "../trpc";
import { Row } from "./Row";
import { cx, rowAction, secondaryButton } from "./ui";
import { copy } from "../copy";

type Props = {
  item: ListItem;
  onList: boolean;
  onAddToList: () => void;
  adding: boolean;
  onEdit: () => void;
};

export const ItemRow = ({ item, onList, onAddToList, adding, onEdit }: Props) => {
  const urgent = item.runningLow || item.quantity === 0;
  const runsOut = describeRunsOut(item);
  const note =
    item.estimateSource === "learned" && item.learnedFrom !== null
      ? copy.items.learnedFrom(item.learnedFrom)
      : item.estimateSource
        ? copy.items.estimateSource[item.estimateSource]
        : null;
  const meta = [urgent ? null : runsOut, `${quantityText(item.quantity)} ${item.unit}`, note]
    .filter((part) => part !== null)
    .join(copy.common.separator);

  return (
    <Row
      title={item.name}
      status={urgent ? { text: runsOut, level: "warn" } : undefined}
      meta={meta}
      onOpen={onEdit}
      openLabel={copy.items.editLabel(item.name)}
      action={
        onList ? (
          <span className="rounded-full border border-control px-3 py-1 text-meta font-semibold text-muted">
            {copy.stockPage.onList}
          </span>
        ) : (
          <button
            type="button"
            className={cx(secondaryButton, rowAction)}
            onClick={onAddToList}
            disabled={adding}
            aria-label={copy.stockPage.addToListLabel(item.name)}
          >
            {copy.stockPage.addToList}
          </button>
        )
      }
    />
  );
};
