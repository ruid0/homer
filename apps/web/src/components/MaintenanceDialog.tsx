import { useState, type SubmitEvent } from "react";
import { MAX_MAINTENANCE_EVERY, MAX_MAINTENANCE_NAME, addDays, maintenanceUnitValues, type MaintenanceUnit } from "@homer/shared";
import { copy } from "../copy";
import type { MaintenanceItem } from "../trpc";
import { Dialog } from "./Dialog";
import { Field } from "./Field";
import { ConfirmRemove } from "./ConfirmRemove";
import { MaintenanceHistory } from "./MaintenanceHistory";
import { MaintenanceSuggestions, type Suggestion } from "./MaintenanceSuggestions";
import { inputClass, primaryButton, secondaryButton } from "./ui";

export type MaintenanceForm = { name: string; every: number; unit: MaintenanceUnit; lastDoneOn: string | null };

type Props = {
  // Null means adding a new item.
  item: MaintenanceItem | null;
  today: string;
  // Names already on the list are left out of the suggestions.
  takenNames: string[];
  pending: boolean;
  serverError?: string;
  onSave: (form: MaintenanceForm) => void;
  onRemove: () => void;
  onChanged: () => void;
  onClose: () => void;
};

const YEAR_BACK_DAYS = 365;
const DEFAULT_UNIT: MaintenanceUnit = "months";

export const MaintenanceDialog = ({ item, today, takenNames, pending, serverError, onSave, onRemove, onChanged, onClose }: Props) => {
  const [name, setName] = useState(item?.name ?? "");
  const [every, setEvery] = useState(String(item?.every ?? 3));
  const [unit, setUnit] = useState<MaintenanceUnit>(item?.unit ?? DEFAULT_UNIT);
  const [neverDone, setNeverDone] = useState(true);
  const [lastDone, setLastDone] = useState(today);
  const [error, setError] = useState<string>();

  const pick = (suggestion: Suggestion) => {
    setName(suggestion.name);
    // Twelve months reads better as a year.
    const wholeYears = suggestion.unit === "months" && suggestion.every % 12 === 0;
    setEvery(String(wholeYears ? suggestion.every / 12 : suggestion.every));
    setUnit(wholeYears ? "years" : suggestion.unit);
    setError(undefined);
  };

  const submit = (event: SubmitEvent) => {
    event.preventDefault();
    const count = Number(every);
    if (name.trim() === "") return setError(copy.maintenance.blankName);
    if (!Number.isInteger(count) || count < 1 || count > MAX_MAINTENANCE_EVERY) return setError(copy.maintenance.badEvery);
    const lastDoneOn = item || neverDone ? null : lastDone;
    if (lastDoneOn !== null && (lastDoneOn > today || lastDoneOn < addDays(today, -YEAR_BACK_DAYS))) return setError(copy.maintenance.badDate);
    setError(undefined);
    onSave({ name: name.trim(), every: count, unit, lastDoneOn });
  };

  return (
    <Dialog title={item ? copy.maintenance.editTitle(item.name) : copy.maintenance.addTitle} onClose={onClose}>
      <form onSubmit={submit} noValidate className="grid gap-4">
        {!item && <MaintenanceSuggestions takenNames={takenNames} selectedName={name} onPick={pick} />}
        <Field label={copy.maintenance.name}>
          <input className={inputClass} value={name} maxLength={MAX_MAINTENANCE_NAME} onChange={(event) => setName(event.target.value)} autoFocus />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label={copy.maintenance.every}>
            <input
              className={inputClass}
              type="number"
              inputMode="numeric"
              min={1}
              max={MAX_MAINTENANCE_EVERY}
              value={every}
              onChange={(event) => setEvery(event.target.value)}
            />
          </Field>
          <Field label={copy.maintenance.unit}>
            <select className={inputClass} value={unit} onChange={(event) => setUnit(event.target.value as MaintenanceUnit)}>
              {maintenanceUnitValues.map((value) => (
                <option key={value} value={value}>{copy.maintenance.unitNames[value]}</option>
              ))}
            </select>
          </Field>
        </div>
        {!item && (
          <div className="grid gap-2">
            <label className="flex min-h-11 items-center gap-2">
              <input type="checkbox" className="size-5" checked={neverDone} onChange={(event) => setNeverDone(event.target.checked)} />
              {copy.maintenance.notDoneYetLabel}
            </label>
            {!neverDone && (
              <Field label={copy.maintenance.lastDoneLabel}>
                <input
                  className={inputClass}
                  type="date"
                  value={lastDone}
                  max={today}
                  min={addDays(today, -YEAR_BACK_DAYS)}
                  onChange={(event) => setLastDone(event.target.value)}
                />
              </Field>
            )}
          </div>
        )}
        {(error ?? serverError) && <p role="alert" className="text-late">{error ?? serverError}</p>}
        {item && <MaintenanceHistory itemId={item.id} today={today} onChanged={onChanged} />}
        {item && <ConfirmRemove pending={pending} onRemove={onRemove} />}
        <div className="flex justify-end gap-3">
          <button type="button" className={secondaryButton} onClick={onClose}>{copy.common.cancel}</button>
          <button type="submit" className={primaryButton} disabled={pending}>{copy.common.save}</button>
        </div>
      </form>
    </Dialog>
  );
};
