import { TvRow } from "../components/tv/TvRow";
import { TvSection } from "../components/tv/TvSection";
import { TvWaiting } from "../components/tv/TvWaiting";
import { copy } from "../copy";
import { timeOfDay, useClock } from "../lib/clock";
import { dateParts } from "../lib/dayHeading";
import { dayItems } from "../lib/dayItems";
import { describeRunsOut } from "../lib/itemText";
import { localDate } from "../lib/localDate";
import { dueWords, needsDoing } from "../lib/maintenanceText";
import { runningOut } from "../lib/runningOut";
import { GAP_REM, HEADING_REM, MORE_REM, allocateRows, fit, leftToday, shortDay, upcomingRows } from "../lib/tv";
import { useRemHeight } from "../lib/useRemHeight";
import { useTvScreen } from "../lib/useTvScreen";
import { trpc, type ScheduleEvent, type ScheduleTask } from "../trpc";

const REFRESH_MS = 60_000;
const RETRY_MS = 10_000;
const CLOCK_CHECK_MS = 5_000;
// Today, tomorrow, then the five days after: a week out from today.
const DAYS_AHEAD = 7;

// The last good answer stays on screen while a refetch fails. The lists for one day are keyed by it, and are not kept
// across midnight: yesterday's rows must not read as today's, so they say "Loading." until the new day answers.
const refetch = {
  // After a failure it tries again sooner, so the screen recovers soon after HOMER comes back.
  refetchInterval: (query: { state: { status: string } }) => (query.state.status === "error" ? RETRY_MS : REFRESH_MS),
  retry: 2,
  // A TV browser may report its page as hidden while it is on screen, and must still refresh.
  refetchIntervalInBackground: true,
};

