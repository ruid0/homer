import { useState } from "react";
import { ErrorToast } from "./ErrorToast";
import type { ItemInput } from "@homer/shared";
import { ItemRow } from "./ItemRow";
import { ItemForm } from "./ItemForm";
import { ListCard } from "./ListCard";
import { RestockDialog } from "./RestockDialog";
import { RestoreChoiceDialog } from "./RestoreChoiceDialog";
import { primaryButton } from "./ui";
import { sortByUrgency } from "../lib/itemText";
import { trpc, type ArchivedItem, type ListItem } from "../trpc";
import { copy } from "../copy";

// The item an Add to list call is for. A call by name (from the To buy form) is not for a row.
const addingId = (variables: { itemId: number } | { text: string } | undefined) =>
  variables && "itemId" in variables ? variables.itemId : null;

type Editing = ListItem | "new" | null;
type Choice = { values: ItemInput; archived: ArchivedItem };

export const StockEverything = () => {
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
  const addToList = trpc.groceries.add.useMutation({ onSuccess: done });

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
    markOut.reset();
    setEditing(null);
  };

  const closeRestock = () => {
    restock.reset();
    setRestocking(null);
  };

  return (
    <>
      <div className="mb-4 flex justify-end">
        <button type="button" className={primaryButton} onClick={() => setEditing("new")}>
          {copy.items.addItem}
        </button>
      </div>

      {items.isPending && <p>{copy.items.loading}</p>}
      {items.error && <p role="alert">{copy.items.loadFailed}</p>}
      <ErrorToast message={addToList.error?.message} />
      {items.data?.length === 0 && <p>{copy.items.empty}</p>}

      {items.data && items.data.length > 0 && (
        <ListCard>
          {sortByUrgency(items.data).map((item) => (
            <ItemRow
              key={item.id}
              item={item}
              onList={listedIds.has(item.id)}
              onAddToList={() => addToList.mutate({ itemId: item.id })}
              adding={addToList.isPending && addingId(addToList.variables) === item.id}
              onEdit={() => setEditing(item)}
            />
          ))}
        </ListCard>
      )}

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
          // Removing is only reachable from this dialog, so its error shows here, not on the page behind it.
          serverError={
            update.error?.message ?? (archive.error ? copy.items.actionFailed(archive.error.message) : undefined)
          }
          onSave={(values) => update.mutate({ id: editing.id, ...values })}
          onRemove={() => removeItem(editing)}
          onBought={() => {
            setRestocking(editing);
            setEditing(null);
          }}
          onOut={() => markOut.mutate({ id: editing.id })}
          outPending={markOut.isPending}
          outError={markOut.error?.message}
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
