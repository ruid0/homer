import type { EventInput } from "@homer/shared";
import { trpc, type ScheduleEvent } from "../trpc";
import { EventDialog } from "./EventDialog";
import { copy } from "../copy";

type Props = {
  event?: ScheduleEvent;
  defaultDate: string;
  onSaved: () => void;
  onClose: () => void;
};

export const EventEditor = ({ event, defaultDate, onSaved, onClose }: Props) => {
  const add = trpc.events.add.useMutation({ onSuccess: onSaved });
  const update = trpc.events.update.useMutation({ onSuccess: onSaved });
  const remove = trpc.events.remove.useMutation({ onSuccess: onSaved });

  const save = (values: EventInput) => (event ? update.mutate({ ...values, id: event.id }) : add.mutate(values));

  const removeEvent = (target: ScheduleEvent) => {
    if (window.confirm(copy.eventForm.confirmRemove(target.title))) remove.mutate({ id: target.id });
  };

  return (
    <EventDialog
      event={event}
      defaultDate={defaultDate}
      pending={add.isPending || update.isPending || remove.isPending}
      serverError={(event ? update.error : add.error)?.message ?? remove.error?.message}
      onSave={save}
      onRemove={event ? () => removeEvent(event) : undefined}
      onClose={onClose}
    />
  );
};