export const TvPage = () => {
  useTvScreen();
  const now = useClock(CLOCK_CHECK_MS);
  const today = localDate(now);
  const nowTime = timeOfDay(now);

  const view = trpc.schedule.view.useQuery({ today, days: DAYS_AHEAD }, refetch);
  const items = trpc.inventory.list.useQuery(undefined, refetch);
  const groceries = trpc.groceries.list.useQuery(undefined, refetch);
  const upkeep = trpc.maintenance.list.useQuery({ today }, refetch);
  const queries = [view, items, groceries, upkeep];

  const [dayOne, dayTwo, ...later] = view.data?.days ?? [];
  // A recurring task shows on each day it falls on, as on the Schedule page.
  const planned = (day: typeof dayOne) => ({
    date: day?.date ?? "",
    tasks: [...(day?.tasks ?? []), ...(day?.repeats ?? [])],
    events: day?.events ?? [],
  });
  const todayAll = leftToday(
    view.data?.overdue ?? [],
    dayItems(planned(dayOne).tasks, planned(dayOne).events),
    nowTime,
  );
  const tomorrowAll = dayItems(planned(dayTwo).tasks, planned(dayTwo).events);
  const upcomingAll = upcomingRows(later.map(planned));
  const anytimeAll = view.data?.undated ?? [];
  const dueAll = (upkeep.data ?? []).filter(needsDoing);
  const listedIds = new Set((groceries.data ?? []).flatMap((entry) => (entry.itemId === null ? [] : [entry.itemId])));
  const lowAll = runningOut(items.data ?? [], listedIds);

  // The screen cannot scroll, so each column hands out the rows it has room for, a section at a time in turn.
  const [gridRef, room] = useRemHeight();
  const groceryNote = groceries.data && groceries.data.length > 0 ? MORE_REM : 0;
  const [todayN = 0, tomorrowN = 0, upcomingN = 0] = allocateRows(room, [
    { count: todayAll.length, fixed: HEADING_REM },
    { count: tomorrowAll.length, fixed: HEADING_REM + GAP_REM },
    { count: upcomingAll.length, fixed: HEADING_REM + GAP_REM },
  ]);
  const [dueN = 0, anytimeN = 0, lowN = 0] = allocateRows(room, [
    { count: dueAll.length, fixed: HEADING_REM },
    { count: anytimeAll.length, fixed: HEADING_REM + GAP_REM },
    { count: lowAll.length, fixed: HEADING_REM + GAP_REM + groceryNote },
  ]);
  const todayRows = fit(todayAll, todayN);
  const tomorrowRows = fit(tomorrowAll, tomorrowN);
  const upcoming = fit(upcomingAll, upcomingN);
  const due = fit(dueAll, dueN);
  const anytime = fit(anytimeAll, anytimeN);
  const low = fit(lowAll, lowN);

  // The oldest answer on screen, so "Updated" never claims more than is true.
  const answered = queries.map((query) => query.dataUpdatedAt).filter((at) => at > 0);
  const updatedAt = answered.length === queries.length ? Math.min(...answered) : null;
  // Only a failed refetch is "showing the last update". A section that never loaded says so itself.
  const unreachable = queries.some((query) => query.isError && query.data !== undefined);
  const heading = dateParts(today);

  const eventRow = (event: ScheduleEvent) => (
    <TvRow key={`event-${event.id}`} when={event.time ?? ""} title={event.title} person={event.personName} />
  );
  const taskRow = (task: ScheduleTask, overdue: boolean) => (
    <TvRow
      key={`task-${task.id}`}
      when={task.dueTime ?? ""}
      title={task.title}
      person={task.personName}
      status={overdue ? { text: copy.schedule.overdueBy(task.daysOverdue), level: "late" } : undefined}
    />
  );

  const upcomingRow = ({ date, item }: (typeof upcoming.shown)[number]) =>
    item.kind === "event" ? (
      <TvRow
        key={`event-${item.value.id}`}
        when={shortDay(date)}
        wideWhen
        title={item.value.title}
        person={item.value.personName}
        after={item.value.time}
      />
    ) : (
      <TvRow
        key={`task-${item.value.id}`}
        when={shortDay(date)}
        wideWhen
        title={item.value.title}
        person={item.value.personName}
        after={item.value.dueTime}
      />
    );

  return (
    <main className="flex h-dvh flex-col gap-[2.5rem] overflow-hidden px-[5vw] py-[5vh]">
      <header className="flex items-end gap-[2rem]">
        <time dateTime={nowTime} className="text-clock font-semibold">
          {nowTime}
        </time>
        <h1 className="pb-[0.5rem]">
          <span className="block text-day font-semibold">{heading.weekday}</span>{" "}
          <span className="block text-answer text-muted">{heading.date}</span>
        </h1>
        <div className="ml-auto pb-[0.5rem] text-right text-answer">
          {unreachable && (
            <p role="alert" className="font-semibold text-late">
              {copy.tv.stale}
            </p>
          )}
          {/* Always there, so the header does not jump when the first answers arrive. */}
          <p className="min-h-[1.25rem] text-muted">
            {updatedAt === null ? "" : copy.tv.updated(timeOfDay(new Date(updatedAt)))}
          </p>
        </div>
      </header>

      <div ref={gridRef} className="grid min-h-0 flex-1 grid-cols-[minmax(0,3fr)_minmax(0,2fr)] gap-x-[4rem]">
        <div className="flex flex-col gap-[2rem]">
          <TvSection title={copy.home.today} more={todayRows.more}>
            <TvWaiting pending={view.isPending} failed={view.isError && view.data === undefined} />
            {view.data && todayRows.shown.length === 0 && (
              <p className="py-[0.5rem] text-answer text-muted">{copy.home.nothingPlanned}</p>
            )}
            <ul>
              {todayRows.shown.map((row) =>
                row.kind === "event" ? eventRow(row.value) : taskRow(row.value, row.kind === "overdue"),
              )}
            </ul>
          </TvSection>
          <TvSection title={copy.schedule.tomorrow} more={tomorrowRows.more}>
            <TvWaiting pending={view.isPending} failed={view.isError && view.data === undefined} />
            {view.data && tomorrowRows.shown.length === 0 && (
              <p className="py-[0.5rem] text-answer text-muted">{copy.tv.nothingTomorrow}</p>
            )}
            <ul>
              {tomorrowRows.shown.map((row) =>
                row.kind === "event" ? eventRow(row.value) : taskRow(row.value, false),
              )}
            </ul>
          </TvSection>
          <TvSection title={copy.tv.upcoming} more={upcoming.more}>
            <TvWaiting pending={view.isPending} failed={view.isError && view.data === undefined} />
            {view.data && upcoming.shown.length === 0 && (
              <p className="py-[0.5rem] text-answer text-muted">{copy.tv.nothingUpcoming}</p>
            )}
            <ul>{upcoming.shown.map(upcomingRow)}</ul>
          </TvSection>
        </div>

        <div className="flex flex-col gap-[2rem] border-l border-line pl-[4rem]">
          <TvSection title={copy.home.upkeep} more={due.more}>
            <TvWaiting pending={upkeep.isPending} failed={upkeep.isError && upkeep.data === undefined} />
            {upkeep.data && due.shown.length === 0 && (
              <p className="py-[0.5rem] text-answer text-muted">{copy.home.nothingDue}</p>
            )}
            <ul>
              {due.shown.map((job) => (
                <TvRow
                  key={job.id}
                  title={job.name}
                  status={{ text: dueWords(job), level: job.status === "soon" ? "warn" : "late" }}
                />
              ))}
            </ul>
          </TvSection>
          <TvSection title={copy.schedule.anytime} more={anytime.more}>
            <TvWaiting pending={view.isPending} failed={view.isError && view.data === undefined} />
            {view.data && anytime.shown.length === 0 && (
              <p className="py-[0.5rem] text-answer text-muted">{copy.tv.nothingAnytime}</p>
            )}
            <ul>
              {anytime.shown.map((task) => (
                <TvRow key={`task-${task.id}`} title={task.title} person={task.personName} />
              ))}
            </ul>
          </TvSection>
          <TvSection
            title={copy.home.runningOut}
            more={low.more}
            note={
              groceries.data &&
              groceries.data.length > 0 && (
                <p className="pt-[0.25rem] text-answer text-muted">{copy.tv.onGroceryList(groceries.data.length)}</p>
              )
            }
          >
            <TvWaiting pending={items.isPending} failed={items.isError && items.data === undefined} />
            {items.data && low.shown.length === 0 && (
              <p className="py-[0.5rem] text-answer text-muted">{copy.home.nothingRunningOut}</p>
            )}
            <ul>
              {low.shown.map(({ item }) => (
                <TvRow key={item.id} title={item.name} status={{ text: describeRunsOut(item), level: "warn" }} />
              ))}
            </ul>
          </TvSection>
        </div>
      </div>
    </main>
  );
};
