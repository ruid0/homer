import type { ScheduleEvent, ScheduleTask } from "../trpc";
import { ListRow } from "./ListRow";
import { quietButton, secondaryButton } from "./ui";
import { copy } from "../copy";

type TaskRowProps = { task: ScheduleTask; busy: boolean; onDone: () => void; onEdit: () => void };

export const TaskRow = ({ task, busy, onDone, onEdit }: TaskRowProps) => {
  const overdue = task.daysOverdue > 0;
  return (
    <ListRow
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
  <ListRow
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
