import type { ReactNode } from "react";
import { copy } from "../copy";
import { primaryButton, secondaryButton } from "./ui";

type Props = {
  pending?: boolean;
  error?: string;
  onCancel: () => void;
  remove?: { label: string; onClick: () => void };
  children?: ReactNode;
};

// Pulled over the dialog's padding (negative margins) so it sits flush with the edge; the negative bottom offset is
// what lets it
// stick there, since a sticky row otherwise stops at the padding's inner edge.
export const DialogActions = ({ pending = false, error, onCancel, remove, children }: Props) => (
  <div className="sticky -bottom-5 z-10 -mx-5 -mb-5 grid gap-2 border-t border-line bg-card px-5 pt-3 pb-3 max-md:-bottom-[max(1.25rem,env(safe-area-inset-bottom))] max-md:-mb-[max(1.25rem,env(safe-area-inset-bottom))] max-md:pb-[max(0.75rem,env(safe-area-inset-bottom))]">
    {error && (
      <p role="alert" className="text-late">
        {error}
      </p>
    )}
    {children}
    <div className="flex flex-wrap justify-end gap-3">
      {remove && (
        <button type="button" className={`${secondaryButton} mr-auto`} onClick={remove.onClick}>
          {remove.label}
        </button>
      )}
      <button type="button" className={secondaryButton} onClick={onCancel}>
        {copy.common.cancel}
      </button>
      <button type="submit" className={primaryButton} disabled={pending}>
        {copy.common.save}
      </button>
    </div>
  </div>
);
