import type { TaskInput } from "@homer/shared";
import { trpc, type ListPerson, type ScheduleTask } from "../trpc";
import { TaskDialog } from "./TaskDialog";
import { copy } from "../copy";

type Props = {
  task?: ScheduleTask;
  people: readonly ListPerson[];
  defaultPersonId: number | null;
  onSaved: () => void;
  onClose: () => void;
};

export const TaskEditor = ({ task, people, defaultPersonId, onSaved, onClose }: Props) => {
  const add = trpc.tasks.add.useMutation({ onSuccess: onSaved });
  const update = trpc.tasks.update.useMutation({ onSuccess: onSaved });
  const remove = trpc.tasks.remove.useMutation({ onSuccess: onSaved });

  const save = (values: TaskInput) => (task ? update.mutate({ ...values, id: task.id }) : add.mutate(values));

  const removeTask = (target: ScheduleTask) => {
    if (window.confirm(copy.taskForm.confirmRemove(target.title))) remove.mutate({ id: target.id });
  };

  return (
    <TaskDialog
      task={task}
      people={people}
      defaultPersonId={defaultPersonId}
      pending={add.isPending || update.isPending || remove.isPending}
      serverError={(task ? update.error : add.error)?.message ?? remove.error?.message}
      onSave={save}
      onRemove={task ? () => removeTask(task) : undefined}
      onClose={onClose}
    />
  );
};
