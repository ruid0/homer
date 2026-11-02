import type { ArchivedItem } from "../trpc";
import { Dialog } from "./Dialog";
import { primaryButton, secondaryButton } from "./ui";

type Props = {
  archived: ArchivedItem;
  pending: boolean;
  serverError?: string;
  onRestore: () => void;
  onCreateNew: () => void;
  onClose: () => void;
};

export const RestoreChoiceDialog = ({ archived, pending, serverError, onRestore, onCreateNew, onClose }: Props) => (
  <Dialog title={`${archived.name} was removed before`} onClose={onClose}>
    <p className="mb-4">
      Restore it to get its restock history back, or start a new item with an empty history.
    </p>
    {serverError && <p role="alert" className="mb-4 text-red-700 dark:text-red-400">{serverError}</p>}
    <div className="grid gap-3">
      <button type="button" className={primaryButton} onClick={onRestore} disabled={pending} autoFocus>
        {`Restore ${archived.name}`}
      </button>
      <button type="button" className={secondaryButton} onClick={onCreateNew} disabled={pending}>
        Start a new item
      </button>
      <button type="button" className={secondaryButton} onClick={onClose}>Cancel</button>
    </div>
  </Dialog>
);
