import { useState, type ReactNode, type SubmitEvent } from "react";
import { repeatValues, taskInputSchema, type TaskInput } from "@homer/shared";
import type { ListPerson, ScheduleTask } from "../trpc";
import { Dialog } from "./Dialog";
import { inputClass, primaryButton, secondaryButton } from "./ui";
import { copy } from "../copy";

type Props = {
  task?: ScheduleTask;
  people: readonly ListPerson[];
  defaultPersonId: number | null;
  pending: boolean;
  serverError?: string;
  onSave: (values: TaskInput) => void;
  onRemove?: () => void;
  onClose: () => void;
};

const orNull = (text: string) => (text === "" ? null : text);

export const TaskDialog = ({ task, people, defaultPersonId, pending, serverError, onSave, onRemove, onClose }: Props) => {
  const [title, setTitle] = useState(task?.title ?? "");
  const [dueDate, setDueDate] = useState(task?.dueDate ?? "");
  const [dueTime, setDueTime] = useState(task?.dueTime ?? "");
  const [repeat, setRepeat] = useState<string>(task?.repeat ?? "");
  const [personId, setPersonId] = useState(String(task ? (task.personId ?? "") : (defaultPersonId ?? "")));
  const [error, setError] = useState<string>();

  const submit = (event: SubmitEvent) => {
    event.preventDefault();
    const parsed = taskInputSchema.safeParse({
      title,
      dueDate: orNull(dueDate),
      dueTime: orNull(dueTime),
      repeat: orNull(repeat),
      personId: personId === "" ? null : Number(personId),
    });
    if (parsed.success) {
      setError(undefined);
      return onSave(parsed.data);
    }
    const [issue] = parsed.error.issues;
    setError(issue?.path[0] === "title" ? copy.taskForm.blankTitle : issue?.message);
  };

  return (
    <Dialog title={task ? copy.taskForm.editTitle(task.title) : copy.taskForm.addTitle} onClose={onClose}>
      <form onSubmit={submit} className="grid gap-4">
        <Field label={copy.taskForm.title}>
          <input className={inputClass} value={title} onChange={(e) => setTitle(e.target.value)} autoFocus />
        </Field>
        <Field label={copy.taskForm.dueDate}>
          <input className={inputClass} type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
        </Field>
        <Field label={copy.taskForm.dueTime}>
          <input className={inputClass} type="time" value={dueTime} onChange={(e) => setDueTime(e.target.value)} />
        </Field>
        <Field label={copy.taskForm.repeat}>
          <select className={inputClass} value={repeat} onChange={(e) => setRepeat(e.target.value)}>
            <option value="">{copy.taskForm.noRepeat}</option>
            {repeatValues.map((value) => (
              <option key={value} value={value}>{copy.taskForm.repeatOptions[value]}</option>
            ))}
          </select>
        </Field>
        <Field label={copy.taskForm.person}>
          <select className={inputClass} value={personId} onChange={(e) => setPersonId(e.target.value)}>
            <option value="">{copy.taskForm.nobody}</option>
            {people.map((person) => (
              <option key={person.id} value={person.id}>{person.name}</option>
            ))}
          </select>
        </Field>
        {(error ?? serverError) && <p role="alert" className="text-red-700 dark:text-red-400">{error ?? serverError}</p>}
        <div className="flex flex-wrap justify-end gap-3">
          {onRemove && (
            <button type="button" className={`${secondaryButton} mr-auto`} onClick={onRemove}>{copy.taskForm.removeTask}</button>
          )}
          <button type="button" className={secondaryButton} onClick={onClose}>{copy.common.cancel}</button>
          <button type="submit" className={primaryButton} disabled={pending}>{copy.common.save}</button>
        </div>
      </form>
    </Dialog>
  );
};

const Field = ({ label, children }: { label: string; children: ReactNode }) => (
  <label className="grid gap-1">
    <span>{label}</span>
    {children}
  </label>
);
