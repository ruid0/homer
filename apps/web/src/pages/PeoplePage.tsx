import { ErrorToast } from "../components/ErrorToast";
import { useState, type SubmitEvent } from "react";
import { PageHeader } from "../components/PageHeader";
import { Link } from "react-router-dom";
import { ListCard } from "../components/ListCard";
import { Row } from "../components/Row";
import { RenamePersonDialog } from "../components/RenamePersonDialog";
import { cx, inputClass, primaryButton, rowAction, secondaryButton } from "../components/ui";
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
    <div className="mx-auto max-w-3xl">
      <PageHeader title={copy.people.title} />

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
        <button type="submit" className={primaryButton} disabled={add.isPending}>
          {copy.people.add}
        </button>
      </form>

      {people.isPending && <p>{copy.people.loading}</p>}
      {people.error && (
        <p role="alert" className="text-late">
          {copy.people.loadFailed}
        </p>
      )}
      {blank && (
        <p role="alert" className="mb-4 text-late">
          {copy.people.blankName}
        </p>
      )}
      <ErrorToast message={add.error?.message} />
      {people.data?.length === 0 && <p>{copy.people.empty}</p>}

      {people.data && people.data.length > 0 && (
        <ListCard>
          {people.data.map((person) => (
            <Row
              key={person.id}
              title={person.name}
              onOpen={() => setRenaming(person)}
              openLabel={copy.people.renameLabel(person.name)}
              action={
                <Link
                  to={`/people/${person.id}/routine`}
                  className={cx(secondaryButton, rowAction, "inline-flex items-center justify-center")}
                  aria-label={copy.people.routineLabel(person.name)}
                >
                  {copy.people.routine}
                </Link>
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
    </div>
  );
};
