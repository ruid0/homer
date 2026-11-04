import type { ListEntry } from "../trpc";
import { primaryButton, secondaryButton } from "./ui";
import { copy } from "../copy";

type Props = { entry: ListEntry; busy: boolean; onBought: () => void; onRemove: () => void };

const describeAmount = ({ quantity, unit }: ListEntry) =>
  quantity === null ? null : unit === null ? String(quantity) : `${quantity} ${unit}`;

export const GroceryCard = ({ entry, busy, onBought, onRemove }: Props) => {
  const amount = describeAmount(entry);

  return (
    <li className="flex flex-col gap-3 rounded-xl border border-line bg-card p-4">
      <div>
        <h2 className="text-title font-semibold">{entry.text}</h2>
        {amount && <p className="text-muted">{amount}</p>}
        <p className="text-meta text-muted">
          {entry.addedBy === "auto" ? copy.groceries.addedAutomatically : copy.groceries.addedByHand}
        </p>
      </div>
      <div className="mt-auto flex gap-3">
        <button type="button" className={`${primaryButton} flex-1`} onClick={onBought} disabled={busy}>{copy.common.boughtIt}</button>
        <button type="button" className={secondaryButton} onClick={onRemove} disabled={busy}>{copy.groceries.remove}</button>
      </div>
    </li>
  );
};
