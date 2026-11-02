import { useState, type SubmitEvent } from "react";
import { restockInputSchema } from "@homer/shared";
import { Dialog } from "./Dialog";
import { inputClass, primaryButton, secondaryButton } from "./ui";

type Props = {
  name: string;
  unit: string;
  initialQuantity: number;
  pending: boolean;
  serverError?: string;
  onSave: (quantity: number) => void;
  onClose: () => void;
};

export const RestockDialog = ({ name, unit, initialQuantity, pending, serverError, onSave, onClose }: Props) => {
  const [quantity, setQuantity] = useState(String(initialQuantity));
  const [error, setError] = useState<string>();

  const submit = (event: SubmitEvent) => {
    event.preventDefault();
    const parsed = restockInputSchema.shape.quantity.safeParse(Number(quantity));
    setError(parsed.success ? undefined : "Enter a quantity above 0.");
    if (parsed.success) onSave(parsed.data);
  };

  return (
    <Dialog title={`Bought ${name}`} onClose={onClose}>
      <form onSubmit={submit} className="grid gap-4">
        <label className="grid gap-1">
          <span>{`Quantity bought (${unit})`}</span>
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
