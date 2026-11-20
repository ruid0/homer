import { useSearchParams } from "react-router-dom";
import { PageHeader } from "../components/PageHeader";
import { StockBuy } from "../components/StockBuy";
import { StockEverything } from "../components/StockEverything";
import { cx } from "../components/ui";
import { copy } from "../copy";
import { trpc } from "../trpc";

type View = "buy" | "everything";

const VIEW_PARAM = "view";

const switchButton = (pressed: boolean) =>
  cx(
    "min-h-11 min-w-0 flex-1 border px-3 font-semibold first:rounded-l-lg last:rounded-r-lg [&:not(:first-child)]:-ml-px",
    "focus-visible:z-10 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink",
    pressed ? "relative z-[1] border-primary bg-primary text-on-primary" : "border-control bg-card hover:bg-hover",
  );

// Two views of one household: what to buy, and everything tracked. The view is in the address, so a link or the
// Back button lands on the same one.
export const StockPage = () => {
  const [params, setParams] = useSearchParams();
  const view: View = params.get(VIEW_PARAM) === "everything" ? "everything" : "buy";
  const entries = trpc.groceries.list.useQuery();
  const items = trpc.inventory.list.useQuery();

  const show = (next: View) => setParams(next === "buy" ? {} : { [VIEW_PARAM]: next });
  const count = (length: number | undefined) => (length === undefined ? "" : ` (${length})`);

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader title={copy.stockPage.title} />
      <div role="group" aria-label={copy.stockPage.viewLabel} className="mb-4 flex max-w-sm">
        <button
          type="button"
          aria-pressed={view === "buy"}
          className={switchButton(view === "buy")}
          onClick={() => show("buy")}
        >
          {copy.stockPage.toBuy}
          {count(entries.data?.length)}
        </button>
        <button
          type="button"
          aria-pressed={view === "everything"}
          className={switchButton(view === "everything")}
          onClick={() => show("everything")}
        >
          {copy.stockPage.everything}
          {count(items.data?.length)}
        </button>
      </div>
      {view === "buy" ? <StockBuy /> : <StockEverything />}
    </div>
  );
};
