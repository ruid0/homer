import { describeRunsOut } from "../lib/itemText";
import type { RunningOutRow } from "../lib/runningOut";
import type { ListItem } from "../trpc";
import { secondaryButton } from "./ui";
import { copy } from "../copy";

type Props = { rows: RunningOutRow<ListItem>[]; onBought: (item: ListItem) => void };

export const RunningOutList = ({ rows, onBought }: Props) => (
  <ul>
    {rows.map(({ item, onList }) => (
      <li key={item.id} className="flex min-h-20 items-center gap-4 border-t border-line py-3">
        <div className="min-w-0 flex-1">
          <p className="text-title font-semibold">{item.name}</p>
          <p className="font-medium text-warn">{describeRunsOut(item)}</p>
          {onList && <p className="text-meta text-muted">{copy.items.onGroceryList}</p>}
        </div>
        <button
          type="button"
          className={`${secondaryButton} shrink-0 px-5`}
          aria-label={copy.common.boughtLabel(item.name)}
          onClick={() => onBought(item)}
        >
          {copy.common.boughtIt}
        </button>
      </li>
    ))}
  </ul>
);
