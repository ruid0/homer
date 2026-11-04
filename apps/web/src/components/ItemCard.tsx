import { describeRunsOut } from "../lib/itemText";
import type { ListItem } from "../trpc";
import { primaryButton, secondaryButton } from "./ui";
import { copy } from "../copy";

type Props = {
  item: ListItem;
  busy: boolean;
  onList: boolean;
  onBought: () => void;
  onOut: () => void;
  onEdit: () => void;
};

export const ItemCard = ({ item, busy, onList, onBought, onOut, onEdit }: Props) => {
  const urgent = item.runningLow || item.quantity === 0;
  const note = item.estimateSource && copy.items.estimateSource[item.estimateSource];

  return (
    <li className="flex flex-col gap-3 rounded-xl border border-line bg-card p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-title font-semibold">{item.name}</h2>
          <p className="text-muted">{`${item.quantity} ${item.unit}`}</p>
        </div>
        <button type="button" className={`${secondaryButton} shrink-0`} onClick={onEdit} aria-label={copy.items.editLabel(item.name)}>
          {copy.items.edit}
        </button>
      </div>
      <p className={urgent ? "text-answer font-semibold text-warn" : "text-answer"}>
        {describeRunsOut(item)}
      </p>
      {onList && <p className="-mt-2 text-meta font-medium">{copy.items.onGroceryList}</p>}
      {note && <p className="-mt-2 text-meta text-muted">{note}</p>}
      <div className="mt-auto flex gap-3">
        <button type="button" className={`${primaryButton} flex-1`} onClick={onBought}>{copy.common.boughtIt}</button>
        {item.quantity > 0 && (
          <button type="button" className={secondaryButton} onClick={onOut} disabled={busy}>{copy.stock.outOfIt}</button>
        )}
      </div>
    </li>
  );
};
