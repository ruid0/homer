import { useState } from "react";
import { addDays, addMonths } from "@homer/shared";
import { copy } from "../copy";
import { pastDate } from "./maintenanceText";
import { trpc, type MaintenanceItem } from "../trpc";

type Choice = (typeof copy.maintenance.notTodayChoices)[number];

// The day a choice lands on, counted from today.
export const snoozeUntil = (choice: Choice, today: string): string => ("days" in choice ? addDays(today, choice.days) : addMonths(today, choice.months));

type Snoozed = { id: number; name: string; until: string };

// "Not today" for an upkeep job: which job is being asked about, the save, and the Undo toast. Shared by the Upkeep page and the Home card.
export const useSnooze = (today: string, onSnoozed?: () => void) => {
  const utils = trpc.useUtils();
  const [asking, setAsking] = useState<MaintenanceItem | null>(null);
  const [snoozed, setSnoozed] = useState<Snoozed | null>(null);
  const [problem, setProblem] = useState<string>();
  const save = trpc.maintenance.snooze.useMutation({ onError: (error) => setProblem(error.message) });
  const undo = trpc.maintenance.snooze.useMutation({ onError: (error) => setProblem(error.message) });
  const refresh = () => utils.maintenance.list.invalidate();

  const choose = (item: MaintenanceItem, until: string) => {
    setProblem(undefined);
    setAsking(null);
    save.mutate(
      { id: item.id, until, today },
      {
        onSuccess: async () => {
          setSnoozed({ id: item.id, name: item.name, until });
          await refresh();
          onSnoozed?.();
        },
        onError: () => void refresh(),
      },
    );
  };

  // The toast stays until the undo worked, so a failed undo can be tried again.
  const takeBack = () => {
    if (!snoozed) return;
    setProblem(undefined);
    undo.mutate({ id: snoozed.id, until: null, today }, { onSuccess: () => setSnoozed(null), onSettled: () => void refresh() });
  };

  const toast = snoozed && { message: copy.maintenance.snoozedToast(snoozed.name, pastDate(snoozed.until, today)), busy: undo.isPending };

  return {
    asking,
    ask: (item: MaintenanceItem) => {
      setProblem(undefined);
      setAsking(item);
    },
    cancel: () => setAsking(null),
    choose,
    takeBack,
    toast,
    problem,
    busy: save.isPending,
    closeToast: () => setSnoozed(null),
  };
};
