import { useEffect, useId, useRef, useState } from "react";
import { copy } from "../copy";
import { longDate } from "../lib/maintenanceText";
import { trpc } from "../trpc";
import { Field } from "./Field";
import { inputClass, quietButton, secondaryButton } from "./ui";

type Props = { itemId: number; today: string; onChanged: () => void };

const SHOWN_FIRST = 3;

// The done dates of one item, behind one button so the dialog stays short. Marking done on an earlier day and removing a date both live here,
// so a mistake can always be fixed. Removing a date asks on its own row first, naming the date.
export const MaintenanceHistory = ({ itemId, today, onChanged }: Props) => {
  const utils = trpc.useUtils();
  const panelId = useId();
  const [open, setOpen] = useState(false);
  const [showAll, setShowAll] = useState(false);
  const [asking, setAsking] = useState<number | null>(null);
  const [date, setDate] = useState(today);
  const history = trpc.maintenance.history.useQuery({ id: itemId });
  const toggle = useRef<HTMLButtonElement>(null);
  const returnTo = useRef<number | null>(null);

  const changed = () => {
    void utils.maintenance.history.invalidate({ id: itemId });
    onChanged();
  };
  const mark = trpc.maintenance.markDone.useMutation({ onSuccess: changed });
  const undo = trpc.maintenance.undoDone.useMutation({ onSuccess: changed });
  const error = mark.error ?? undo.error;
  const markOnDate = () => mark.mutate({ id: itemId, doneOn: date, today });

  // After Keep it, focus returns to that row's Remove, so the keyboard does not lose its place.
  useEffect(() => {
    if (asking === null && returnTo.current !== null) document.getElementById(`remove-date-${returnTo.current}`)?.focus();
    returnTo.current = null;
  }, [asking]);

  const rows = history.data ?? [];
  const shown = showAll ? rows : rows.slice(0, SHOWN_FIRST);

  const remove = (doneId: number) => {
    setAsking(null);
    undo.mutate(
      { doneId },
      {
        onSuccess: () => toggle.current?.focus(),
        // The row has already closed its question, so focus goes back to the button that asked it.
        onError: () => window.requestAnimationFrame(() => document.getElementById(`remove-date-${doneId}`)?.focus()),
      },
    );
  };
  const keep = (doneId: number) => {
    returnTo.current = doneId;
    setAsking(null);
  };

  return (
    <section className="grid gap-2">
      <button
        ref={toggle}
        type="button"
        className={`${secondaryButton} flex w-full items-center justify-between text-left font-semibold`}
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((was) => !was)}
      >
        <span>{copy.maintenance.historyToggle(rows.length)}</span>
        <span aria-hidden className={`text-muted transition-transform ${open ? "rotate-180" : ""}`}>⌄</span>
      </button>
      {history.error && <p role="alert" className="text-late">{copy.maintenance.historyFailed}</p>}
      {error && <p role="alert" className="text-late">{error.message}</p>}
      <div id={panelId} hidden={!open} className="grid gap-3">
        {history.isLoading && <p role="status" className="text-muted">{copy.maintenance.loading}</p>}
        {history.data?.length === 0 && <p className="text-muted">{copy.maintenance.noHistory}</p>}
        {shown.length > 0 && (
          <ul className="grid">
            {shown.map((row) => (
              <li key={row.id} className="min-h-11 border-b border-line last:border-b-0">
                {asking === row.id ? (
                  <div role="group" aria-label={copy.maintenance.removeDateAsk(longDate(row.doneOn))} className="grid gap-1 py-2">
                    <p className="font-semibold">{copy.maintenance.removeDateAsk(longDate(row.doneOn))}</p>
                    <div className="flex gap-2">
                      <button type="button" className={secondaryButton} disabled={undo.isPending} onClick={() => remove(row.id)}>{copy.maintenance.confirmYes}</button>
                      <button type="button" className={quietButton} autoFocus onClick={() => keep(row.id)}>{copy.maintenance.keep}</button>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-center justify-between gap-2">
                    <span>{longDate(row.doneOn)}</span>
                    <button
                      id={`remove-date-${row.id}`}
                      type="button"
                      className={quietButton}
                      aria-label={copy.maintenance.removeDateLabel(longDate(row.doneOn))}
                      onClick={() => setAsking(row.id)}
                    >
                      {copy.maintenance.removeDate}
                    </button>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
        {!showAll && rows.length > SHOWN_FIRST && (
          <button type="button" className={`${quietButton} justify-self-start`} onClick={() => setShowAll(true)}>
            {copy.maintenance.historyShowAll(rows.length)}
          </button>
        )}
        <div className="flex items-end gap-3">
          <div className="min-w-0 flex-1">
            <Field label={copy.maintenance.markDoneOn}>
              <input className={inputClass} type="date" value={date} max={today} onChange={(event) => setDate(event.target.value)}
                onKeyDown={(event) => {
                  // Enter here marks the date; it must not save the item form around it.
                  if (event.key.toLowerCase() !== "enter") return;
                  event.preventDefault();
                  if (date !== "" && !mark.isPending) markOnDate();
                }}
              />
            </Field>
          </div>
          <button type="button" className={secondaryButton} disabled={mark.isPending || date === ""} onClick={markOnDate}>
            {copy.maintenance.markDone}
          </button>
        </div>
      </div>
    </section>
  );
};
