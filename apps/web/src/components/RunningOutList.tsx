import { describeRunsOut } from "../lib/itemText";
import type { RunningOutRow } from "../lib/runningOut";
import type { ListItem } from "../trpc";
import { HomeRow } from "./HomeRow";
import { doneSize, secondaryButton } from "./ui";
import { copy } from "../copy";

type Props = { rows: RunningOutRow<ListItem>[]; onBought: (item: ListItem) => void };

export const RunningOutList = ({ rows, onBought }: Props) => (
  <ul>
    {rows.map(({ item, onList }) => (
      <HomeRow
        key={item.id}
        title={item.name}
        status={describeRunsOut(item)}
        level="warn"
        note={onList ? copy.items.onGroceryList : null}
        action={
          <button
            type="button"
            className={`${secondaryButton} ${doneSize} shrink-0`}
            aria-label={copy.common.boughtLabel(item.name)}
            onClick={() => onBought(item)}
          >
            {copy.common.boughtIt}
          </button>
        }
      />
    ))}
  </ul>
);
