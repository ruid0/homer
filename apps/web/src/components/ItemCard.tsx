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
    <li className="flex flex-col gap-3 rounded-xl border border-stone-200 bg-white p-4 dark:border-stone-800 dark:bg-stone-900">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">{item.name}</h2>
          <p className="text-stone-600 dark:text-stone-400">{`${item.quantity} ${item.unit}`}</p>
        </div>
        <button type="button" className={`${secondaryButton} shrink-0`} onClick={onEdit} aria-label={copy.items.editLabel(item.name)}>
          {copy.items.edit}
        </button>
      </div>
      <p className={urgent ? "text-xl font-semibold text-amber-700 dark:text-amber-400" : "text-xl"}>
        {describeRunsOut(item)}
      </p>
      {onList && <p className="-mt-2 text-sm font-medium">{copy.items.onGroceryList}</p>}
      {note && <p className="-mt-2 text-sm text-stone-600 dark:text-stone-400">{note}</p>}
      <div className="mt-auto flex gap-3">
        <button type="button" className={`${primaryButton} flex-1`} onClick={onBought}>{copy.common.boughtIt}</button>
        {item.quantity > 0 && (
          <button type="button" className={secondaryButton} onClick={onOut} disabled={busy}>{copy.stock.outOfIt}</button>
        )}
      </div>
    </li>
  );
};
