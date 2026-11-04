import type { ScheduleEvent } from "../trpc";
import { secondaryButton } from "./ui";
import { copy } from "../copy";

type Props = { event: ScheduleEvent; onEdit: () => void };

const muted = "text-meta text-muted";
const person = "text-base text-ink";

export const EventCard = ({ event, onEdit }: Props) => (
  <li className="flex flex-col gap-3 rounded-xl border border-dashed border-line-strong bg-card p-4">
    <div>
      <p className={muted}>{copy.schedule.eventLabel}</p>
      <h3 className="text-title font-semibold">{event.title}</h3>
      {event.time && <p className={muted}>{event.time}</p>}
      {event.personName && <p className={person}>{event.personName}</p>}
    </div>
    <div className="mt-auto flex">
      <button
        type="button"
        className={`${secondaryButton} flex-1`}
        onClick={onEdit}
        aria-label={copy.schedule.editLabel(event.title)}
      >
        {copy.schedule.edit}
      </button>
    </div>
  </li>
);
