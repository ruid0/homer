import { useId } from "react";
import { copy } from "../copy";
import { Toast } from "./Toast";
import { secondaryButton } from "./ui";
import type { useMarkDone } from "../lib/useMarkDone";

// The toast after Done: what was done and when it is next due, with Undo and the days it could have been done instead.
export const DoneToast = ({ done }: { done: ReturnType<typeof useMarkDone> }) => {
  const labelId = useId();
  const { toast } = done;
  if (!toast) return null;
  return (
    <Toast
      key={toast.doneId}
      message={toast.message}
      onClose={done.closeToast}
      action={{ label: copy.maintenance.undo, onClick: () => done.takeBack(toast.doneId), disabled: toast.busy }}
    >
      {toast.earlier.length > 0 && (
        <div role="group" aria-labelledby={labelId} className="grid gap-1">
          <span id={labelId} className="text-meta">{copy.maintenance.doneEarlier}</span>
          <div className="flex flex-wrap gap-2">
            {toast.earlier.map(({ daysAgo, label }) => (
              <button key={daysAgo} type="button" className={`${secondaryButton} border-on-primary`} disabled={toast.busy} onClick={() => done.doneEarlier(daysAgo)}>
                {label}
              </button>
            ))}
          </div>
        </div>
      )}
    </Toast>
  );
};
