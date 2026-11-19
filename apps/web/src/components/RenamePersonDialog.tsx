import { useState, type SubmitEvent } from "react";
import { personInputSchema } from "@homer/shared";
import type { ListPerson } from "../trpc";
import { Dialog } from "./Dialog";
import { DialogActions } from "./DialogActions";
import { inputClass } from "./ui";
import { copy } from "../copy";

type Props = {
  person: ListPerson;
  pending: boolean;
  serverError?: string;
  onSave: (name: string) => void;
  onClose: () => void;
};

export const RenamePersonDialog = ({ person, pending, serverError, onSave, onClose }: Props) => {
  const [name, setName] = useState(person.name);
  const [error, setError] = useState<string>();

  const submit = (event: SubmitEvent) => {
    event.preventDefault();
    const parsed = personInputSchema.safeParse({ name });
    setError(parsed.success ? undefined : copy.people.blankName);
    if (parsed.success) onSave(parsed.data.name);
  };

  return (
    <Dialog title={copy.people.renameLabel(person.name)} onClose={onClose}>
      <form onSubmit={submit} className="grid gap-4">
        <label className="grid gap-1">
          <span>{copy.people.nameLabel}</span>
          <input className={inputClass} value={name} onChange={(event) => setName(event.target.value)} autoFocus />
        </label>
        <DialogActions pending={pending} error={error ?? serverError} onCancel={onClose} />
      </form>
    </Dialog>
  );
};
