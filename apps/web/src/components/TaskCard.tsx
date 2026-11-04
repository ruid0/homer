import type { ScheduleTask } from "../trpc";
import { primaryButton, secondaryButton } from "./ui";
import { copy } from "../copy";

type Props = { task: ScheduleTask; busy: boolean; onDone: () => void; onEdit: () => void };

const muted = "text-meta text-muted";
const person = "text-base text-ink";

export const TaskCard = ({ task, busy, onDone, onEdit }: Props) => (
  <li className="flex flex-col gap-3 rounded-xl border border-line bg-card p-4">
    <div>
      <h3 className="text-title font-semibold">{task.title}</h3>
      {task.daysOverdue > 0 && (
        <p className="font-medium text-late">{copy.schedule.overdueBy(task.daysOverdue)}</p>
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
