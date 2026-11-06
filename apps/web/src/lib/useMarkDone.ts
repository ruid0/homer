import { useState } from "react";
import { copy } from "../copy";
import { trpc, type MaintenanceItem } from "../trpc";

type Undoable = { doneId: number; message: string };

// Done today and Undo for an upkeep item, shared by the Upkeep page and the Home card.
export const useMarkDone = (today: string, onDone?: () => void) => {
  const utils = trpc.useUtils();
  const [undoable, setUndoable] = useState<Undoable | null>(null);
  const [problem, setProblem] = useState<string>();
  const refresh = () => utils.maintenance.list.invalidate();
  const markDone = trpc.maintenance.markDone.useMutation({ onError: (error) => setProblem(error.message), onSettled: refresh });
  const undo = trpc.maintenance.undoDone.useMutation({ onError: (error) => setProblem(error.message), onSettled: refresh });

  const finish = (item: MaintenanceItem) => {
    setProblem(undefined);
    markDone.mutate(
      { id: item.id, doneOn: today, today },
      {
        onSuccess: ({ doneId }) => {
          setUndoable({ doneId, message: copy.maintenance.doneToast(item.name) });
          onDone?.();
        },
      },
    );
  };

  const takeBack = (doneId: number) => {
    setProblem(undefined);
    // The toast stays until the undo worked, so a failed undo can be tried again.
    undo.mutate({ doneId }, { onSuccess: () => setUndoable(null) });
  };

  return { finish, takeBack, undoable, problem, busy: markDone.isPending, closeToast: () => setUndoable(null) };
};
