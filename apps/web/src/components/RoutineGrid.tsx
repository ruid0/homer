import { useEffect, useRef } from "react";
import { copy } from "../copy";
import { dayLabel, isFuture } from "../lib/routineWeek";
import type { RoutineWeek } from "../trpc";
import { quietButton, secondaryButton } from "./ui";

type Props = {
  week: RoutineWeek;
  today: string;
  onChange: (itemId: number, day: string, change: 1 | -1) => void;
  onEdit: (itemId: number) => void;
};

const cellButton = "min-h-11 min-w-16 flex-1 rounded-lg px-2 text-base hover:bg-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink disabled:opacity-40";

const open = "border border-line-strong";

const filled = "border-2 border-ink bg-hover font-semibold";

// The seven columns do not fit a phone, so the grid scrolls sideways and opens on today.
const useScrollToToday = (week: RoutineWeek, today: string) => {
  const todayHeader = useRef<HTMLTableCellElement>(null);
  const hasRows = week.items.length > 0;
  useEffect(() => {
    if (hasRows && week.days.includes(today)) todayHeader.current?.scrollIntoView({ inline: "center", block: "nearest" });
  }, [week.days, today, hasRows]);
  return todayHeader;
};

export const RoutineGrid = ({ week, today, onChange, onEdit }: Props) => {
  const todayHeader = useScrollToToday(week, today);

  return (
    <div className="overflow-x-auto rounded-xl border border-line bg-card">
      <table className="w-full border-collapse">
        <thead>
          <tr>
            <th scope="col" className="sticky left-0 z-10 min-w-36 bg-card p-2 text-left font-medium text-muted">
              {copy.routine.rowHeader}
            </th>
            {week.days.map((day) => (
              <th
                key={day}
                scope="col"
                ref={day === today ? todayHeader : undefined}
                aria-current={day === today ? "date" : undefined}
                className={`min-w-20 p-2 text-center font-medium ${day === today ? "border-b-2 border-ink font-semibold" : "text-muted"}`}
              >
                {dayLabel(day)}
                {day === today && <span className="block text-meta">{copy.routine.today}</span>}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {week.items.map((item) => (
            <tr key={item.id} className="border-t border-line">
              <th scope="row" className="sticky left-0 z-10 bg-card p-2 text-left">
                <button
                  type="button"
                  className={`${quietButton} w-full justify-start px-1 text-left text-ink`}
                  aria-label={copy.routine.editRow(item.name)}
                  onClick={() => onEdit(item.id)}
                >
                  {item.name}
                </button>
              </th>
              {week.days.map((day, index) => {
                const done = item.counts[index] ?? 0;
                return (
                  <td key={day} className="p-1">
                    {isFuture(day, today) ? (
                      <div
                        role="img"
                        aria-label={copy.routine.cellFuture(item.name, dayLabel(day))}
                        className="min-h-11 rounded-lg bg-hover opacity-50"
                      />
                    ) : (
                      <div className="flex gap-1">
                        {done > 0 && (
                          <button
                            type="button"
                            className={`${secondaryButton} min-w-11 px-0`}
                            aria-label={copy.routine.takeOneOff(item.name, dayLabel(day))}
                            onClick={() => onChange(item.id, day, -1)}
                          >
                            {copy.routine.minus}
                          </button>
                        )}
                        <button
                          type="button"
                          className={`${cellButton} ${done >= item.targetPerDay ? filled : open}`}
                          aria-label={copy.routine.cellLabel(copy.routine.cellText(done, item.targetPerDay), item.name, dayLabel(day))}
                          onClick={() => onChange(item.id, day, 1)}
                        >
                          {copy.routine.cellText(done, item.targetPerDay)}
                        </button>
                      </div>
                    )}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};
