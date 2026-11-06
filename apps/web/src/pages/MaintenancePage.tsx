import { keepPreviousData } from "@tanstack/react-query";
import { useRef, useState } from "react";
import { ListCard } from "../components/ListCard";
import { MaintenanceDialog, type MaintenanceForm } from "../components/MaintenanceDialog";
import { MaintenanceRow } from "../components/MaintenanceRow";
import { Toast } from "../components/Toast";
import { primaryButton } from "../components/ui";
import { copy } from "../copy";
import { needsDoing } from "../lib/maintenanceText";
import { useFocusNextDone } from "../lib/useFocusNextDone";
import { useMarkDone } from "../lib/useMarkDone";
import { useToday } from "../lib/useToday";
import { trpc, type MaintenanceItem } from "../trpc";

type Editing = "new" | number | null;

export const MaintenancePage = () => {
  const today = useToday();
  const utils = trpc.useUtils();
  // keepPreviousData: at midnight the day changes, and the list stays on screen until the new answer arrives.
  const list = trpc.maintenance.list.useQuery({ today }, { placeholderData: keepPreviousData });
  const [editing, setEditing] = useState<Editing>(null);

  const refresh = () => utils.maintenance.list.invalidate();

  const add = trpc.maintenance.add.useMutation({ onSuccess: () => closed() });
  const update = trpc.maintenance.update.useMutation({ onSuccess: () => closed() });
  // A failed remove keeps the dialog open with the error. If the item is already gone the dialog goes away with the refresh.
  const remove = trpc.maintenance.remove.useMutation({ onSuccess: () => closed(), onError: refresh });
  const resetDialogErrors = () => [add, update, remove].forEach((mutation) => mutation.reset());
  const closed = () => {
    resetDialogErrors();
    setEditing(null);
    return refresh();
  };
  // Opening a dialog starts clean, so an old error never shows in a new one.
  const open = (next: Editing) => {
    resetDialogErrors();
    setEditing(next);
  };

  const listArea = useRef<HTMLDivElement>(null);
  const addButton = useRef<HTMLButtonElement>(null);
  const focusNextDone = useFocusNextDone(listArea, addButton);
  const { finish, takeBack, undoable, problem, busy, closeToast } = useMarkDone(today, focusNextDone);

  const items = list.data ?? [];
  const editingItem = typeof editing === "number" ? (items.find((item) => item.id === editing) ?? null) : null;
  const dialogError = add.error ?? update.error ?? remove.error;
  const takenNames = items.filter((item) => item.id !== editingItem?.id).map((item) => item.name);

  const save = (form: MaintenanceForm) =>
    editingItem
      ? update.mutate({ id: editingItem.id, name: form.name, every: form.every, unit: form.unit })
      : add.mutate({ ...form, today });

  const urgent = items.filter((item) => needsDoing(item.status));
  const later = items.filter((item) => !needsDoing(item.status));
  const rows = (group: MaintenanceItem[]) => (
    <ListCard>
      {group.map((item) => (
        <MaintenanceRow key={item.id} item={item} busy={busy} onDone={() => finish(item)} onEdit={() => open(item.id)} />
      ))}
    </ListCard>
  );

  return (
    <>
      <div className="mb-1 flex items-center justify-between gap-3">
        <h1 className="text-page font-semibold">{copy.maintenance.title}</h1>
        <button ref={addButton} type="button" className={primaryButton} onClick={() => open("new")}>{copy.maintenance.addItem}</button>
      </div>
      <p className="mb-4 text-muted">{copy.maintenance.visibleToAll}</p>

      {list.isPending && <p role="status">{copy.maintenance.loading}</p>}
      {list.error && <p role="alert" className="text-late">{copy.maintenance.loadFailed}</p>}
      {problem && <p role="alert" className="mb-4 text-late">{problem}</p>}
      {list.data && items.length === 0 && <p>{copy.maintenance.empty}</p>}

      {list.data && items.length > 0 && (
        <div ref={listArea} className="grid gap-6">
          <section aria-labelledby="needs-doing" className="grid gap-2">
            <h2 id="needs-doing" className="text-section font-semibold">{copy.maintenance.needsDoing}</h2>
            {urgent.length === 0 ? <p className="text-muted">{copy.maintenance.nothingDue}</p> : rows(urgent)}
          </section>
          {later.length > 0 && (
            <section aria-labelledby="later" className="grid gap-2">
              <h2 id="later" className="text-section font-semibold">{copy.maintenance.later}</h2>
              {rows(later)}
            </section>
          )}
        </div>
      )}

      {editing !== null && (editing === "new" || editingItem) && (
        <MaintenanceDialog
          key={editing}
          item={editingItem}
          today={today}
          takenNames={takenNames}
          pending={add.isPending || update.isPending || remove.isPending}
          serverError={dialogError?.message}
          onSave={save}
          onRemove={() => editingItem && remove.mutate({ id: editingItem.id })}
          onChanged={refresh}
          onClose={() => open(null)}
        />
      )}
      {undoable && (
        <Toast
          key={undoable.doneId}
          message={undoable.message}
          onClose={closeToast}
          action={{ label: copy.maintenance.undo, onClick: () => takeBack(undoable.doneId) }}
        />
      )}
    </>
  );
};
