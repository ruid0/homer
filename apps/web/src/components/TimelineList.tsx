import type { TimelineRow } from "../lib/timeline";
import type { ScheduleEvent, ScheduleTask } from "../trpc";
import { secondaryButton } from "./ui";
import { copy } from "../copy";

type Props = {
  rows: TimelineRow<ScheduleTask, ScheduleEvent>[];
  nowTime: string;
  busy: boolean;
  onDone: (task: ScheduleTask) => void;
};

const rowClass = "flex min-h-20 items-center gap-4 border-t border-line py-3";
const timeClass = "w-24 shrink-0 text-title font-semibold tabular-nums";
const subline = (parts: (string | null)[]) => parts.filter(Boolean).join(copy.home.separator);

const DoneButton = ({ task, busy, onDone }: { task: ScheduleTask; busy: boolean; onDone: (task: ScheduleTask) => void }) => (
  <button
    type="button"
    className={`${secondaryButton} shrink-0 px-6`}
    disabled={busy}
    aria-label={copy.home.doneLabel(task.title)}
    onClick={() => onDone(task)}
  >
    {copy.schedule.done}
  </button>
);

export const TimelineList = ({ rows, nowTime, busy, onDone }: Props) => (
  <ul>
    {rows.map((row) => {
      if (row.kind === "now") {
        return (
          <li key="now" className="sticky bottom-0 top-0 z-10 flex items-center gap-3 bg-card py-2">
            <span className="text-title font-bold tabular-nums">{copy.home.now(nowTime)}</span>
            <span aria-hidden="true" className="h-0.5 flex-1 rounded bg-ink" />
          </li>
        );
      }
      if (row.kind === "event") {
        return (
          <li key={`event-${row.value.id}`} className={rowClass}>
            <span className={timeClass}>{row.value.time ?? copy.home.anyTime}</span>
            <div className="min-w-0 flex-1">
              <p className="text-title font-semibold">{row.value.title}</p>
              <p className="text-meta text-muted">{subline([copy.schedule.eventLabel, row.value.personName])}</p>
            </div>
          </li>
        );
      }
      const task = row.value;
      return (
        <li key={`${row.kind}-${task.id}`} className={rowClass}>
          {row.kind === "overdue" ? (
            <span className="w-24 shrink-0 text-meta font-medium text-late">{copy.schedule.overdueBy(task.daysOverdue)}</span>
          ) : (
            <span className={timeClass}>{task.dueTime ?? copy.home.anyTime}</span>
          )}
          <div className="min-w-0 flex-1">
            <p className="text-title font-semibold">{task.title}</p>
            {task.personName && <p className="text-meta text-muted">{task.personName}</p>}
          </div>
          <DoneButton task={task} busy={busy} onDone={onDone} />
        </li>
      );
    })}
  </ul>
);
