import { useState } from "react";
import type { TaskInput } from "@homer/shared";
import { TaskCard } from "../components/TaskCard";
import { TaskDialog } from "../components/TaskDialog";
import { inputClass, primaryButton } from "../components/ui";
import { useToday } from "../lib/useToday";
import { trpc, type ScheduleTask } from "../trpc";
import { copy } from "../copy";

type Editing = ScheduleTask | "new" | null;

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

  const add = trpc.tasks.add.useMutation({ onSuccess: saved });
  const update = trpc.tasks.update.useMutation({ onSuccess: saved });
  const complete = trpc.tasks.complete.useMutation({ onSuccess: refresh });
  const remove = trpc.tasks.remove.useMutation({ onSuccess: saved });

  const save = (values: TaskInput) => {
    if (editing === "new") add.mutate(values);
    else if (editing) update.mutate({ ...values, id: editing.id });
  };

  const removeTask = (task: ScheduleTask) => {
    if (window.confirm(copy.taskForm.confirmRemove(task.title))) remove.mutate({ id: task.id });
  };

  const closeDialog = () => {
    add.reset();
    update.reset();
    remove.reset();
    setEditing(null);
  };

  const sections = [
    { heading: copy.schedule.overdue, tasks: view.data?.overdue ?? [] },
    { heading: copy.schedule.today, tasks: view.data?.days[0]?.tasks ?? [] },
    { heading: copy.schedule.anytime, tasks: view.data?.undated ?? [] },
  ];
  const empty = sections.every((section) => section.tasks.length === 0);
  const busy = complete.isPending;
  const actionError = editing ? undefined : complete.error?.message;
  const dialogError = (editing === "new" ? add.error : update.error)?.message ?? remove.error?.message;

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
        <button type="button" className={`${primaryButton} ml-auto`} onClick={() => setEditing("new")}>
          {copy.schedule.addTask}
        </button>
      </div>

      {view.isPending && <p role="status">{copy.schedule.loading}</p>}
      {view.error && <p role="alert">{copy.schedule.loadFailed}</p>}
      {actionError && <p role="alert" className="mb-4 text-red-700 dark:text-red-400">{actionError}</p>}
      {view.data && empty && <p>{copy.schedule.empty}</p>}

      {sections.map(({ heading, tasks }) =>
        tasks.length === 0 ? null : (
          <section key={heading} className="mb-6">
            <h2 className="mb-3 text-xl font-semibold">{heading}</h2>
            <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {tasks.map((task) => (
                <TaskCard
                  key={task.id}
                  task={task}
                  busy={busy}
                  onDone={() => complete.mutate({ id: task.id, today })}
                  onEdit={() => setEditing(task)}
                />
              ))}
            </ul>
          </section>
        ),
      )}

      {editing && (
        <TaskDialog
          key={editing === "new" ? "new" : editing.id}
          task={editing === "new" ? undefined : editing}
          people={people.data ?? []}
          defaultPersonId={personId ?? null}
          pending={add.isPending || update.isPending || remove.isPending}
          serverError={dialogError}
          onSave={save}
          onRemove={editing === "new" ? undefined : () => removeTask(editing)}
          onClose={closeDialog}
        />
      )}
    </>
  );
};
