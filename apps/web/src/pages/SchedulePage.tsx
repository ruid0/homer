import { keepPreviousData } from "@tanstack/react-query";
import { PageHeader } from "../components/PageHeader";
import { useState } from "react";
import { EventEditor } from "../components/EventEditor";
import { EventRow, TaskRow } from "../components/ScheduleRows";
import { TaskEditor } from "../components/TaskEditor";
import { inputClass, primaryButton, secondaryButton, toggleButton } from "../components/ui";
import { dayHeading } from "../lib/dayHeading";
import { dayItems } from "../lib/dayItems";
import { useToday } from "../lib/useToday";
import { trpc, type ScheduleEvent, type ScheduleTask } from "../trpc";
import { copy } from "../copy";

type Mode = "today" | "week";

const DAYS_IN_WEEK = 7;

type Editing = { kind: "task"; task?: ScheduleTask } | { kind: "event"; event?: ScheduleEvent } | null;

export const SchedulePage = () => {
  const utils = trpc.useUtils();
  const today = useToday();
  const [filter, setFilter] = useState("");
  const personId = filter === "" ? undefined : Number(filter);
  const [mode, setMode] = useState<Mode>("today");
  const [editing, setEditing] = useState<Editing>(null);

  const view = trpc.schedule.view.useQuery(
    { today, days: mode === "week" ? DAYS_IN_WEEK : 1, personId },
    { placeholderData: keepPreviousData },
  );
  const people = trpc.people.list.useQuery();

  const refresh = () => utils.schedule.view.invalidate();
  const saved = () => {
    setEditing(null);
    return refresh();
  };
  const complete = trpc.tasks.complete.useMutation({ onSuccess: refresh });

  const overdue = view.data?.overdue ?? [];
  const anytime = view.data?.undated ?? [];
  const dayList = (view.data?.days ?? []).map((day) => ({
    date: day.date,
    items: dayItems(day.tasks, day.events),
  }));
  const empty = overdue.length === 0 && anytime.length === 0 && dayList.every((day) => day.items.length === 0);
  const actionError = editing ? undefined : complete.error?.message;
  const loaded = view.data !== undefined && !view.isPlaceholderData;
  const nothingForPerson = loaded && empty && personId !== undefined;
  const filteredName = (people.data ?? []).find((person) => person.id === personId)?.name ?? copy.schedule.thisPerson;

  const taskRow = (task: ScheduleTask) => (
    <TaskRow
      key={`task-${task.id}`}
      task={task}
      busy={complete.isPending}
      onDone={() => complete.mutate({ id: task.id, today })}
      onEdit={() => setEditing({ kind: "task", task })}
    />
  );

  return (
    <>
      <PageHeader
        title={copy.schedule.title}
        action={
          <div className="flex gap-3">
            <button type="button" className={secondaryButton} onClick={() => setEditing({ kind: "event" })}>
              {copy.schedule.addEvent}
            </button>
            <button type="button" className={primaryButton} onClick={() => setEditing({ kind: "task" })}>
              {copy.schedule.addTask}
            </button>
          </div>
        }
      />

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <div role="group" aria-label={copy.schedule.viewLabel} className="flex gap-3">
          <button type="button" className={toggleButton(mode === "today")} aria-pressed={mode === "today"} onClick={() => setMode("today")}>
            {copy.schedule.todayView}
          </button>
          <button type="button" className={toggleButton(mode === "week")} aria-pressed={mode === "week"} onClick={() => setMode("week")}>
            {copy.schedule.weekView}
          </button>
        </div>
        <div className="min-w-40 flex-1 sm:max-w-60">
          <select aria-label={copy.schedule.person} className={inputClass} value={filter} onChange={(event) => setFilter(event.target.value)}>
            <option value="">{copy.schedule.everyone}</option>
            {(people.data ?? []).map((person) => (
              <option key={person.id} value={person.id}>{person.name}</option>
            ))}
          </select>
        </div>
      </div>

      {view.isPending && <p role="status">{copy.schedule.loading}</p>}
      {view.error && <p role="alert">{copy.schedule.loadFailed}</p>}
      {actionError && <p role="alert" className="mb-4 text-late">{actionError}</p>}
      {loaded && empty && mode === "today" && personId === undefined && <p>{copy.schedule.empty}</p>}
      {nothingForPerson && (
        <div className="mb-6 grid justify-items-start gap-3">
          <p>{copy.schedule.nothingForPerson(filteredName)}</p>
          <button type="button" className={secondaryButton} onClick={() => setFilter("")}>
            {copy.schedule.showEveryone}
          </button>
        </div>
      )}

      <div className="grid items-start gap-4 lg:grid-cols-2">
        <Section heading={copy.schedule.overdue} count={overdue.length} wide>
          {overdue.map(taskRow)}
        </Section>
        {!nothingForPerson && dayList.map(({ date, items }) => (
          <Section
            key={date}
            heading={mode === "today" ? copy.schedule.today : dayHeading(date, today)}
            count={items.length}
            wide={mode === "today"}
            emptyText={mode === "week" ? copy.schedule.nothingThisDay : undefined}
          >
            {items.map((item) =>
              item.kind === "task" ? (
                taskRow(item.value)
              ) : (
                <EventRow
                  key={`event-${item.value.id}`}
                  event={item.value}
                  onEdit={() => setEditing({ kind: "event", event: item.value })}
                />
              ),
            )}
          </Section>
        ))}
        <Section heading={copy.schedule.anytime} count={anytime.length} wide>
          {anytime.map(taskRow)}
        </Section>
      </div>

      {editing?.kind === "task" && (
        <TaskEditor
          key={editing.task?.id ?? 0}
          task={editing.task}
          people={people.data ?? []}
          defaultPersonId={personId ?? null}
          onSaved={saved}
          onClose={() => setEditing(null)}
        />
      )}
      {editing?.kind === "event" && (
        <EventEditor
          key={editing.event?.id ?? 0}
          event={editing.event}
          people={people.data ?? []}
          defaultPersonId={personId ?? null}
          defaultDate={today}
          onSaved={saved}
          onClose={() => setEditing(null)}
        />
      )}
    </>
  );
};

type SectionProps = { heading: string; count: number; emptyText?: string; wide?: boolean; children: React.ReactNode };

const Section = ({ heading, count, emptyText, wide = false, children }: SectionProps) =>
  count === 0 && emptyText === undefined ? null : (
    <section className={`rounded-2xl border border-line bg-card px-5 pb-2 pt-4${wide ? " lg:col-span-2" : ""}`}>
      <h2 className="pb-2 text-section font-semibold">{heading}</h2>
      {count === 0 ? <p className="border-t border-line py-4 text-muted">{emptyText}</p> : <ul>{children}</ul>}
    </section>
  );
