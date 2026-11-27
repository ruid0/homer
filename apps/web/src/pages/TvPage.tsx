import { TvRow } from "../components/tv/TvRow";
import { TvSection } from "../components/tv/TvSection";
import { TvWaiting } from "../components/tv/TvWaiting";
import { copy } from "../copy";
import { timeOfDay, useClock } from "../lib/clock";
import { dateParts } from "../lib/dayHeading";
import { dayItems } from "../lib/dayItems";
import { describeRunsOut, quantityText } from "../lib/itemText";
import { localDate } from "../lib/localDate";
import { dueWords, needsDoing } from "../lib/maintenanceText";
import { runningOut } from "../lib/runningOut";
import {
  GAP_REM,
  HEADING_REM,
  allocateRows,
  dayLines,
  fit,
  leftToday,
  planDays,
  shortDay,
  upcomingRows,
} from "../lib/tv";
import { useReloadOnNewBuild } from "../lib/useReloadOnNewBuild";
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
  useReloadOnNewBuild();
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
  const buyAll = groceries.data ?? [];

  // The screen cannot scroll, so each column hands out the rows it has room for. Column one is Today, then Tomorrow, then
  // Upcoming, which gives way first: its rows turn into a line a day, then into its heading and a count, then into nothing.
  const [gridRef, room] = useRemHeight();
  const upcomingDays = dayLines(upcomingAll);
  const plan = planDays(room, {
    today: todayAll.length,
    tomorrow: tomorrowAll.length,
    upcomingRows: upcomingAll.length,
    upcomingDays: upcomingDays.length,
  });
  const [lowN = 0, buyN = 0] = allocateRows(room, [
    { count: lowAll.length, fixed: HEADING_REM },
    { count: buyAll.length, fixed: HEADING_REM + GAP_REM },
  ]);
  const [dueN = 0, anytimeN = 0] = allocateRows(room, [
    { count: dueAll.length, fixed: HEADING_REM },
    { count: anytimeAll.length, fixed: HEADING_REM + GAP_REM },
  ]);
  const todayRows = fit(todayAll, plan.today);
  const tomorrowRows = fit(tomorrowAll, plan.tomorrow);
  const upcomingFull = fit(upcomingAll, plan.view === "rows" ? plan.upcoming : 0);
  const upcomingLines = fit(upcomingDays, plan.view === "lines" ? plan.upcoming : 0);
  // A line a day hides whole days, so what it leaves out is counted in items, as the rows do.
  const upcomingMore =
    plan.view === "lines"
      ? upcomingAll.length - upcomingLines.shown.reduce((sum, line) => sum + line.count, 0)
      : upcomingFull.more;
  const due = fit(dueAll, dueN);
  const anytime = fit(anytimeAll, anytimeN);
  const low = fit(lowAll, lowN);
  const buy = fit(buyAll, buyN);

  // The oldest answer on screen, so "Updated" never claims more than is true.
  const answered = queries.map((query) => query.dataUpdatedAt).filter((at) => at > 0);
  const updatedAt = answered.length === queries.length ? Math.min(...answered) : null;
  // Only a failed refetch is "showing the last update". A section that never loaded says so itself.
  const unreachable = queries.some((query) => query.isError && query.data !== undefined);
  const heading = dateParts(today);

  // What stands in the first column: the time, or the state in words when there is no time.
  const eventRow = (event: ScheduleEvent) => (
    <TvRow
      key={`event-${event.id}`}
      lead={{ text: event.time ?? copy.tv.allDay }}
      title={event.title}
      person={event.personName}
    />
  );
  const taskRow = (task: ScheduleTask, withoutTime: string, overdue: boolean) => (
    <TvRow
      key={`task-${task.id}`}
      lead={
        overdue
          ? { text: copy.schedule.overdueBy(task.daysOverdue), level: "late" }
          : { text: task.dueTime ?? withoutTime }
      }
      title={task.title}
      person={task.personName}
    />
  );

  const upcomingRow = (
    { date, item }: (typeof upcomingFull.shown)[number],
    at: number,
    shown: typeof upcomingFull.shown,
  ) => {
    // The day is named once, on its first row.
    const lead = { text: shown[at - 1]?.date === date ? "" : shortDay(date), level: "day" as const };
    return (
      <TvRow
        key={`${date}-${item.kind}-${item.value.id}`}
        lead={lead}
        title={item.value.title}
        person={item.value.personName}
        after={item.kind === "event" ? item.value.time : item.value.dueTime}
      />
    );
  };
  // A line stands for a whole day, so it shows the first item and how many more there are, without the person.
  const upcomingLine = ({ date, item, count }: (typeof upcomingLines.shown)[number]) => (
    <TvRow
      key={date}
      lead={{ text: shortDay(date), level: "day" }}
      title={item.value.title}
      after={count > 1 ? copy.tv.more(count - 1) : item.kind === "event" ? item.value.time : item.value.dueTime}
    />
  );

  const failed = (query: { isError: boolean; data: unknown }) => query.isError && query.data === undefined;

  return (
    <main className="flex h-dvh flex-col gap-[1.5rem] overflow-hidden px-[5vw] py-[5vh]">
      <header className="flex items-end gap-[2rem]">
        <time dateTime={nowTime} className="text-[4.5rem] leading-none font-semibold">
          {nowTime}
        </time>
        <h1 className="pb-[0.25rem]">
          <span className="block text-[2rem] leading-[2.5rem] font-semibold">{heading.weekday}</span>{" "}
          <span className="block text-answer text-muted">{heading.date}</span>
        </h1>
        <div className="ml-auto pb-[0.25rem] text-right text-answer">
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

      <div
        ref={gridRef}
        className="grid min-h-0 flex-1 grid-cols-[minmax(0,1.45fr)_minmax(0,1fr)_minmax(0,1fr)] gap-x-[2.5rem]"
      >
        <div className="flex flex-col gap-[2rem]">
          <TvSection title={copy.home.today} more={todayRows.more}>
            <TvWaiting pending={view.isPending} failed={failed(view)} />
            {view.data && todayRows.shown.length === 0 && (
              <p className="py-[0.5rem] text-answer text-muted">{copy.home.nothingPlanned}</p>
            )}
            <ul>
              {todayRows.shown.map((row) =>
                row.kind === "event"
                  ? eventRow(row.value)
                  : taskRow(row.value, copy.tv.dueToday, row.kind === "overdue"),
              )}
            </ul>
          </TvSection>
          <TvSection title={copy.schedule.tomorrow} more={tomorrowRows.more}>
            <TvWaiting pending={view.isPending} failed={failed(view)} />
            {view.data && tomorrowRows.shown.length === 0 && (
              <p className="py-[0.5rem] text-answer text-muted">{copy.tv.nothingTomorrow}</p>
            )}
            <ul>
              {tomorrowRows.shown.map((row) =>
                row.kind === "event" ? eventRow(row.value) : taskRow(row.value, copy.schedule.anytime, false),
              )}
            </ul>
          </TvSection>
          {plan.view !== "hidden" && (
            <TvSection
              title={copy.tv.upcoming}
              more={upcomingMore}
              count={plan.view === "count" ? copy.tv.more(upcomingAll.length) : undefined}
            >
              <TvWaiting pending={view.isPending} failed={failed(view)} />
              {view.data && upcomingAll.length === 0 && (
                <p className="py-[0.5rem] text-answer text-muted">{copy.tv.nothingUpcoming}</p>
              )}
              <ul>
                {upcomingFull.shown.map(upcomingRow)}
                {upcomingLines.shown.map(upcomingLine)}
              </ul>
            </TvSection>
          )}
        </div>

        <div className="flex flex-col gap-[2rem] border-l border-line pl-[2.5rem]">
          <TvSection title={copy.home.runningOut} more={low.more}>
            <TvWaiting pending={items.isPending} failed={failed(items)} />
            {items.data && low.shown.length === 0 && (
              <p className="py-[0.5rem] text-answer text-muted">{copy.home.nothingRunningOut}</p>
            )}
            <ul>
              {low.shown.map(({ item }) => (
                <TvRow key={item.id} title={item.name} status={{ text: describeRunsOut(item), level: "warn" }} />
              ))}
            </ul>
          </TvSection>
          <TvSection
            title={copy.tv.groceries}
            more={buy.more}
            count={groceries.data && buyAll.length > 0 ? copy.tv.toBuy(buyAll.length) : undefined}
          >
            <TvWaiting pending={groceries.isPending} failed={failed(groceries)} />
            {groceries.data && buy.shown.length === 0 && (
              <p className="py-[0.5rem] text-answer text-muted">{copy.tv.nothingToBuy}</p>
            )}
            <ul>
              {buy.shown.map((entry) => (
                <TvRow
                  key={entry.id}
                  title={entry.text}
                  after={
                    entry.quantity === null
                      ? null
                      : [quantityText(entry.quantity), entry.unit].filter(Boolean).join(" ")
                  }
                />
              ))}
            </ul>
          </TvSection>
        </div>

        <div className="flex flex-col gap-[2rem] border-l border-line pl-[2.5rem]">
          <TvSection title={copy.home.upkeep} more={due.more}>
            <TvWaiting pending={upkeep.isPending} failed={failed(upkeep)} />
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
            <TvWaiting pending={view.isPending} failed={failed(view)} />
            {view.data && anytime.shown.length === 0 && (
              <p className="py-[0.5rem] text-answer text-muted">{copy.tv.nothingAnytime}</p>
            )}
            <ul>
              {anytime.shown.map((task) => (
                <TvRow key={`task-${task.id}`} title={task.title} person={task.personName} />
              ))}
            </ul>
          </TvSection>
        </div>
      </div>
    </main>
  );
};
