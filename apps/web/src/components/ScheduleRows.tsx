import type { ScheduleEvent, ScheduleTask } from "../trpc";
import { ListRow } from "./ListRow";
import { doneSize, quietButton, secondaryButton, statusClass } from "./ui";
import { copy } from "../copy";

type TaskRowProps = { task: ScheduleTask; busy: boolean; onDone: () => void; onEdit: () => void };

export const TaskRow = ({ task, busy, onDone, onEdit }: TaskRowProps) => {
  const overdue = task.daysOverdue > 0;
  return (
    <ListRow
      when={task.dueTime ?? copy.schedule.anyTime}
      title={task.title}
      overdue={overdue}
      status={overdue ? <span className={statusClass("late")}>{copy.schedule.overdueBy(task.daysOverdue)}</span> : undefined}
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
            className={`${secondaryButton} ${doneSize}`}
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
  <ListRow
    when={event.time ?? copy.schedule.anyTime}
    title={event.title}
    details={[copy.schedule.eventLabel, event.personName].filter((part) => part !== null)}
    actions={
      <>
        <button
          type="button"
          className={quietButton}
          onClick={onEdit}
          aria-label={copy.schedule.editLabel(event.title)}
        >
          {copy.schedule.edit}
        </button>
        {/* The space a Done button takes on a task row, so Edit lines up down the list. */}
        <span aria-hidden="true" className={doneSize} />
      </>
    }
  />
);
