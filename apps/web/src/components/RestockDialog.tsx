import { useState, type FormEvent } from "react";
import { restockInputSchema } from "@homer/shared";
import type { ListItem } from "../trpc";
import { Dialog } from "./Dialog";
import { inputClass, primaryButton, secondaryButton } from "./ui";

type Props = {
  item: ListItem;
  pending: boolean;
  serverError?: string;
  onSave: (quantity: number) => void;
  onClose: () => void;
};

export const RestockDialog = ({ item, pending, serverError, onSave, onClose }: Props) => {
  const [quantity, setQuantity] = useState(String(item.usualRestock ?? 1));
  const [error, setError] = useState<string>();

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const parsed = restockInputSchema.safeParse({ itemId: item.id, quantity: Number(quantity) });
    if (parsed.success) onSave(parsed.data.quantity);
    else setError("Enter a quantity above 0.");
  };

  return (
    <Dialog title={`Bought ${item.name}`} onClose={onClose}>
      <form onSubmit={submit} className="grid gap-4">
        <label className="grid gap-1">
          <span>{`Quantity bought (${item.unit})`}</span>
          <input
            className={inputClass}
            type="number"
            inputMode="decimal"
            step="any"
            min="0"
            value={quantity}
            onChange={(event) => setQuantity(event.target.value)}
            autoFocus
          />
        </label>
        {(error ?? serverError) && <p role="alert" className="text-red-700 dark:text-red-400">{error ?? serverError}</p>}
        <div className="flex justify-end gap-3">
          <button type="button" className={secondaryButton} onClick={onClose}>Cancel</button>
          <button type="submit" className={primaryButton} disabled={pending}>Save</button>
        </div>
      </form>
    </Dialog>
  );
};
