import { useEffect, useRef, useState } from "react";
import { addDays, compareMaintenance, dueOn, maintenanceStatus } from "@homer/shared";
import { copy } from "../copy";
import { pastDate } from "./maintenanceText";
import { trpc, type MaintenanceItem } from "../trpc";

// The flash lasts 1.4 s; the row stops being marked a little after, so it cannot replay if it moves between lists later.
const FLASH_FOR_MS = 1600;

type Undoable = { doneId: number; item: MaintenanceItem; doneOn: string; lastDoneOn: string };

// The row as the list will show it once the save has come back, so Done feels instant.
const markedDone = (item: MaintenanceItem, today: string): MaintenanceItem => {
  const due = dueOn({ lastDoneOn: today, createdOn: item.createdOn }, item.every, item.unit);
  return { ...item, lastDoneOn: today, snoozedUntil: null, dueOn: due, ...maintenanceStatus(due, today) };
};

const toastMessage = ({ item, doneOn, lastDoneOn }: Undoable, today: string): string => {
  const next = pastDate(dueOn({ lastDoneOn, createdOn: item.createdOn }, item.every, item.unit), today);
  return doneOn === today ? copy.maintenance.doneToast(item.name, next) : copy.maintenance.doneOnToast(item.name, pastDate(doneOn, today), next);
};

// Done today, "done earlier" and Undo for an upkeep item, shared by the Upkeep page and the Home card.
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
  // Saves still on their way. The list is fetched again only when the last one is back, so an early answer cannot undo a later row's move.
  const saving = useRef(0);
  const markDone = trpc.maintenance.markDone.useMutation({
    // The row moves to Later at once.
    onMutate: async ({ id }) => {
      saving.current += 1;
      await utils.maintenance.list.cancel({ today });
      const item = utils.maintenance.list.getData({ today })?.find((row) => row.id === id);
      utils.maintenance.list.setData({ today }, (rows) =>
        rows?.map((row) => (row.id === id ? markedDone(row, today) : row)).sort(compareMaintenance),
      );
      return { item };
    },
    // Runs for every save, not only the latest one, so each Done gets its toast.
    onSuccess: ({ doneId, lastDoneOn }, _input, context) => {
      if (context?.item) setUndoable({ doneId, item: context.item, doneOn: today, lastDoneOn: lastDoneOn ?? today });
      onDone?.();
    },
    // A failure puts back that row only, and says why.
    onError: (error, { id }, context) => {
      const original = context?.item;
      if (original) utils.maintenance.list.setData({ today }, (rows) => rows?.map((row) => (row.id === id ? original : row)).sort(compareMaintenance));
      setFlashId((was) => (was === id ? null : was));
      setProblem(error.message);
    },
    onSettled: () => {
      saving.current -= 1;
      if (saving.current === 0) void refresh();
    },
  });
  const redate = trpc.maintenance.redateDone.useMutation({ onError: (error) => setProblem(error.message), onSettled: refresh });
  const undo = trpc.maintenance.undoDone.useMutation({ onError: (error) => setProblem(error.message), onSettled: refresh });

  const finish = (item: MaintenanceItem) => {
    setProblem(undefined);
    setFlashId(item.id);
    markDone.mutate({ id: item.id, doneOn: today, today });
  };

  const doneEarlier = (daysAgo: number) => {
    if (!undoable) return;
    setProblem(undefined);
    const { doneId } = undoable;
    const doneOn = addDays(today, -daysAgo);
    redate.mutate(
      { doneId, doneOn, today },
      // Only while the toast is still for this done, so a newer Done keeps its own dates.
      { onSuccess: ({ lastDoneOn }) => setUndoable((was) => (was?.doneId === doneId ? { ...was, doneOn, lastDoneOn: lastDoneOn ?? doneOn } : was)) },
    );
  };

  const takeBack = (doneId: number) => {
    setProblem(undefined);
    // The toast stays until the undo worked, so a failed undo can be tried again.
    undo.mutate({ doneId }, { onSuccess: () => setUndoable(null) });
  };

  const toast = undoable && {
    doneId: undoable.doneId,
    message: toastMessage(undoable, today),
    // The choice already made is not offered again.
    earlier: copy.maintenance.doneEarlierChoices.filter(({ daysAgo }) => addDays(today, -daysAgo) !== undoable.doneOn),
    busy: redate.isPending || undo.isPending,
  };

  // justDoneId: the row to flash, so a person sees where a done item went.
  return { finish, takeBack, doneEarlier, toast, justDoneId: flashId, problem, busy: markDone.isPending, closeToast: () => setUndoable(null) };
};
