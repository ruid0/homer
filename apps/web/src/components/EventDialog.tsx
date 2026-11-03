import { useState, type SubmitEvent } from "react";
import { eventInputSchema, type EventInput } from "@homer/shared";
import type { ScheduleEvent } from "../trpc";
import { Dialog } from "./Dialog";
import { Field } from "./Field";
import { inputClass, primaryButton, secondaryButton } from "./ui";
import { copy } from "../copy";

type Props = {
  event?: ScheduleEvent;
  defaultDate: string;
  pending: boolean;
  serverError?: string;
  onSave: (values: EventInput) => void;
  onRemove?: () => void;
  onClose: () => void;
};

export const EventDialog = ({ event, defaultDate, pending, serverError, onSave, onRemove, onClose }: Props) => {
  const [title, setTitle] = useState(event?.title ?? "");
  const [date, setDate] = useState(event?.date ?? defaultDate);
  const [time, setTime] = useState(event?.time ?? "");
  const [error, setError] = useState<string>();

  const submit = (submitted: SubmitEvent) => {
    submitted.preventDefault();
    const parsed = eventInputSchema.safeParse({ title, date, time: time === "" ? null : time });
    if (parsed.success) {
      setError(undefined);
      return onSave(parsed.data);
    }
    const [issue] = parsed.error.issues;
    setError(issue?.path[0] === "title" ? copy.eventForm.blankTitle : issue?.message);
  };

  return (
    <Dialog title={event ? copy.eventForm.editTitle(event.title) : copy.eventForm.addTitle} onClose={onClose}>
      <form onSubmit={submit} className="grid gap-4">
        <Field label={copy.eventForm.title}>
          <input className={inputClass} value={title} onChange={(e) => setTitle(e.target.value)} autoFocus />
        </Field>
        <Field label={copy.eventForm.date}>
          <input className={inputClass} type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </Field>
        <Field label={copy.eventForm.time}>
          <input className={inputClass} type="time" value={time} onChange={(e) => setTime(e.target.value)} />
        </Field>
        {(error ?? serverError) && <p role="alert" className="text-red-700 dark:text-red-400">{error ?? serverError}</p>}
        <div className="flex flex-wrap justify-end gap-3">
          {onRemove && (
            <button type="button" className={`${secondaryButton} mr-auto`} onClick={onRemove}>{copy.eventForm.removeEvent}</button>
          )}
          <button type="button" className={secondaryButton} onClick={onClose}>{copy.common.cancel}</button>
          <button type="submit" className={primaryButton} disabled={pending}>{copy.common.save}</button>
        </div>
      </form>
    </Dialog>
  );
};
