import { useState, type KeyboardEvent } from "react";
import { copy } from "../copy";
import { useClock } from "../lib/clock";
import { durationAsText, isValidDuration, reminderWhenLabel } from "../lib/reminderText";
import { trpc } from "../trpc";
import { Field } from "./Field";
import { inputClass, quietButton, secondaryButton, toggleButton } from "./ui";

type Props = { personId: number; itemId: number; remindersOn: boolean };

type Kind = "in" | "at";

const MAX_HOURS = 24;
const HOURS = Array.from({ length: MAX_HOURS + 1 }, (_, hour) => hour);
const MINUTES = Array.from({ length: 60 }, (_, minute) => minute);

export const RoutineReminders = ({ personId, itemId, remindersOn }: Props) => {
  const utils = trpc.useUtils();
  const now = useClock();
  const [kind, setKind] = useState<Kind>("in");
  const [hours, setHours] = useState(1);
  const [minutes, setMinutes] = useState(0);
  const [time, setTime] = useState("");
  const [everyDay, setEveryDay] = useState(false);
  const [error, setError] = useState<string>();

  const list = trpc.routines.reminders.useQuery({ personId });
  const refresh = () => utils.routines.reminders.invalidate();
  const add = trpc.routines.addReminder.useMutation({ onSuccess: refresh, onError: (failure) => setError(failure.message) });
  const remove = trpc.routines.removeReminder.useMutation({ onError: (failure) => setError(failure.message), onSettled: refresh });

  // A day is the longest wait, so 24 hours leaves no minutes.
  const pickHours = (next: number) => {
    setHours(next);
    setError(undefined);
    if (next === MAX_HOURS) setMinutes(0);
  };

  const mine = (list.data ?? []).filter((reminder) => reminder.itemId === itemId);

  const submit = () => {
    if (kind === "in" && !isValidDuration(hours, minutes)) return setError(copy.reminders.badDuration);
    if (kind === "at" && time === "") return setError(copy.reminders.blankTime);
    setError(undefined);
    add.mutate({ itemId, text: kind === "in" ? durationAsText(hours, minutes) : time, repeatDaily: kind === "at" && everyDay });
  };

  // Enter inside the pickers adds the reminder. It must not save the row form around this section.
  const enter = (event: KeyboardEvent) => {
    if (event.key.toLowerCase() !== "enter" || (event.target as HTMLElement).tagName === "BUTTON") return;
    event.preventDefault();
    if (remindersOn) submit();
  };

  const pickKind = (next: Kind) => {
    setKind(next);
    setError(undefined);
  };

  return (
    <section className="grid gap-3 border-t border-line pt-4" aria-labelledby={`reminders-${itemId}`} onKeyDown={enter}>
      <h3 id={`reminders-${itemId}`} className="font-semibold">{copy.reminders.title}</h3>
      {list.error && <p role="alert" className="text-late">{copy.reminders.loadFailed}</p>}
      {list.data && mine.length === 0 && <p className="text-muted">{copy.reminders.none}</p>}
      {mine.length > 0 && (
        <ul className="grid gap-1">
          {mine.map((reminder) => {
            const when = reminderWhenLabel(reminder.fireAt, reminder.dailyTime, now);
            return (
              <li key={reminder.id} className="flex items-center justify-between gap-2">
                <span>{when}</span>
                <button
                  type="button"
                  className={quietButton}
                  aria-label={copy.reminders.removeLabel(when)}
                  disabled={remove.isPending}
                  onClick={() => remove.mutate({ id: reminder.id })}
                >
                  {copy.reminders.remove}
                </button>
              </li>
            );
          })}
        </ul>
      )}

      {!remindersOn && <p className="text-muted">{copy.reminders.needSetup}</p>}
      {remindersOn && (
        <div className="grid gap-3">
          <div className="flex gap-2" role="group" aria-label={copy.reminders.kindLabel}>
            <button type="button" aria-pressed={kind === "in"} className={toggleButton(kind === "in")} onClick={() => pickKind("in")}>
              {copy.reminders.inKind}
            </button>
            <button type="button" aria-pressed={kind === "at"} className={toggleButton(kind === "at")} onClick={() => pickKind("at")}>
              {copy.reminders.atKind}
            </button>
          </div>
          {kind === "in" && (
            <div className="grid grid-cols-2 gap-3">
              <Field label={copy.reminders.hours}>
                <select className={inputClass} value={hours} onChange={(event) => pickHours(Number(event.target.value))}>
                  {HOURS.map((hour) => <option key={hour} value={hour}>{copy.reminders.hoursOption(hour)}</option>)}
                </select>
              </Field>
              <Field label={copy.reminders.minutes}>
                <select className={inputClass} value={minutes} disabled={hours === MAX_HOURS} onChange={(event) => setMinutes(Number(event.target.value))}>
                  {MINUTES.map((minute) => <option key={minute} value={minute}>{copy.reminders.minutesOption(minute)}</option>)}
                </select>
              </Field>
            </div>
          )}
          {kind === "at" && (
            <>
              <Field label={copy.reminders.timeLabel}>
                <input className={inputClass} type="time" value={time} onChange={(event) => setTime(event.target.value)} />
              </Field>
              <label className="flex min-h-11 items-center gap-2">
                <input type="checkbox" className="size-5" checked={everyDay} onChange={(event) => setEveryDay(event.target.checked)} />
                {copy.reminders.everyDayLabel}
              </label>
            </>
          )}
          {error && <p role="alert" className="text-late">{error}</p>}
          <button type="button" className={`${secondaryButton} justify-self-start`} disabled={add.isPending} onClick={submit}>
            {copy.reminders.add}
          </button>
          <p className="text-muted">{copy.reminders.privacyNote}</p>
        </div>
      )}
    </section>
  );
};
