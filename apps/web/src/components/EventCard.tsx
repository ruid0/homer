import type { ScheduleEvent } from "../trpc";
import { secondaryButton } from "./ui";
import { copy } from "../copy";

type Props = { event: ScheduleEvent; onEdit: () => void };

const muted = "text-sm text-stone-600 dark:text-stone-400";

export const EventCard = ({ event, onEdit }: Props) => (
  <li className="flex flex-col gap-3 rounded-xl border border-dashed border-stone-300 bg-white p-4 dark:border-stone-700 dark:bg-stone-900">
    <div>
      <p className={muted}>{copy.schedule.eventLabel}</p>
      <h3 className="text-lg font-semibold">{event.title}</h3>
      {event.time && <p className={muted}>{event.time}</p>}
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
