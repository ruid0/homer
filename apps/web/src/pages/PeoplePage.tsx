import { useState, type SubmitEvent } from "react";
import { RenamePersonDialog } from "../components/RenamePersonDialog";
import { inputClass, primaryButton, secondaryButton } from "../components/ui";
import { copy } from "../copy";
import { trpc, type ListPerson } from "../trpc";

export const PeoplePage = () => {
  const utils = trpc.useUtils();
  const people = trpc.people.list.useQuery();
  const [name, setName] = useState("");
  const [blank, setBlank] = useState(false);
  const [renaming, setRenaming] = useState<ListPerson | null>(null);

  const done = () => {
    setRenaming(null);
    return utils.people.list.invalidate();
  };

  const add = trpc.people.add.useMutation({
    onSuccess: () => {
      setName("");
      return done();
    },
  });
  const refresh = () => utils.people.list.invalidate();
  const rename = trpc.people.rename.useMutation({ onSuccess: done, onError: refresh });
  const archive = trpc.people.archive.useMutation({ onSuccess: done, onError: refresh });

  const submit = (event: SubmitEvent) => {
    event.preventDefault();
    setBlank(!name.trim());
    if (name.trim()) add.mutate({ name });
  };

  const remove = (person: ListPerson) => {
    if (window.confirm(copy.people.confirmRemove(person.name))) archive.mutate({ id: person.id });
  };

  const closeRename = () => {
    rename.reset();
    setRenaming(null);
  };

  return (
    <>
      <h1 className="mb-4 text-2xl font-semibold">{copy.people.title}</h1>

      <form onSubmit={submit} className="mb-4 flex items-end gap-3">
        <label className="grid flex-1 gap-1">
          <span>{copy.people.addLabel}</span>
          <input className={inputClass} value={name} onChange={(event) => {
              setName(event.target.value);
              setBlank(false);
              add.reset();
            }}
          />
        </label>
        <button type="submit" className={primaryButton} disabled={add.isPending}>{copy.people.add}</button>
      </form>

      {people.isPending && <p>{copy.people.loading}</p>}
      {people.error && <p role="alert" className="text-red-700 dark:text-red-400">{copy.people.loadFailed}</p>}
      {(blank || add.error) && (
        <p role="alert" className="mb-4 text-red-700 dark:text-red-400">
          {blank ? copy.people.blankName : add.error?.message}
        </p>
      )}
      {archive.error && <p role="alert" className="mb-4 text-red-700 dark:text-red-400">{archive.error.message}</p>}
      {people.data?.length === 0 && <p>{copy.people.empty}</p>}

      <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {(people.data ?? []).map((person) => (
          <li
            key={person.id}
            className="flex items-center justify-between gap-3 rounded-xl border border-stone-200 bg-white p-4 dark:border-stone-800 dark:bg-stone-900"
          >
            <h2 className="text-lg font-semibold">{person.name}</h2>
            <div className="flex gap-3">
              <button
                type="button"
                className={secondaryButton}
                onClick={() => setRenaming(person)}
                aria-label={copy.people.renameLabel(person.name)}
              >
                {copy.people.rename}
              </button>
              <button
                type="button"
                className={secondaryButton}
                onClick={() => remove(person)}
                disabled={archive.isPending}
                aria-label={copy.people.removeLabel(person.name)}
              >
                {copy.people.remove}
              </button>
            </div>
          </li>
        ))}
      </ul>

      {renaming && (
        <RenamePersonDialog
          person={renaming}
          pending={rename.isPending}
          serverError={rename.error?.message}
          onSave={(newName) => rename.mutate({ id: renaming.id, name: newName })}
          onClose={closeRename}
        />
      )}
    </>
  );
};
