import { useState, type SubmitEvent } from "react";
import {
  MAX_MAINTENANCE_EVERY,
  MAX_MAINTENANCE_NAME,
  addDays,
  maintenanceUnitValues,
  type MaintenanceUnit,
} from "@homer/shared";
import { copy } from "../copy";
import type { MaintenanceItem } from "../trpc";
import { Dialog } from "./Dialog";
import { Field } from "./Field";
import { ConfirmRemove } from "./ConfirmRemove";
import { MaintenanceHistory } from "./MaintenanceHistory";
import { MaintenanceSuggestions, suggestionCycle, type Suggestion } from "./MaintenanceSuggestions";
import { DialogActions } from "./DialogActions";
import { SegmentedChoice } from "./SegmentedChoice";
import { Stepper } from "./Stepper";
import { inputClass, secondaryButton } from "./ui";
import { isLate } from "../lib/maintenanceText";
import { lastDoneChoiceValues, lastDoneOn as lastDoneFor, type LastDoneChoice } from "../lib/lastDone";

export type MaintenanceForm = { name: string; every: number; unit: MaintenanceUnit; lastDoneOn: string | null };

type Props = {
  // Null means adding a new item.
  item: MaintenanceItem | null;
  // A suggestion to start from when adding, from the empty page.
  start?: Suggestion | null;
  today: string;
  // Names already on the list are left out of the suggestions.
  takenNames: string[];
  pending: boolean;
  serverError?: string;
  onSave: (form: MaintenanceForm) => void;
  onRemove: () => void;
  onChanged: () => void;
  // Put the job off. Only a job that is due or overdue can be put off, so only those get the button.
  onSnooze?: () => void;
  onClose: () => void;
};

const YEAR_BACK_DAYS = 365;
const DEFAULT_UNIT: MaintenanceUnit = "months";

export const MaintenanceDialog = ({
  item,
  start = null,
  today,
  takenNames,
  pending,
  serverError,
  onSave,
  onRemove,
  onChanged,
  onSnooze,
  onClose,
}: Props) => {
  const started = start ? suggestionCycle(start) : null;
  const [name, setName] = useState(item?.name ?? start?.name ?? "");
  const [every, setEvery] = useState(String(item?.every ?? started?.every ?? 3));
  const [unit, setUnit] = useState<MaintenanceUnit>(item?.unit ?? started?.unit ?? DEFAULT_UNIT);
  const [lastDoneChoice, setLastDoneChoice] = useState<LastDoneChoice>("now");
  const [pickedDate, setPickedDate] = useState(today);
  const [error, setError] = useState<string>();
  // Not today closes this dialog, so it waits until nothing in the form has been changed.
  const changed =
    item !== undefined && item !== null && (name !== item.name || Number(every) !== item.every || unit !== item.unit);

  const pick = (suggestion: Suggestion) => {
    const cycle = suggestionCycle(suggestion);
    setName(suggestion.name);
    setEvery(String(cycle.every));
    setUnit(cycle.unit);
    setError(undefined);
  };

  const submit = (event: SubmitEvent) => {
    event.preventDefault();
    const count = Number(every);
    if (name.trim() === "") return setError(copy.maintenance.blankName);
    if (!Number.isInteger(count) || count < 1 || count > MAX_MAINTENANCE_EVERY)
      return setError(copy.maintenance.badEvery);
    const lastDoneOn = item ? null : lastDoneFor(lastDoneChoice, today, pickedDate);
    if (lastDoneOn !== null && (lastDoneOn > today || lastDoneOn < addDays(today, -YEAR_BACK_DAYS)))
      return setError(copy.maintenance.badDate);
    setError(undefined);
    onSave({ name: name.trim(), every: count, unit, lastDoneOn });
  };

  return (
    <Dialog title={item ? copy.maintenance.editTitle(item.name) : copy.maintenance.addTitle} onClose={onClose}>
      <form onSubmit={submit} noValidate className="grid gap-4">
        {!item && <MaintenanceSuggestions takenNames={takenNames} selectedName={name} onPick={pick} />}
        <Field label={copy.maintenance.name}>
          <input
            className={inputClass}
            value={name}
            maxLength={MAX_MAINTENANCE_NAME}
            onChange={(event) => setName(event.target.value)}
            autoFocus
          />
        </Field>
        <div className="flex flex-wrap items-end gap-x-3 gap-y-4">
          <Stepper
            label={copy.maintenance.every}
            value={every}
            min={1}
            max={MAX_MAINTENANCE_EVERY}
            onChange={setEvery}
          />
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
              <select
                className={inputClass}
                value={lastDoneChoice}
                onChange={(event) => setLastDoneChoice(event.target.value as LastDoneChoice)}
              >
                {lastDoneChoiceValues.map((value) => (
                  <option key={value} value={value}>
                    {copy.maintenance.lastDoneChoices[value]}
                  </option>
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
        {item && onSnooze && isLate(item.status) && !changed && (
          <div className="grid justify-items-start gap-1">
            <button type="button" className={secondaryButton} disabled={pending} onClick={onSnooze}>
              {copy.maintenance.notToday}
            </button>
            <p className="text-meta text-muted">{copy.maintenance.notTodayHint}</p>
          </div>
        )}
        {item && <MaintenanceHistory itemId={item.id} today={today} onChanged={onChanged} />}
        {item && <ConfirmRemove pending={pending} onRemove={onRemove} />}
        <DialogActions pending={pending} error={error ?? serverError} onCancel={onClose} />
      </form>
    </Dialog>
  );
};
