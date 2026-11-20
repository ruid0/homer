import { useEffect, useRef, useState } from "react";
import { compareMaintenance, dueOn, maintenanceStatus } from "@homer/shared";
import { copy } from "../copy";
import { pastDate } from "./maintenanceText";
import { trpc, type MaintenanceItem } from "../trpc";

// The flash lasts 1.4 s; the row stops being marked a little after, so it cannot replay if it moves between lists
// later.
const FLASH_FOR_MS = 1600;

type Undoable = { doneId: number; item: MaintenanceItem; lastDoneOn: string };

// The row as the list will show it once the save has come back, so Done feels instant.
const markedDone = (item: MaintenanceItem, today: string): MaintenanceItem => {
  const due = dueOn({ lastDoneOn: today, createdOn: item.createdOn }, item.every, item.unit);
  return { ...item, lastDoneOn: today, snoozedUntil: null, dueOn: due, ...maintenanceStatus(due, today) };
};

const toastMessage = ({ item, lastDoneOn }: Undoable, today: string): string =>
  copy.maintenance.doneToast(
    item.name,
    pastDate(dueOn({ lastDoneOn, createdOn: item.createdOn }, item.every, item.unit), today),
  );

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
  // Saves still on their way. The list is fetched again only when the last one is back, so an early answer cannot undo
  // a later row's move.
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
      if (context?.item) setUndoable({ doneId, item: context.item, lastDoneOn: lastDoneOn ?? today });
      onDone?.();
    },
    // A failure puts back that row only, and says why.
    onError: (error, { id }, context) => {
      const original = context?.item;
      if (original)
        utils.maintenance.list.setData({ today }, (rows) =>
          rows?.map((row) => (row.id === id ? original : row)).sort(compareMaintenance),
        );
      setFlashId((was) => (was === id ? null : was));
      setProblem(error.message);
    },
    onSettled: () => {
      saving.current -= 1;
      if (saving.current === 0) void refresh();
    },
  });
  const undo = trpc.maintenance.undoDone.useMutation({
    onError: (error) => setProblem(error.message),
    onSettled: refresh,
  });

  const finish = (item: MaintenanceItem) => {
    setProblem(undefined);
    setFlashId(item.id);
    markDone.mutate({ id: item.id, doneOn: today, today });
  };

  const takeBack = (doneId: number) => {
    setProblem(undefined);
    // The toast stays until the undo worked, so a failed undo can be tried again.
    undo.mutate({ doneId }, { onSuccess: () => setUndoable(null) });
  };

  const toast = undoable && {
    doneId: undoable.doneId,
    message: toastMessage(undoable, today),
    busy: undo.isPending,
  };

  // justDoneId: the row to flash, so a person sees where a done item went.
  return {
    finish,
    takeBack,
    toast,
    justDoneId: flashId,
    problem,
    busy: markDone.isPending,
    closeToast: () => setUndoable(null),
  };
};
