import { useState } from "react";
import { EventCard } from "../components/EventCard";
import { EventEditor } from "../components/EventEditor";
import { TaskCard } from "../components/TaskCard";
import { TaskEditor } from "../components/TaskEditor";
import { inputClass, primaryButton, secondaryButton } from "../components/ui";
import { dayItems } from "../lib/dayItems";
import { useToday } from "../lib/useToday";
import { trpc, type ScheduleEvent, type ScheduleTask } from "../trpc";
import { copy } from "../copy";

type Editing = { kind: "task"; task?: ScheduleTask } | { kind: "event"; event?: ScheduleEvent } | null;

export const SchedulePage = () => {
  const utils = trpc.useUtils();
  const today = useToday();
  const [filter, setFilter] = useState("");
  const personId = filter === "" ? undefined : Number(filter);
  const [editing, setEditing] = useState<Editing>(null);

  const view = trpc.schedule.view.useQuery({ today, days: 1, personId });
  const people = trpc.people.list.useQuery();

  const refresh = () => utils.schedule.view.invalidate();
  const saved = () => {
    setEditing(null);
    return refresh();
  };
  const complete = trpc.tasks.complete.useMutation({ onSuccess: refresh });

  const todayView = view.data?.days[0];
  const todayItems = dayItems(todayView?.tasks ?? [], todayView?.events ?? []);
  const overdue = view.data?.overdue ?? [];
  const anytime = view.data?.undated ?? [];
  const empty = overdue.length === 0 && todayItems.length === 0 && anytime.length === 0;
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
      {view.data && empty && <p>{copy.schedule.empty}</p>}

      <Section heading={copy.schedule.overdue} count={overdue.length}>
        {overdue.map(taskCard)}
      </Section>
      <Section heading={copy.schedule.today} count={todayItems.length}>
        {todayItems.map((item) =>
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

const Section = ({ heading, count, children }: { heading: string; count: number; children: React.ReactNode }) =>
  count === 0 ? null : (
    <section className="mb-6">
      <h2 className="mb-3 text-xl font-semibold">{heading}</h2>
      <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{children}</ul>
    </section>
  );
