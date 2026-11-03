import type { ScheduleTask } from "../trpc";
import { primaryButton, secondaryButton } from "./ui";
import { copy } from "../copy";

type Props = { task: ScheduleTask; busy: boolean; onDone: () => void; onEdit: () => void };

const muted = "text-sm text-stone-600 dark:text-stone-400";
const person = "text-base text-stone-800 dark:text-stone-200";

export const TaskCard = ({ task, busy, onDone, onEdit }: Props) => (
  <li className="flex flex-col gap-3 rounded-xl border border-stone-200 bg-white p-4 dark:border-stone-800 dark:bg-stone-900">
    <div>
      <h3 className="text-lg font-semibold">{task.title}</h3>
      {task.daysOverdue > 0 && (
        <p className="font-medium text-red-700 dark:text-red-400">{copy.schedule.overdueBy(task.daysOverdue)}</p>
      )}
      {task.dueTime && <p className={muted}>{task.dueTime}</p>}
      {task.personName && <p className={person}>{task.personName}</p>}
      {task.repeat && <p className={muted}>{copy.schedule.repeats[task.repeat]}</p>}
    </div>
    <div className="mt-auto flex gap-3">
      <button type="button" className={`${primaryButton} flex-1`} onClick={onDone} disabled={busy}>{copy.schedule.done}</button>
      <button
        type="button"
        className={secondaryButton}
        onClick={onEdit}
        disabled={busy}
        aria-label={copy.schedule.editLabel(task.title)}
      >
        {copy.schedule.edit}
      </button>
    </div>
  </li>
);
