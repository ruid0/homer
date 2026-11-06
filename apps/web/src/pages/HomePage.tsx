import { keepPreviousData } from "@tanstack/react-query";
import { useRef, useState } from "react";
import { Link } from "react-router-dom";
import { UpkeepList } from "../components/UpkeepList";
import { Card } from "../components/Card";
import { RestockDialog } from "../components/RestockDialog";
import { RunningOutList } from "../components/RunningOutList";
import { ScrollCard } from "../components/ScrollCard";
import { TimelineList } from "../components/TimelineList";
import { Toast } from "../components/Toast";
import { timeOfDay, useClock } from "../lib/clock";
import { dateName, dayHeading } from "../lib/dayHeading";
import { dayItems } from "../lib/dayItems";
import { localDate } from "../lib/localDate";
import { needsDoing } from "../lib/maintenanceText";
import { runningOut } from "../lib/runningOut";
import { timelineRows } from "../lib/timeline";
import { useFocusNextDone } from "../lib/useFocusNextDone";
import { useMarkDone } from "../lib/useMarkDone";
import { trpc, type ListItem, type ScheduleTask } from "../trpc";
import { copy } from "../copy";

const REFRESH_MS = 60_000;
const MOST_JUMPED = 3;
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
  const upkeep = trpc.maintenance.list.useQuery({ today }, { ...refetch, placeholderData: keepPreviousData });
  const dueArea = useRef<HTMLDivElement>(null);
  const focusNextDone = useFocusNextDone(dueArea, dueArea);
  const upkeepDone = useMarkDone(today, focusNextDone);
  const { undoable } = upkeepDone;

  const complete = trpc.tasks.complete.useMutation({ onSuccess: () => utils.schedule.view.invalidate() });
  const restock = trpc.inventory.restock.useMutation();

  const day = view.data?.days[0];
  const rows = timelineRows(view.data?.overdue ?? [], dayItems(day?.tasks ?? [], day?.events ?? []), nowTime);
  const nothingPlanned = view.data !== undefined && rows.length === 1;
  const listedIds = new Set((groceries.data ?? []).flatMap((entry) => (entry.itemId === null ? [] : [entry.itemId])));
  const running = runningOut(items.data ?? [], listedIds);
  const due = (upkeep.data ?? []).filter((item) => needsDoing(item.status));

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

  // A few late jobs jump to the top of the single column. Many would push Today out of sight, so then the order stays.
  const lateCount = (upkeep.data ?? []).filter((item) => item.status === "overdue" || item.status === "due").length;
  const jumpFirst = lateCount >= 1 && lateCount <= MOST_JUMPED;

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-page font-semibold">{dateName(today)}</h1>

      {/* One column up to lg, two equal columns from lg, 3 to 2 from xl. One to three late jobs jump to the top of the single column. */}
      <div className="grid items-start gap-4 lg:grid-cols-2 xl:grid-cols-[3fr_2fr]">
        <ScrollCard title={copy.home.today} className="lg:row-span-2 lg:max-h-[calc(100dvh-8rem)]">
          {view.isPending && <p role="status">{copy.home.loading}</p>}
          {view.error && <p role="alert">{copy.home.timelineFailed}</p>}
          {view.data && <TimelineList rows={rows} nowTime={nowTime} busy={complete.isPending} onDone={finish} />}
          {nothingPlanned && <p className="border-t border-line py-4 text-muted">{copy.home.nothingPlanned}</p>}
          {complete.error && <p role="alert" className="py-2 text-late">{complete.error.message}</p>}
        </ScrollCard>

        <Card
          title={<Link to="/upkeep" className="inline-block py-2 underline decoration-line-strong underline-offset-4 hover:decoration-ink">{copy.home.upkeep}</Link>}
          className={jumpFirst ? "order-first lg:order-none" : ""}
        >
          {upkeep.isPending && <p role="status">{copy.home.loading}</p>}
          {upkeep.error && <p role="alert">{copy.home.upkeepFailed}</p>}
          <div ref={dueArea} tabIndex={-1} className="outline-none">
            {upkeep.data && <UpkeepList items={due} busy={upkeepDone.busy} justDoneId={upkeepDone.justDoneId} onDone={upkeepDone.finish} />}
          </div>
          {upkeep.data && due.length === 0 && <p className="border-t border-line py-4 text-muted">{copy.home.nothingDue}</p>}
          {upkeepDone.problem && <p role="alert" className="py-2 text-late">{upkeepDone.problem}</p>}
        </Card>

        <Card title={copy.home.runningOut}>
          {items.isPending && <p role="status">{copy.home.loading}</p>}
          {items.error && <p role="alert">{copy.home.runningOutFailed}</p>}
          {items.data && <RunningOutList rows={running} onBought={setRestocking} />}
          {items.data && running.length === 0 && <p className="border-t border-line py-4 text-muted">{copy.home.nothingRunningOut}</p>}
        </Card>
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
      {/* One toast at a time: the Undo toast wins, since it is the only way back. */}
      {message && !undoable && <Toast message={message} onClose={() => setMessage(null)} />}
      {undoable && (
        <Toast
          key={undoable.doneId}
          message={undoable.message}
          onClose={upkeepDone.closeToast}
          action={{ label: copy.maintenance.undo, onClick: () => upkeepDone.takeBack(undoable.doneId) }}
        />
      )}
    </div>
  );
};
