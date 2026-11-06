import { copy } from "../copy";
import { dueWords } from "../lib/maintenanceText";
import type { MaintenanceItem } from "../trpc";
import { secondaryButton } from "./ui";

type Props = { items: MaintenanceItem[]; busy: boolean; onDone: (item: MaintenanceItem) => void };

export const DueSoonList = ({ items, busy, onDone }: Props) => (
  <ul>
    {items.map((item) => (
      <li key={item.id} className="flex min-h-20 items-center gap-4 border-t border-line py-3">
        <div className="min-w-0 flex-1">
          <p className="text-title font-semibold">{item.name}</p>
          <p className={`font-medium ${item.status === "soon" ? "text-warn" : "text-late"}`}>{dueWords(item)}</p>
        </div>
        <button
          type="button"
          className={`${secondaryButton} shrink-0 px-5`}
          disabled={busy}
          aria-label={copy.maintenance.doneLabel(item.name)}
          onClick={() => onDone(item)}
        >
          {copy.maintenance.done}
        </button>
      </li>
    ))}
  </ul>
);
