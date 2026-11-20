import type { TimelineRow } from "../lib/timeline";
import type { ScheduleEvent, ScheduleTask } from "../trpc";
import { NowLine } from "./NowLine";
import { Row } from "./Row";
import { rowAction, secondaryButton } from "./ui";
import { copy } from "../copy";

type Props = {
  rows: TimelineRow<ScheduleTask, ScheduleEvent>[];
  nowTime: string;
  busy: boolean;
  onDone: (task: ScheduleTask) => void;
};

const subline = (parts: (string | null)[]) => parts.filter(Boolean).join(copy.common.separator);

export const TimelineList = ({ rows, nowTime, busy, onDone }: Props) => (
  <ul>
    {rows.map((row) => {
      if (row.kind === "now") {
        return <NowLine key="now" time={nowTime} />;
      }
      if (row.kind === "event") {
        return (
          <Row
            key={`event-${row.value.id}`}
            when={row.value.time}
            title={row.value.title}
            meta={subline([copy.schedule.eventLabel, row.value.personName])}
          />
        );
      }
      const task = row.value;
      return (
        <Row
          key={`${row.kind}-${task.id}`}
          when={task.dueTime}
          title={task.title}
          overdue={row.kind === "overdue"}
          status={
            row.kind === "overdue" ? { text: copy.schedule.overdueBy(task.daysOverdue), level: "late" } : undefined
          }
          meta={task.personName ?? undefined}
          action={
            <button
              type="button"
              className={`${secondaryButton} ${rowAction}`}
              disabled={busy}
              aria-label={copy.home.doneLabel(task.title)}
              onClick={() => onDone(task)}
            >
              {copy.schedule.done}
            </button>
          }
        />
      );
    })}
  </ul>
);
