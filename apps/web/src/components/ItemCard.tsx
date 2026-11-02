import { describeRunsOut } from "../lib/itemText";
import type { ListItem } from "../trpc";
import { primaryButton, secondaryButton } from "./ui";

type Props = {
  item: ListItem;
  onBought: () => void;
  onOut: () => void;
  onEdit: () => void;
};

const estimateNote = (item: ListItem) =>
  item.estimateSource === null ? null : item.estimateSource === "learned" ? "Learned from restocks" : "Entered by hand";

export const ItemCard = ({ item, onBought, onOut, onEdit }: Props) => {
  const urgent = item.runningLow || item.quantity === 0;
  const note = estimateNote(item);

  return (
    <li className="grid gap-3 rounded-xl border border-stone-200 bg-white p-4 dark:border-stone-800 dark:bg-stone-900">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">{item.name}</h2>
          <p className="text-stone-600 dark:text-stone-400">{`${item.quantity} ${item.unit}`}</p>
        </div>
        <button type="button" className={`${secondaryButton} shrink-0`} onClick={onEdit} aria-label={`Edit ${item.name}`}>
          Edit
        </button>
      </div>
      <p className={urgent ? "text-xl font-semibold text-amber-700 dark:text-amber-400" : "text-xl"}>
        {describeRunsOut(item)}
      </p>
      {note && <p className="-mt-2 text-sm text-stone-600 dark:text-stone-400">{note}</p>}
      <div className="flex gap-3">
        <button type="button" className={`${primaryButton} flex-1`} onClick={onBought}>Bought it</button>
        {item.quantity > 0 && (
          <button type="button" className={secondaryButton} onClick={onOut}>Out of it</button>
        )}
      </div>
    </li>
  );
};
