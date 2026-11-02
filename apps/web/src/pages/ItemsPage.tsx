import { useState } from "react";
import { ItemCard } from "../components/ItemCard";
import { ItemForm } from "../components/ItemForm";
import { RestockDialog } from "../components/RestockDialog";
import { primaryButton } from "../components/ui";
import { sortByUrgency } from "../lib/itemText";
import { trpc, type ListItem } from "../trpc";

type Editing = ListItem | "new" | null;

export const ItemsPage = () => {
  const utils = trpc.useUtils();
  const items = trpc.inventory.list.useQuery();
  const [editing, setEditing] = useState<Editing>(null);
  const [restocking, setRestocking] = useState<ListItem | null>(null);

  const done = () => {
    setEditing(null);
    setRestocking(null);
    return utils.inventory.list.invalidate();
  };

  const create = trpc.inventory.create.useMutation({ onSuccess: done });
  const update = trpc.inventory.update.useMutation({ onSuccess: done });
  const archive = trpc.inventory.archive.useMutation({ onSuccess: done });
  const restock = trpc.inventory.restock.useMutation({ onSuccess: done });
  const markOut = trpc.inventory.markOut.useMutation({ onSuccess: done });

  const removeItem = (item: ListItem) => {
    if (window.confirm(`Remove ${item.name}? Its restock history is kept.`)) archive.mutate({ id: item.id });
  };

  const closeForm = () => {
    create.reset();
    update.reset();
    setEditing(null);
  };

  const closeRestock = () => {
    restock.reset();
    setRestocking(null);
  };

  const actionError = markOut.error?.message ?? archive.error?.message;

  return (
    <>
      <header className="mb-4 flex items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold">Items</h1>
        <button type="button" className={primaryButton} onClick={() => setEditing("new")}>Add item</button>
      </header>

      {items.isPending && <p>Loading items.</p>}
      {items.error && <p role="alert">Couldn't load items. Check that the api is running, then refresh.</p>}
      {actionError && <p role="alert" className="mb-4 text-red-700 dark:text-red-400">{actionError} Refresh the list and try again.</p>}
      {items.data?.length === 0 && <p>No items yet. Add something you don't want to run out of.</p>}

      <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {sortByUrgency(items.data ?? []).map((item) => (
          <ItemCard
            key={item.id}
            item={item}
            busy={markOut.isPending}
            onBought={() => setRestocking(item)}
            onOut={() => markOut.mutate({ id: item.id })}
            onEdit={() => setEditing(item)}
          />
        ))}
      </ul>

      {editing === "new" && (
        <ItemForm
          pending={create.isPending}
          serverError={create.error?.message}
          onSave={(values) => create.mutate(values)}
          onClose={closeForm}
        />
      )}
      {editing && editing !== "new" && (
        <ItemForm
          item={editing}
          pending={update.isPending}
          serverError={update.error?.message}
          onSave={(values) => update.mutate({ id: editing.id, ...values })}
          onRemove={() => removeItem(editing)}
          onClose={closeForm}
        />
      )}
      {restocking && (
        <RestockDialog
          item={restocking}
          pending={restock.isPending}
          serverError={restock.error?.message}
          onSave={(quantity) => restock.mutate({ itemId: restocking.id, quantity })}
          onClose={closeRestock}
        />
      )}
    </>
  );
};
