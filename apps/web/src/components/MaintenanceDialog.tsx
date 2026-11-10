import { useState, type SubmitEvent } from "react";
import { MAX_MAINTENANCE_EVERY, MAX_MAINTENANCE_NAME, addDays, maintenanceUnitValues, type MaintenanceUnit } from "@homer/shared";
import { copy } from "../copy";
import type { MaintenanceItem } from "../trpc";
import { Dialog } from "./Dialog";
import { Field } from "./Field";
import { ConfirmRemove } from "./ConfirmRemove";
import { MaintenanceHistory } from "./MaintenanceHistory";
import { MaintenanceSuggestions, type Suggestion } from "./MaintenanceSuggestions";
import { DialogActions } from "./DialogActions";
import { SegmentedChoice } from "./SegmentedChoice";
import { Stepper } from "./Stepper";
import { inputClass } from "./ui";
import { lastDoneChoiceValues, lastDoneOn as lastDoneFor, type LastDoneChoice } from "../lib/lastDone";

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
  const [lastDoneChoice, setLastDoneChoice] = useState<LastDoneChoice>("now");
  const [pickedDate, setPickedDate] = useState(today);
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
    const lastDoneOn = item ? null : lastDoneFor(lastDoneChoice, today, pickedDate);
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
        <div className="flex flex-wrap items-end gap-x-3 gap-y-4">
          <Stepper label={copy.maintenance.every} value={every} min={1} max={MAX_MAINTENANCE_EVERY} onChange={setEvery} />
          <SegmentedChoice
            label={copy.maintenance.unit}
            name="unit"
            value={unit}
            options={maintenanceUnitValues.map((value) => ({ value, label: copy.maintenance.unitNames[value] }))}
            onChange={(value) => setUnit(value as MaintenanceUnit)}
          />
        </div>
        {!item && (
          <>
            <Field label={copy.maintenance.lastDoneLabel}>
              <select className={inputClass} value={lastDoneChoice} onChange={(event) => setLastDoneChoice(event.target.value as LastDoneChoice)}>
                {lastDoneChoiceValues.map((value) => (
                  <option key={value} value={value}>{copy.maintenance.lastDoneChoices[value]}</option>
                ))}
              </select>
            </Field>
            {lastDoneChoice === "date" && (
              <Field label={copy.maintenance.lastDoneDateLabel}>
                <input
                  className={inputClass}
                  type="date"
                  value={pickedDate}
                  max={today}
                  min={addDays(today, -YEAR_BACK_DAYS)}
                  onChange={(event) => setPickedDate(event.target.value)}
                />
              </Field>
            )}
          </>
        )}
        {item && <MaintenanceHistory itemId={item.id} today={today} onChanged={onChanged} />}
        {item && <ConfirmRemove pending={pending} onRemove={onRemove} />}
        <DialogActions pending={pending} error={error ?? serverError} onCancel={onClose} />
      </form>
    </Dialog>
  );
};
