import { useState, type SubmitEvent } from "react";
import { GroceryRow } from "../components/GroceryRow";
import { ListCard } from "../components/ListCard";
import { RestockDialog } from "../components/RestockDialog";
import { inputClass, primaryButton } from "../components/ui";
import { trpc, type ListEntry } from "../trpc";
import { copy } from "../copy";

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
      <h1 className="mb-4 text-page font-semibold">{copy.groceries.title}</h1>

      <form onSubmit={submit} className="mb-4 flex items-end gap-3">
        <label className="grid flex-1 gap-1">
          <span>{copy.groceries.addLabel}</span>
          <input
            className={inputClass}
            list="tracked-names"
            value={text}
            onChange={(event) => setText(event.target.value)}
          />
        </label>
        <datalist id="tracked-names">
          {(items.data ?? []).map((item) => <option key={item.id} value={item.name} />)}
        </datalist>
        <button type="submit" className={primaryButton} disabled={add.isPending}>{copy.groceries.add}</button>
      </form>

      {entries.isPending && <p>{copy.groceries.loading}</p>}
      {entries.error && <p role="alert">{copy.groceries.loadFailed}</p>}
      {actionError && <p role="alert" className="mb-4 text-late">{actionError}</p>}
      {entries.data?.length === 0 && <p>{copy.groceries.empty}</p>}

      {entries.data && entries.data.length > 0 && (
        <ListCard>
          {entries.data.map((entry) => (
            <GroceryRow
              key={entry.id}
              entry={entry}
              busy={busy}
              onBought={() => buy(entry)}
              onRemove={() => remove.mutate({ id: entry.id })}
            />
          ))}
        </ListCard>
      )}

      {buying && (
        <RestockDialog
          name={buying.text}
          unit={buying.unit ?? copy.groceries.defaultUnit}
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
