import type { ArchivedItem } from "../trpc";
import { Dialog } from "./Dialog";
import { primaryButton, secondaryButton } from "./ui";
import { copy } from "../copy";

type Props = {
  archived: ArchivedItem;
  pending: boolean;
  serverError?: string;
  onRestore: () => void;
  onCreateNew: () => void;
  onClose: () => void;
};

export const RestoreChoiceDialog = ({ archived, pending, serverError, onRestore, onCreateNew, onClose }: Props) => (
  <Dialog title={copy.restoreChoice.title(archived.name)} onClose={onClose}>
    <p className="mb-4">{copy.restoreChoice.explanation}</p>
    {serverError && <p role="alert" className="mb-4 text-late">{serverError}</p>}
    <div className="grid gap-3">
      <button type="button" className={primaryButton} onClick={onRestore} disabled={pending} autoFocus>
        {copy.restoreChoice.restore(archived.name)}
      </button>
      <button type="button" className={secondaryButton} onClick={onCreateNew} disabled={pending}>
        {copy.restoreChoice.startNew}
      </button>
      <button type="button" className={secondaryButton} onClick={onClose}>{copy.common.cancel}</button>
    </div>
  </Dialog>
);
