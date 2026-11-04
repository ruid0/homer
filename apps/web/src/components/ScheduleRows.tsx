import type { ReactNode } from "react";
import type { ScheduleEvent, ScheduleTask } from "../trpc";
import { secondaryButton } from "./ui";
import { copy } from "../copy";

type RowProps = { when: ReactNode; title: string; details: string[]; actions: ReactNode };

// Wide: time, title and buttons in one line. Narrow: the buttons drop to a second line.
const Row = ({ when, title, details, actions }: RowProps) => (
  <li className="grid min-h-20 grid-cols-[5.5rem_1fr] items-center gap-x-4 gap-y-2 border-t border-line py-3 sm:grid-cols-[5.5rem_1fr_auto]">
    <div className="text-title font-semibold tabular-nums">{when}</div>
    <div className="min-w-0">
      <p className="text-title font-semibold">{title}</p>
      {details.length > 0 && <p className="text-meta text-muted">{details.join(copy.schedule.separator)}</p>}
    </div>
    <div className="col-span-2 flex justify-end gap-2 sm:col-span-1">{actions}</div>
  </li>
);

const quietButton =
  "min-h-11 rounded-lg px-4 text-base font-medium text-muted hover:bg-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink disabled:opacity-50";

type TaskRowProps = { task: ScheduleTask; busy: boolean; onDone: () => void; onEdit: () => void };

export const TaskRow = ({ task, busy, onDone, onEdit }: TaskRowProps) => {
  const overdue = task.daysOverdue > 0;
  return (
    <Row
      when={
        overdue ? (
          <span className="text-meta font-medium text-late">{copy.schedule.overdueBy(task.daysOverdue)}</span>
        ) : (
          (task.dueTime ?? copy.schedule.anyTime)
        )
      }
      title={task.title}
      details={[task.personName, task.repeat ? copy.schedule.repeats[task.repeat] : null].filter((part) => part !== null)}
      actions={
        <>
          <button
            type="button"
            className={quietButton}
            onClick={onEdit}
            disabled={busy}
            aria-label={copy.schedule.editLabel(task.title)}
          >
            {copy.schedule.edit}
          </button>
          <button
            type="button"
            className={`${secondaryButton} px-6`}
            onClick={onDone}
            disabled={busy}
            aria-label={copy.schedule.doneLabel(task.title)}
          >
            {copy.schedule.done}
          </button>
        </>
      }
    />
  );
};

type EventRowProps = { event: ScheduleEvent; onEdit: () => void };

export const EventRow = ({ event, onEdit }: EventRowProps) => (
  <Row
    when={event.time ?? copy.schedule.anyTime}
    title={event.title}
    details={[copy.schedule.eventLabel, event.personName].filter((part) => part !== null)}
    actions={
      <button
        type="button"
        className={quietButton}
        onClick={onEdit}
        aria-label={copy.schedule.editLabel(event.title)}
      >
        {copy.schedule.edit}
      </button>
    }
  />
);
