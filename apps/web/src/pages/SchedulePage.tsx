import { keepPreviousData } from "@tanstack/react-query";
import { useState } from "react";
import { EventCard } from "../components/EventCard";
import { EventEditor } from "../components/EventEditor";
import { TaskCard } from "../components/TaskCard";
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

  const taskCard = (task: ScheduleTask) => (
    <TaskCard
      key={`task-${task.id}`}
      task={task}
      busy={complete.isPending}
      onDone={() => complete.mutate({ id: task.id, today })}
      onEdit={() => setEditing({ kind: "task", task })}
    />
  );

  return (
    <>
      <h1 className="mb-4 text-2xl font-semibold">{copy.schedule.title}</h1>

      <div role="group" aria-label={copy.schedule.viewLabel} className="mb-4 flex gap-3">
        <button type="button" className={toggleButton(mode === "today")} aria-pressed={mode === "today"} onClick={() => setMode("today")}>
          {copy.schedule.todayView}
        </button>
        <button type="button" className={toggleButton(mode === "week")} aria-pressed={mode === "week"} onClick={() => setMode("week")}>
          {copy.schedule.weekView}
        </button>
      </div>

      <div className="mb-4 flex flex-wrap items-end gap-3">
        <label className="grid gap-1">
          <span>{copy.schedule.person}</span>
          <select className={inputClass} value={filter} onChange={(event) => setFilter(event.target.value)}>
            <option value="">{copy.schedule.everyone}</option>
            {(people.data ?? []).map((person) => (
              <option key={person.id} value={person.id}>{person.name}</option>
            ))}
          </select>
        </label>
        <div className="ml-auto flex flex-wrap gap-3">
          <button type="button" className={secondaryButton} onClick={() => setEditing({ kind: "event" })}>
            {copy.schedule.addEvent}
          </button>
          <button type="button" className={primaryButton} onClick={() => setEditing({ kind: "task" })}>
            {copy.schedule.addTask}
          </button>
        </div>
      </div>

      {view.isPending && <p role="status">{copy.schedule.loading}</p>}
      {view.error && <p role="alert">{copy.schedule.loadFailed}</p>}
      {actionError && <p role="alert" className="mb-4 text-red-700 dark:text-red-400">{actionError}</p>}
      {view.data && empty && mode === "today" && <p>{copy.schedule.empty}</p>}

      <Section heading={copy.schedule.overdue} count={overdue.length}>
        {overdue.map(taskCard)}
      </Section>
      {dayList.map(({ date, items }) => (
        <Section
          key={date}
          heading={mode === "today" ? copy.schedule.today : dayHeading(date, today)}
          count={items.length}
          emptyText={mode === "week" ? copy.schedule.nothingThisDay : undefined}
        >
          {items.map((item) =>
            item.kind === "task" ? (
              taskCard(item.value)
            ) : (
              <EventCard
                key={`event-${item.value.id}`}
                event={item.value}
                onEdit={() => setEditing({ kind: "event", event: item.value })}
              />
            ),
          )}
        </Section>
      ))}
      <Section heading={copy.schedule.anytime} count={anytime.length}>
        {anytime.map(taskCard)}
      </Section>

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
          defaultDate={today}
          onSaved={saved}
          onClose={() => setEditing(null)}
        />
      )}
    </>
  );
};

type SectionProps = { heading: string; count: number; emptyText?: string; children: React.ReactNode };

const Section = ({ heading, count, emptyText, children }: SectionProps) =>
  count === 0 && emptyText === undefined ? null : (
    <section className="mb-6">
      <h2 className="mb-3 text-xl font-semibold">{heading}</h2>
      {count === 0 ? (
        <p className="text-stone-600 dark:text-stone-400">{emptyText}</p>
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{children}</ul>
      )}
    </section>
  );
