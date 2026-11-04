import { keepPreviousData } from "@tanstack/react-query";
import { useState } from "react";
import { RestockDialog } from "../components/RestockDialog";
import { RunningOutList } from "../components/RunningOutList";
import { ScrollCard } from "../components/ScrollCard";
import { TimelineList } from "../components/TimelineList";
import { Toast } from "../components/Toast";
import { timeOfDay, useClock } from "../lib/clock";
import { dateName, dayHeading } from "../lib/dayHeading";
import { dayItems } from "../lib/dayItems";
import { localDate } from "../lib/localDate";
import { runningOut } from "../lib/runningOut";
import { timelineRows } from "../lib/timeline";
import { trpc, type ListItem, type ScheduleTask } from "../trpc";
import { copy } from "../copy";

const REFRESH_MS = 60_000;
const refetch = { refetchInterval: REFRESH_MS };

export const HomePage = () => {
  const utils = trpc.useUtils();
  const now = useClock();
  const today = localDate(now);
  const nowTime = timeOfDay(now);
  const [restocking, setRestocking] = useState<ListItem | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  // Keep the old day on screen while the new day loads, so midnight on a wall screen does not flash.
  const view = trpc.schedule.view.useQuery({ today, days: 1 }, { ...refetch, placeholderData: keepPreviousData });
  const items = trpc.inventory.list.useQuery(undefined, refetch);
  const groceries = trpc.groceries.list.useQuery(undefined, refetch);

  const complete = trpc.tasks.complete.useMutation({ onSuccess: () => utils.schedule.view.invalidate() });
  const restock = trpc.inventory.restock.useMutation();

  const day = view.data?.days[0];
  const rows = timelineRows(view.data?.overdue ?? [], dayItems(day?.tasks ?? [], day?.events ?? []), nowTime);
  const nothingPlanned = view.data !== undefined && rows.length === 1;
  const listedIds = new Set((groceries.data ?? []).flatMap((entry) => (entry.itemId === null ? [] : [entry.itemId])));
  const running = runningOut(items.data ?? [], listedIds);

  const finish = (task: ScheduleTask) =>
    complete.mutate(
      { id: task.id, today },
      {
        onSuccess: ({ next }) =>
          setMessage(
            next?.dueDate ? copy.home.taskDoneNext(task.title, dayHeading(next.dueDate, today)) : copy.home.taskDone(task.title),
          ),
      },
    );
  const saveRestock = (item: ListItem, quantity: number) =>
    restock.mutate(
      { itemId: item.id, quantity },
      {
        onSuccess: () => {
          setRestocking(null);
          setMessage(copy.home.restocked(item.name, quantity));
          return Promise.all([utils.inventory.list.invalidate(), utils.groceries.list.invalidate()]);
        },
      },
    );
  const closeRestock = () => {
    restock.reset();
    setRestocking(null);
  };

  return (
    <div className="flex flex-col gap-4 md:h-[calc(100dvh-3rem)]">
      <h1 className="text-page font-semibold">{dateName(today)}</h1>

      <div className="grid min-h-0 flex-1 gap-4 md:grid-cols-[3fr_2fr] md:grid-rows-[minmax(0,1fr)]">
        <ScrollCard title={copy.home.yourDay} className="max-h-[60dvh] md:max-h-none">
          {view.isPending && <p role="status">{copy.home.loading}</p>}
          {view.error && <p role="alert">{copy.home.timelineFailed}</p>}
          {view.data && <TimelineList rows={rows} nowTime={nowTime} busy={complete.isPending} onDone={finish} />}
          {nothingPlanned && <p className="border-t border-line py-4 text-muted">{copy.home.nothingPlanned}</p>}
          {complete.error && <p role="alert" className="py-2 text-late">{complete.error.message}</p>}
        </ScrollCard>

        <ScrollCard title={copy.home.runningOut} className="max-h-[50dvh] md:max-h-none">
          {items.isPending && <p role="status">{copy.home.loading}</p>}
          {items.error && <p role="alert">{copy.home.runningOutFailed}</p>}
          {items.data && <RunningOutList rows={running} onBought={setRestocking} />}
          {items.data && running.length === 0 && (
            <p className="border-t border-line py-4 text-muted">{copy.home.nothingRunningOut}</p>
          )}
        </ScrollCard>
      </div>

      {restocking && (
        <RestockDialog
          name={restocking.name}
          unit={restocking.unit}
          initialQuantity={restocking.usualRestock ?? 1}
          pending={restock.isPending}
          serverError={restock.error?.message}
          onSave={(quantity) => saveRestock(restocking, quantity)}
          onClose={closeRestock}
        />
      )}
      {message && <Toast message={message} onClose={() => setMessage(null)} />}
    </div>
  );
};
