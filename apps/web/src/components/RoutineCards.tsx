import { copy } from "../copy";
import { useClock } from "../lib/clock";
import { reminderChip } from "../lib/reminderText";
import { cycleCount, dayLabel, dayState, isFuture, tickCount, weekdayInitial } from "../lib/routineWeek";
import type { RoutineWeek } from "../trpc";
import { Bell } from "./Bell";
import { Tick } from "./Tick";
import { cx } from "./ui";

type Props = {
  week: RoutineWeek;
  reminders: Reminder[];
  today: string;
  onSet: (itemId: number, day: string, count: number) => void;
  onEdit: (itemId: number) => void;
};

type Item = RoutineWeek["items"][number];
type Reminder = { id: number; itemId: number; fireAt: string; dailyTime: string | null };

// Offset wider than the ring that marks today, so a focused square is not read as a second "today".
const focusRing = "focus-visible:outline-3 focus-visible:outline-offset-4 focus-visible:outline-ink";

const circle = (ticked: boolean) =>
  cx(
    "grid size-14 shrink-0 place-items-center rounded-full border-2",
    focusRing,
    ticked ? "border-ok bg-ok text-card" : "border-control text-control hover:bg-hover",
  );

const square = (state: ReturnType<typeof dayState>, isToday: boolean) => {
  const look = {
    done: "border-ok bg-ok text-card",
    partial: "border-ok text-ok",
    none: "border-control text-control hover:bg-hover",
  }[state];
  return cx(
    "grid h-11 w-full max-w-12 place-items-center rounded-xl border",
    isToday && "ring-2 ring-ink",
    look,
    focusRing,
  );
};

const ReminderChips = ({ reminders, now }: { reminders: Reminder[]; now: Date }) =>
  reminders.length === 0 ? null : (
    <ul className="flex flex-wrap gap-2" aria-label={copy.reminders.title}>
      {reminders.map((reminder) => {
        const chip = reminderChip(reminder.fireAt, reminder.dailyTime, now);
        return (
          <li
            key={reminder.id}
            className={cx(
              "flex items-center gap-1.5 rounded-full border px-3 py-1 text-meta",
              chip.soon ? "border-warn font-semibold text-warn" : "border-ok text-ink",
            )}
          >
            <Bell className={cx("size-4 shrink-0", !chip.soon && "text-ok")} />
            {chip.text}
          </li>
        );
      })}
    </ul>
  );

export const RoutineCards = ({ week, reminders, today, onSet, onEdit }: Props) => {
  const now = useClock();
  const todayIndex = week.days.indexOf(today);
  return (
    <ul className="grid gap-4">
      {week.items.map((item) => {
        const doneToday = todayIndex < 0 ? 0 : (item.counts[todayIndex] ?? 0);
        return (
          <li key={item.id} className="grid gap-3 rounded-2xl border border-line bg-card p-3 sm:p-4">
            <button
              type="button"
              className={`min-h-11 text-left text-section font-semibold ${focusRing}`}
              aria-label={copy.routine.editRow(item.name)}
              onClick={() => onEdit(item.id)}
            >
              {item.name}
            </button>

            <ReminderChips reminders={reminders.filter((reminder) => reminder.itemId === item.id)} now={now} />

            {todayIndex >= 0 && (
              <div className="flex flex-wrap items-center gap-3">
                <div className="flex min-w-0 flex-wrap gap-3">
                  {Array.from({ length: item.targetPerDay }, (_, position) => (
                    <button
                      key={position}
                      type="button"
                      className={circle(position < doneToday)}
                      aria-pressed={position < doneToday}
                      aria-label={copy.routine.todayTick(item.name, position + 1, item.targetPerDay)}
                      onClick={() => onSet(item.id, today, tickCount(doneToday, position))}
                    >
                      <Tick className="size-7" />
                    </button>
                  ))}
                </div>
                <p className="min-w-0 text-title font-semibold">
                  {doneToday >= item.targetPerDay
                    ? copy.routine.doneToday
                    : item.targetPerDay === 1
                      ? copy.routine.notDone
                      : copy.routine.progress(doneToday, item.targetPerDay)}
                  <span className="block text-meta font-normal text-muted">
                    {copy.routine.todayLine(dayLabel(today))}
                  </span>
                </p>
              </div>
            )}

            <div className="grid grid-cols-7 gap-0.5">
              {week.days.map((day, index) => {
                const done = item.counts[index] ?? 0;
                const isToday = day === today;
                return (
                  <div key={day} className="grid min-w-0 justify-items-center gap-0.5">
                    <span aria-hidden="true" className={`text-meta ${isToday ? "font-bold text-ink" : "text-muted"}`}>
                      {weekdayInitial(day)}
                    </span>
                    {isFuture(day, today) ? (
                      <div
                        role="img"
                        aria-label={copy.routine.cellFuture(item.name, dayLabel(day))}
                        className="h-11 w-full max-w-12 rounded-xl border border-dashed border-control opacity-40"
                      />
                    ) : (
                      <button
                        type="button"
                        className={square(dayState(done, item.targetPerDay), isToday)}
                        aria-label={copy.routine.dayLabel(
                          item.name,
                          dayLabel(day),
                          copy.routine.dayState(done, item.targetPerDay),
                        )}
                        onClick={() => onSet(item.id, day, cycleCount(done, item.targetPerDay))}
                      >
                        {dayState(done, item.targetPerDay) === "partial" ? (
                          <span className="text-meta font-bold">
                            {done}/{item.targetPerDay}
                          </span>
                        ) : (
                          <Tick className="size-5" />
                        )}
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          </li>
        );
      })}
    </ul>
  );
};
