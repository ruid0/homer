import { copy } from "../copy";
import { Toast } from "./Toast";
import type { useMarkDone } from "../lib/useMarkDone";

// The toast after Done: what was done and when it is next due, with Undo.
export const DoneToast = ({ done }: { done: ReturnType<typeof useMarkDone> }) => {
  const { toast } = done;
  if (!toast) return null;
  return (
    <Toast
      key={toast.doneId}
      message={toast.message}
      onClose={done.closeToast}
      action={{ label: copy.maintenance.undo, onClick: () => done.takeBack(toast.doneId), disabled: toast.busy }}
    />
  );
};
