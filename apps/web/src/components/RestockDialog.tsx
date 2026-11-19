import { useState, type SubmitEvent } from "react";
import { restockInputSchema } from "@homer/shared";
import { Dialog } from "./Dialog";
import { DialogActions } from "./DialogActions";
import { inputClass } from "./ui";
import { copy } from "../copy";

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
    setError(parsed.success ? undefined : copy.restockDialog.invalidQuantity);
    if (parsed.success) onSave(parsed.data);
  };

  return (
    <Dialog title={copy.restockDialog.title(name)} onClose={onClose}>
      <form onSubmit={submit} className="grid gap-4">
        <label className="grid gap-1">
          <span>{copy.restockDialog.quantityBought(unit)}</span>
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
        <DialogActions pending={pending} error={error ?? serverError} onCancel={onClose} />
      </form>
    </Dialog>
  );
};
