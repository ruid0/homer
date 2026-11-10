import { useState, type SubmitEvent } from "react";
import { MAX_ROUTINE_TARGET, updateRoutineItemInputSchema } from "@homer/shared";
import { copy } from "../copy";
import type { ReminderState } from "../lib/reminderText";
import type { RoutineRow } from "../trpc";
import { Dialog } from "./Dialog";
import { Field } from "./Field";
import { RoutineReminders } from "./RoutineReminders";
import { inputClass, primaryButton, quietButton, secondaryButton } from "./ui";

type Props = {
  // Null means adding a new row.
  row: RoutineRow | null;
  personId: number;
  state: ReminderState;
  pending: boolean;
  serverError?: string;
  canMoveUp: boolean;
  canMoveDown: boolean;
  onSave: (name: string, targetPerDay: number) => void;
  onMove: (direction: "up" | "down") => void;
  onRemove: () => void;
  onClose: () => void;
};

export const RoutineRowDialog = ({ row, personId, state, pending, serverError, canMoveUp, canMoveDown, onSave, onMove, onRemove, onClose }: Props) => {
  const [name, setName] = useState(row?.name ?? "");
  const [target, setTarget] = useState(String(row?.targetPerDay ?? 1));
  const [error, setError] = useState<string>();
  const [confirming, setConfirming] = useState(false);

  const submit = (event: SubmitEvent) => {
    event.preventDefault();
    const parsed = updateRoutineItemInputSchema.safeParse({ id: 0, name, targetPerDay: Number(target) });
    if (!parsed.success) {
      setError(parsed.error.issues.some((issue) => issue.path[0] === "name") ? copy.routine.blankName : copy.routine.badTarget);
      return;
    }
    setError(undefined);
    onSave(parsed.data.name, parsed.data.targetPerDay);
  };

  return (
    <Dialog title={row ? copy.routine.editRow(row.name) : copy.routine.addRow} onClose={onClose}>
      <form onSubmit={submit} className="grid gap-4">
        <Field label={copy.routine.rowName}>
          <input className={inputClass} value={name} onChange={(event) => setName(event.target.value)} autoFocus />
        </Field>
        <Field label={copy.routine.perDay}>
          <input
            className={inputClass}
            type="number"
            inputMode="numeric"
            min={1}
            max={MAX_ROUTINE_TARGET}
            value={target}
            onChange={(event) => setTarget(event.target.value)}
          />
        </Field>
        {(error ?? serverError) && <p role="alert" className="text-late">{error ?? serverError}</p>}
        {row && <RoutineReminders personId={personId} itemId={row.id} state={state} />}
        {row && (
          <div className="flex flex-wrap gap-2">
            <button type="button" className={secondaryButton} disabled={!canMoveUp || pending} onClick={() => onMove("up")}>
              {copy.routine.moveUp}
            </button>
            <button type="button" className={secondaryButton} disabled={!canMoveDown || pending} onClick={() => onMove("down")}>
              {copy.routine.moveDown}
            </button>
          </div>
        )}
        {row && !confirming && (
          <button type="button" className={`${quietButton} justify-self-start`} onClick={() => setConfirming(true)}>
            {copy.routine.remove}
          </button>
        )}
        {row && confirming && (
          <div className="grid gap-2" role="group" aria-label={copy.routine.remove}>
            <p>{copy.routine.confirmRemove}</p>
            <div className="flex gap-2">
              <button type="button" className={secondaryButton} disabled={pending} onClick={onRemove}>{copy.routine.confirmYes}</button>
              <button type="button" className={quietButton} onClick={() => setConfirming(false)}>{copy.routine.keep}</button>
            </div>
          </div>
        )}
        <div className="flex justify-end gap-3">
          <button type="button" className={secondaryButton} onClick={onClose}>{copy.common.cancel}</button>
          <button type="submit" className={primaryButton} disabled={pending}>{copy.common.save}</button>
        </div>
      </form>
    </Dialog>
  );
};
