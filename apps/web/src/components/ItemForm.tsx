import { useState, type SubmitEvent } from "react";
import { quantityText } from "../lib/itemText";
import { DEFAULT_LOW_THRESHOLD_DAYS, itemInputSchema, type ItemInput } from "@homer/shared";
import type { ListItem } from "../trpc";
import { Dialog } from "./Dialog";
import { DialogActions } from "./DialogActions";
import { Field } from "./Field";
import { inputClass, secondaryButton } from "./ui";
import { copy } from "../copy";

type Props = {
  item?: ListItem;
  pending: boolean;
  serverError?: string;
  onSave: (values: ItemInput) => void;
  onRemove?: () => void;
  onOut?: () => void;
  outPending?: boolean;
  outError?: string;
  onClose: () => void;
};

const fieldLabels: Readonly<Record<string, string | undefined>> = copy.itemForm.invalidFields;

const toNumberOrNull = (text: string) => (text.trim() === "" ? null : Number(text));

const invalidFields = (issues: readonly { path: readonly PropertyKey[] }[]) =>
  [...new Set(issues.map((issue) => fieldLabels[String(issue.path[0])] ?? copy.itemForm.wholeForm))].join(", ");

export const ItemForm = ({ item, pending, serverError, onSave, onRemove, onOut, outPending = false, outError, onClose }: Props) => {
  const [name, setName] = useState(item?.name ?? "");
  const [unit, setUnit] = useState(item?.unit ?? "");
  const [quantity, setQuantity] = useState(quantityText(item?.quantity ?? 0));
  const [daysPerUnit, setDaysPerUnit] = useState(String(item?.daysPerUnitEntered ?? ""));
  const [threshold, setThreshold] = useState(String(item?.lowThresholdDays ?? DEFAULT_LOW_THRESHOLD_DAYS));
  const [error, setError] = useState<string>();

  // Ran out acts on the saved item, so it waits until nothing in the form has been changed.
  const untouched =
    item !== undefined &&
    name === item.name &&
    unit === item.unit &&
    quantity === quantityText(item.quantity) &&
    daysPerUnit === String(item.daysPerUnitEntered ?? "") &&
    threshold === String(item.lowThresholdDays);

  const submit = (event: SubmitEvent) => {
    event.preventDefault();
    const parsed = itemInputSchema.safeParse({
      name,
      unit,
      quantity: toNumberOrNull(quantity),
      daysPerUnit: toNumberOrNull(daysPerUnit),
      lowThresholdDays: toNumberOrNull(threshold),
    });
    setError(undefined);
    if (parsed.success) return onSave(parsed.data);
    setError(copy.itemForm.fixFields(invalidFields(parsed.error.issues)));
  };

  return (
    <Dialog title={item ? copy.itemForm.editTitle(item.name) : copy.itemForm.addTitle} onClose={onClose}>
      <form onSubmit={submit} className="grid gap-4">
        <Field label={copy.itemForm.name}>
          <input className={inputClass} value={name} onChange={(e) => setName(e.target.value)} autoFocus />
        </Field>
        <Field label={copy.itemForm.unit}>
          <input className={inputClass} value={unit} onChange={(e) => setUnit(e.target.value)} />
        </Field>
        <Field label={copy.itemForm.quantity}>
          <NumberInput value={quantity} onChange={setQuantity} />
        </Field>
        {item && onOut && item.quantity > 0 && untouched && (
          <div className="grid justify-items-start gap-1">
            <button type="button" className={secondaryButton} disabled={pending || outPending} onClick={onOut} aria-label={copy.items.outLabel(item.name)} aria-describedby="ran-out-hint">
              {copy.stock.ranOut}
            </button>
            <p id="ran-out-hint" className="text-meta text-muted">{copy.itemForm.ranOutHint}</p>
          </div>
        )}
        <Field label={copy.itemForm.daysPerUnit}>
          <NumberInput value={daysPerUnit} onChange={setDaysPerUnit} />
        </Field>
        <Field label={copy.itemForm.lowThresholdDays}>
          <NumberInput value={threshold} onChange={setThreshold} />
        </Field>
        <DialogActions
          pending={pending || outPending}
          error={error ?? serverError ?? (untouched ? outError : undefined)}
          onCancel={onClose}
          remove={onRemove ? { label: copy.itemForm.removeItem, onClick: onRemove } : undefined}
        />
      </form>
    </Dialog>
  );
};

const NumberInput = ({ value, onChange }: { value: string; onChange: (value: string) => void }) => (
  <input
    className={inputClass}
    type="number"
    inputMode="decimal"
    step="any"
    min="0"
    value={value}
    onChange={(event) => onChange(event.target.value)}
  />
);
