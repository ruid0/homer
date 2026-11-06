import { useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { addDays } from "@homer/shared";
import { RoutineGrid } from "../components/RoutineGrid";
import { RoutineRowDialog } from "../components/RoutineRowDialog";
import { primaryButton, secondaryButton } from "../components/ui";
import { copy } from "../copy";
import { canGoEarlier, canGoLater, mondayOf, takeOneOff, tapCount, weekRange } from "../lib/routineWeek";
import { useToday } from "../lib/useToday";
import { trpc } from "../trpc";

type Editing = "new" | number | null;

const RoutineView = ({ personId, name }: { personId: number; name: string }) => {
  const today = useToday();
  const utils = trpc.useUtils();
  const [weekStart, setWeekStart] = useState<string | null>(null);
  const [editing, setEditing] = useState<Editing>(null);
  const [problem, setProblem] = useState<string>();

  const start = weekStart ?? mondayOf(today);
  const input = { personId, today, weekOf: start };
  const week = trpc.routines.week.useQuery(input);
  const refresh = () => utils.routines.week.invalidate();

  const fail = (error: { message: string }) => {
    setProblem(error.message);
    return refresh();
  };
  const resetDialogErrors = () => [addItem, updateItem, removeItem, moveItem].forEach((mutation) => mutation.reset());
  const closed = () => {
    resetDialogErrors();
    setEditing(null);
    return refresh();
  };

  // Counts taps still being saved. Refetching while one is in flight would put an older count back on screen.
  const saving = useRef(0);
  const setCount = trpc.routines.setCount.useMutation({
    onError: fail,
    onSettled: () => {
      saving.current -= 1;
      return saving.current === 0 ? refresh() : undefined;
    },
  });
  const addItem = trpc.routines.addItem.useMutation({ onSuccess: closed });
  const updateItem = trpc.routines.updateItem.useMutation({ onSuccess: closed });
  const removeItem = trpc.routines.removeItem.useMutation({ onSuccess: closed, onError: closed });
  const moveItem = trpc.routines.moveItem.useMutation({ onSuccess: refresh, onError: refresh });

  const items = week.data?.items ?? [];
  const editingRow = typeof editing === "number" ? (items.find((item) => item.id === editing) ?? null) : null;
  const rowIndex = editingRow ? items.findIndex((item) => item.id === editingRow.id) : -1;
  const mutationError = addItem.error ?? updateItem.error ?? removeItem.error ?? moveItem.error;

  const change = (itemId: number, day: string, step: 1 | -1) => {
    const data = utils.routines.week.getData(input);
    const item = data?.items.find((candidate) => candidate.id === itemId);
    const index = data?.days.indexOf(day) ?? -1;
    if (!data || !item || index < 0) return;
    const done = item.counts[index] ?? 0;
    const count = step === 1 ? tapCount(done, item.targetPerDay) : takeOneOff(done);
    if (count === done) return;
    setProblem(undefined);
    void utils.routines.week.cancel(input);
    utils.routines.week.setData(input, {
      ...data,
      items: data.items.map((row) => (row.id === itemId ? { ...row, counts: row.counts.map((c, i) => (i === index ? count : c)) } : row)),
    });
    saving.current += 1;
    setCount.mutate({ itemId, date: day, today, count });
  };

  const closeDialog = () => {
    resetDialogErrors();
    setEditing(null);
  };

  const save = (rowName: string, targetPerDay: number) =>
    editingRow
      ? updateItem.mutate({ id: editingRow.id, name: rowName, targetPerDay })
      : addItem.mutate({ personId, name: rowName, targetPerDay });

  return (
    <>
      <Link to="/people" className="mb-2 inline-block text-muted underline">{copy.routine.back}</Link>
      <h1 className="mb-1 text-page font-semibold">{copy.routine.title(name)}</h1>
      <p className="mb-4 text-muted">{copy.routine.visibleToAll}</p>

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <button
          type="button"
          className={secondaryButton}
          disabled={!canGoEarlier(start, today)}
          onClick={() => setWeekStart(addDays(start, -7))}
        >
          {copy.routine.previousWeek}
        </button>
        <p className="min-w-32 text-center font-medium" role="status" aria-label={copy.routine.weekLabel}>
          {week.data ? weekRange(week.data.days) : ""}
        </p>
        <button
          type="button"
          className={secondaryButton}
          disabled={!canGoLater(start, today)}
          onClick={() => setWeekStart(addDays(start, 7))}
        >
          {copy.routine.nextWeek}
        </button>
        {start !== mondayOf(today) && (
          <button type="button" className={secondaryButton} onClick={() => setWeekStart(null)}>{copy.routine.thisWeek}</button>
        )}
        <button type="button" className={`${primaryButton} ml-auto`} onClick={() => setEditing("new")}>{copy.routine.addRow}</button>
      </div>

      {week.isPending && <p>{copy.routine.loading}</p>}
      {week.error && <p role="alert" className="text-late">{copy.routine.loadFailed}</p>}
      {problem && <p role="alert" className="mb-4 text-late">{problem}</p>}
      {week.data && items.length === 0 && <p>{copy.routine.empty}</p>}
      {week.data && items.length > 0 && <RoutineGrid week={week.data} today={today} onChange={change} onEdit={setEditing} />}

      {editing !== null && (editing === "new" || editingRow) && (
        <RoutineRowDialog
          key={editing}
          row={editingRow}
          pending={addItem.isPending || updateItem.isPending || removeItem.isPending || moveItem.isPending}
          serverError={mutationError?.message}
          canMoveUp={rowIndex > 0}
          canMoveDown={rowIndex >= 0 && rowIndex < items.length - 1}
          onSave={save}
          onMove={(direction) => editingRow && moveItem.mutate({ id: editingRow.id, direction })}
          onRemove={() => editingRow && removeItem.mutate({ id: editingRow.id })}
          onClose={closeDialog}
        />
      )}
    </>
  );
};

export const RoutinePage = () => {
  const params = useParams();
  const people = trpc.people.list.useQuery();
  const personId = Number(params.id);
  const person = people.data?.find((candidate) => candidate.id === personId);

  if (people.isPending) return <p>{copy.routine.loading}</p>;
  if (people.error) return <p role="alert" className="text-late">{copy.routine.loadFailed}</p>;
  if (!person) return <p role="alert" className="text-late">{copy.routine.personMissing}</p>;
  return <RoutineView personId={person.id} name={person.name} />;
};
