import { useState, type FormEvent } from "react";
import { DEFAULT_LOW_THRESHOLD_DAYS, itemInputSchema, type ItemInput } from "@homer/shared";
import type { ListItem } from "../trpc";
import { Dialog } from "./Dialog";
import { inputClass, primaryButton, secondaryButton } from "./ui";

type Props = {
  item?: ListItem;
  pending: boolean;
  serverError?: string;
  onSave: (values: ItemInput) => void;
  onRemove?: () => void;
  onClose: () => void;
};

const fieldLabels: Record<string, string> = {
  name: "Name",
  unit: "Unit",
  quantity: "Quantity",
  daysPerUnit: "Lasts",
  lowThresholdDays: "Low at",
};

const toNumberOrNull = (text: string) => (text.trim() === "" ? null : Number(text));

export const ItemForm = ({ item, pending, serverError, onSave, onRemove, onClose }: Props) => {
  const [name, setName] = useState(item?.name ?? "");
  const [unit, setUnit] = useState(item?.unit ?? "");
  const [quantity, setQuantity] = useState(String(item?.quantity ?? 0));
  const [daysPerUnit, setDaysPerUnit] = useState(String(item?.daysPerUnitEntered ?? ""));
  const [threshold, setThreshold] = useState(String(item?.lowThresholdDays ?? DEFAULT_LOW_THRESHOLD_DAYS));
  const [error, setError] = useState<string>();

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const parsed = itemInputSchema.safeParse({
      name,
      unit,
      quantity: Number(quantity),
      daysPerUnit: toNumberOrNull(daysPerUnit),
      lowThresholdDays: Number(threshold),
    });
    if (parsed.success) return onSave(parsed.data);
    const issue = parsed.error.issues[0];
    setError(`${fieldLabels[String(issue?.path[0])] ?? "Form"}: check this value and try again.`);
  };

  return (
    <Dialog title={item ? `Edit ${item.name}` : "Add item"} onClose={onClose}>
      <form onSubmit={submit} className="grid gap-4">
        <Field label="Name">
          <input className={inputClass} value={name} onChange={(e) => setName(e.target.value)} autoFocus />
        </Field>
        <Field label="Unit (bag, litre)">
          <input className={inputClass} value={unit} onChange={(e) => setUnit(e.target.value)} />
        </Field>
        <Field label="Quantity">
          <NumberInput value={quantity} onChange={setQuantity} />
        </Field>
        <Field label="Lasts (days per unit, blank if unknown)">
          <NumberInput value={daysPerUnit} onChange={setDaysPerUnit} />
        </Field>
        <Field label="Low at (days left)">
          <NumberInput value={threshold} onChange={setThreshold} />
        </Field>
        {(error ?? serverError) && <p role="alert" className="text-red-700 dark:text-red-400">{error ?? serverError}</p>}
        <div className="flex flex-wrap justify-end gap-3">
          {onRemove && (
            <button type="button" className={`${secondaryButton} mr-auto`} onClick={onRemove}>Remove item</button>
          )}
          <button type="button" className={secondaryButton} onClick={onClose}>Cancel</button>
          <button type="submit" className={primaryButton} disabled={pending}>Save</button>
        </div>
      </form>
    </Dialog>
  );
};

const Field = ({ label, children }: { label: string; children: React.ReactNode }) => (
  <label className="grid gap-1">
    <span>{label}</span>
    {children}
  </label>
);

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
