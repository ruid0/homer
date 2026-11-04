import { useState, type SubmitEvent } from "react";
import { ListCard } from "../components/ListCard";
import { ListRow } from "../components/ListRow";
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
  const rename = trpc.people.rename.useMutation({ onSuccess: done, onError: () => utils.people.list.invalidate() });

  const submit = (event: SubmitEvent) => {
    event.preventDefault();
    setBlank(!name.trim());
    if (name.trim()) add.mutate({ name });
  };

  const closeRename = () => {
    rename.reset();
    setRenaming(null);
  };

  return (
    <>
      <h1 className="mb-4 text-page font-semibold">{copy.people.title}</h1>

      <form onSubmit={submit} className="mb-4 flex items-end gap-3">
        <label className="grid flex-1 gap-1">
          <span>{copy.people.addLabel}</span>
          <input
            className={inputClass}
            value={name}
            onChange={(event) => {
              setName(event.target.value);
              setBlank(false);
              add.reset();
            }}
          />
        </label>
        <button type="submit" className={primaryButton} disabled={add.isPending}>{copy.people.add}</button>
      </form>

      {people.isPending && <p>{copy.people.loading}</p>}
      {people.error && <p role="alert" className="text-late">{copy.people.loadFailed}</p>}
      {(blank || add.error) && (
        <p role="alert" className="mb-4 text-late">
          {blank ? copy.people.blankName : add.error?.message}
        </p>
      )}
      {people.data?.length === 0 && <p>{copy.people.empty}</p>}

      {people.data && people.data.length > 0 && (
        <ListCard>
          {people.data.map((person) => (
            <ListRow
              key={person.id}
              title={person.name}
              details={[]}
              actions={
                <button
                  type="button"
                  className={secondaryButton}
                  onClick={() => setRenaming(person)}
                  aria-label={copy.people.renameLabel(person.name)}
                >
                  {copy.people.rename}
                </button>
              }
            />
          ))}
        </ListCard>
      )}

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
