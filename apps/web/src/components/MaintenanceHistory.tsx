import { useState } from "react";
import { copy } from "../copy";
import { longDate } from "../lib/maintenanceText";
import { trpc } from "../trpc";
import { Field } from "./Field";
import { inputClass, quietButton, secondaryButton } from "./ui";

type Props = { itemId: number; today: string; onChanged: () => void };

// The done dates of one item. Marking done on an earlier day and removing a date both live here, so a mistake can always be fixed.
export const MaintenanceHistory = ({ itemId, today, onChanged }: Props) => {
  const utils = trpc.useUtils();
  const [date, setDate] = useState(today);
  const history = trpc.maintenance.history.useQuery({ id: itemId });

  const changed = () => {
    void utils.maintenance.history.invalidate({ id: itemId });
    onChanged();
  };
  const mark = trpc.maintenance.markDone.useMutation({ onSuccess: changed });
  const undo = trpc.maintenance.undoDone.useMutation({ onSuccess: changed });
  const error = mark.error ?? undo.error;
  const markOnDate = () => mark.mutate({ id: itemId, doneOn: date, today });

  return (
    <section className="grid gap-3 border-t border-line pt-4" aria-labelledby={`history-${itemId}`}>
      <h3 id={`history-${itemId}`} className="font-semibold">{copy.maintenance.historyTitle}</h3>
      {history.error && <p role="alert" className="text-late">{copy.maintenance.historyFailed}</p>}
      {history.data?.length === 0 && <p className="text-muted">{copy.maintenance.noHistory}</p>}
      {history.data && history.data.length > 0 && (
        <ul className="grid gap-1">
          {history.data.map((row) => (
            <li key={row.id} className="flex items-center justify-between gap-2">
              <span>{longDate(row.doneOn)}</span>
              <button
                type="button"
                className={quietButton}
                aria-label={copy.maintenance.removeDateLabel(longDate(row.doneOn))}
                disabled={undo.isPending}
                onClick={() => undo.mutate({ doneId: row.id })}
              >
                {copy.maintenance.removeDate}
              </button>
            </li>
          ))}
        </ul>
      )}
      <div className="flex items-end gap-3">
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
        <button
          type="button"
          className={secondaryButton}
          disabled={mark.isPending || date === ""}
          onClick={markOnDate}
        >
          {copy.maintenance.markDone}
        </button>
      </div>
      {error && <p role="alert" className="text-late">{error.message}</p>}
    </section>
  );
};
