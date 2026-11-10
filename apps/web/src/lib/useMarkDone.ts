import { useEffect, useState } from "react";
import { copy } from "../copy";
import { trpc, type MaintenanceItem } from "../trpc";

// The flash lasts 1.4 s; the row stops being marked a little after, so it cannot replay if it moves between lists later.
const FLASH_FOR_MS = 1600;

type Undoable = { doneId: number; itemId: number; message: string };

// Done today and Undo for an upkeep item, shared by the Upkeep page and the Home card.
export const useMarkDone = (today: string, onDone?: () => void) => {
  const utils = trpc.useUtils();
  const [undoable, setUndoable] = useState<Undoable | null>(null);
  const [problem, setProblem] = useState<string>();
  const [flashId, setFlashId] = useState<number | null>(null);

  useEffect(() => {
    if (flashId === null) return;
    const timer = window.setTimeout(() => setFlashId(null), FLASH_FOR_MS);
    return () => window.clearTimeout(timer);
  }, [flashId]);
  const refresh = () => utils.maintenance.list.invalidate();
  const markDone = trpc.maintenance.markDone.useMutation({ onError: (error) => setProblem(error.message), onSettled: refresh });
  const undo = trpc.maintenance.undoDone.useMutation({ onError: (error) => setProblem(error.message), onSettled: refresh });

  const finish = (item: MaintenanceItem) => {
    setProblem(undefined);
    markDone.mutate(
      { id: item.id, doneOn: today, today },
      {
        onSuccess: ({ doneId }) => {
          setUndoable({ doneId, itemId: item.id, message: copy.maintenance.doneToast(item.name) });
          setFlashId(item.id);
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

  // justDoneId: the row to flash, so a person sees where a done item went.
  return { finish, takeBack, undoable, justDoneId: flashId, problem, busy: markDone.isPending, closeToast: () => setUndoable(null) };
};
