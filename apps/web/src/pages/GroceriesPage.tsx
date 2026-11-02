import { useState, type SubmitEvent } from "react";
import { GroceryCard } from "../components/GroceryCard";
import { RestockDialog } from "../components/RestockDialog";
import { inputClass, primaryButton } from "../components/ui";
import { trpc, type ListEntry } from "../trpc";

export const GroceriesPage = () => {
  const utils = trpc.useUtils();
  const entries = trpc.groceries.list.useQuery();
  const items = trpc.inventory.list.useQuery();
  const [text, setText] = useState("");
  const [buying, setBuying] = useState<ListEntry | null>(null);

  const done = () => {
    setBuying(null);
    return Promise.all([utils.groceries.list.invalidate(), utils.inventory.list.invalidate()]);
  };

  const add = trpc.groceries.add.useMutation({
    onSuccess: () => {
      setText("");
      return done();
    },
  });
  const bought = trpc.groceries.markBought.useMutation({ onSuccess: done });
  const remove = trpc.groceries.remove.useMutation({ onSuccess: done });

  const submit = (event: SubmitEvent) => {
    event.preventDefault();
    if (text.trim()) add.mutate({ text });
  };

  const buy = (entry: ListEntry) => {
    if (entry.itemId === null) bought.mutate({ id: entry.id });
    else setBuying(entry);
  };

  const closeBuying = () => {
    bought.reset();
    setBuying(null);
  };

  const busy = bought.isPending || remove.isPending;
  const actionError = add.error?.message ?? remove.error?.message ?? (buying ? undefined : bought.error?.message);

  return (
    <>
      <h1 className="mb-4 text-2xl font-semibold">Groceries</h1>

      <form onSubmit={submit} className="mb-4 flex gap-3">
        <input
          className={inputClass}
          aria-label="Add to the list"
          placeholder="Add to the list"
          list="tracked-names"
          value={text}
          onChange={(event) => setText(event.target.value)}
        />
        <datalist id="tracked-names">
          {(items.data ?? []).map((item) => <option key={item.id} value={item.name} />)}
        </datalist>
        <button type="submit" className={primaryButton} disabled={add.isPending}>Add</button>
      </form>

      {entries.isPending && <p>Loading the list.</p>}
      {entries.error && <p role="alert">Couldn't load the list. Check that the api is running, then refresh.</p>}
      {actionError && <p role="alert" className="mb-4 text-red-700 dark:text-red-400">{actionError}</p>}
      {entries.data?.length === 0 && <p>Nothing to buy. Items that run low show up here.</p>}

      <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {(entries.data ?? []).map((entry) => (
          <GroceryCard
            key={entry.id}
            entry={entry}
            busy={busy}
            onBought={() => buy(entry)}
            onRemove={() => remove.mutate({ id: entry.id })}
          />
        ))}
      </ul>

      {buying && (
        <RestockDialog
          name={buying.text}
          unit={buying.unit ?? "units"}
          initialQuantity={buying.quantity ?? buying.usualRestock ?? 1}
          pending={bought.isPending}
          serverError={bought.error?.message}
          onSave={(quantity) => bought.mutate({ id: buying.id, quantity })}
          onClose={closeBuying}
        />
      )}
    </>
  );
};
