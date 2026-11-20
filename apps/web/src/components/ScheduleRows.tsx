import type { ScheduleEvent, ScheduleTask } from "../trpc";
import { Row } from "./Row";
import { rowAction, secondaryButton } from "./ui";
import { copy } from "../copy";

type TaskRowProps = { task: ScheduleTask; busy: boolean; onDone: () => void; onEdit: () => void };

export const TaskRow = ({ task, busy, onDone, onEdit }: TaskRowProps) => {
  const overdue = task.daysOverdue > 0;
  const repeatText = task.repeat ? copy.schedule.repeats[task.repeat] : null;
  return (
    <Row
      when={task.dueTime}
      title={task.title}
      overdue={overdue}
      faded={task.projected}
      status={overdue ? { text: copy.schedule.overdueBy(task.daysOverdue), level: "late" } : undefined}
      meta={[task.personName, repeatText].filter((part) => part !== null).join(copy.common.separator)}
      onOpen={onEdit}
      openLabel={copy.schedule.editLabel(task.title)}
      action={
        task.projected ? undefined : (
          <button
            type="button"
            className={`${secondaryButton} ${rowAction}`}
            onClick={onDone}
            disabled={busy}
            aria-label={copy.schedule.doneLabel(task.title)}
          >
            {copy.schedule.done}
          </button>
        )
      }
    />
  );
};

type EventRowProps = { event: ScheduleEvent; onEdit: () => void };

export const EventRow = ({ event, onEdit }: EventRowProps) => (
  <Row
    when={event.time}
    title={event.title}
    meta={[copy.schedule.eventLabel, event.personName].filter((part) => part !== null).join(copy.common.separator)}
    onOpen={onEdit}
    openLabel={copy.schedule.editLabel(event.title)}
  />
);
