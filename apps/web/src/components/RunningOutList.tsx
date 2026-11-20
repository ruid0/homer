import { describeRunsOut } from "../lib/itemText";
import type { RunningOutRow } from "../lib/runningOut";
import type { ListItem } from "../trpc";
import { Row } from "./Row";
import { cx, rowAction, secondaryButton } from "./ui";
import { copy } from "../copy";

type Props = { rows: RunningOutRow<ListItem>[]; onBought: (item: ListItem) => void };

export const RunningOutList = ({ rows, onBought }: Props) => (
  <ul>
    {rows.map(({ item, onList }) => (
      <Row
        key={item.id}
        title={item.name}
        status={{ text: describeRunsOut(item), level: "warn" }}
        meta={onList ? copy.stockPage.onList : undefined}
        action={
          <button
            type="button"
            className={cx(secondaryButton, rowAction)}
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
