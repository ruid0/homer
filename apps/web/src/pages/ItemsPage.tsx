import { useState } from "react";
import type { ItemInput } from "@homer/shared";
import { ItemCard } from "../components/ItemCard";
import { ItemForm } from "../components/ItemForm";
import { RestockDialog } from "../components/RestockDialog";
import { RestoreChoiceDialog } from "../components/RestoreChoiceDialog";
import { primaryButton } from "../components/ui";
import { sortByUrgency } from "../lib/itemText";
import { trpc, type ArchivedItem, type ListItem } from "../trpc";
import { copy } from "../copy";

type Editing = ListItem | "new" | null;
type Choice = { values: ItemInput; archived: ArchivedItem };

export const ItemsPage = () => {
  const utils = trpc.useUtils();
  const items = trpc.inventory.list.useQuery();
  const groceries = trpc.groceries.list.useQuery();
  const listedIds = new Set((groceries.data ?? []).flatMap((entry) => (entry.itemId === null ? [] : [entry.itemId])));
  const [editing, setEditing] = useState<Editing>(null);
  const [restocking, setRestocking] = useState<ListItem | null>(null);
  const [choice, setChoice] = useState<Choice | null>(null);

  const done = () => {
    setEditing(null);
    setRestocking(null);
    setChoice(null);
    return Promise.all([utils.inventory.list.invalidate(), utils.groceries.list.invalidate()]);
  };

  const create = trpc.inventory.create.useMutation({ onSuccess: done });
  const update = trpc.inventory.update.useMutation({ onSuccess: done });
  const archive = trpc.inventory.archive.useMutation({ onSuccess: done });
  const restock = trpc.inventory.restock.useMutation({ onSuccess: done });
  const markOut = trpc.inventory.markOut.useMutation({ onSuccess: done });
  const restore = trpc.inventory.restore.useMutation({ onSuccess: done });

  const submitNew = async (values: ItemInput) => {
    const archived = await utils.inventory.findArchived.fetch({ name: values.name }).catch(() => null);
    if (archived) setChoice({ values, archived });
    else create.mutate(values);
  };

  const closeChoice = () => {
    restore.reset();
    setChoice(null);
  };

  const removeItem = (item: ListItem) => {
    if (window.confirm(copy.items.confirmRemove(item.name))) archive.mutate({ id: item.id });
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
        <h1 className="text-page font-semibold">{copy.items.title}</h1>
        <button type="button" className={primaryButton} onClick={() => setEditing("new")}>{copy.items.addItem}</button>
      </header>

      {items.isPending && <p>{copy.items.loading}</p>}
      {items.error && <p role="alert">{copy.items.loadFailed}</p>}
      {actionError && <p role="alert" className="mb-4 text-late">{copy.items.actionFailed(actionError)}</p>}
      {items.data?.length === 0 && <p>{copy.items.empty}</p>}

      <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {sortByUrgency(items.data ?? []).map((item) => (
          <ItemCard
            key={item.id}
            item={item}
            busy={markOut.isPending}
            onList={listedIds.has(item.id)}
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
          onSave={submitNew}
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
      {choice && (
        <RestoreChoiceDialog
          archived={choice.archived}
          pending={restore.isPending || create.isPending}
          serverError={restore.error?.message}
          onRestore={() => restore.mutate({ ...choice.values, id: choice.archived.id, name: choice.archived.name })}
          onCreateNew={() => {
            create.mutate(choice.values);
            setChoice(null);
          }}
          onClose={closeChoice}
        />
      )}
      {restocking && (
        <RestockDialog
          name={restocking.name}
          unit={restocking.unit}
          initialQuantity={restocking.usualRestock ?? 1}
          pending={restock.isPending}
          serverError={restock.error?.message}
          onSave={(quantity) => restock.mutate({ itemId: restocking.id, quantity })}
          onClose={closeRestock}
        />
      )}
    </>
  );
};
