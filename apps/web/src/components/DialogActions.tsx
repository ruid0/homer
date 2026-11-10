import type { ReactNode } from "react";
import { copy } from "../copy";
import { primaryButton, secondaryButton } from "./ui";

type Props = { pending?: boolean; error?: string; onCancel: () => void; children?: ReactNode };

// Cancel and Save stay at the bottom edge of the dialog while the fields above scroll, so Save is never out of reach.
// The negative margins pull the row over the dialog's own padding so it sits flush with the edge, and the negative bottom offset
// lets it stick there (a sticky row otherwise stops at the padding's inner edge).
// An error sits in this row too, so it is seen next to the button that caused it.
export const DialogActions = ({ pending = false, error, onCancel, children }: Props) => (
  <div className="sticky -bottom-5 z-10 -mx-5 -mb-5 grid gap-2 border-t border-line bg-card px-5 pt-3 pb-3 max-md:-bottom-[max(1.25rem,env(safe-area-inset-bottom))] max-md:-mb-[max(1.25rem,env(safe-area-inset-bottom))] max-md:pb-[max(0.75rem,env(safe-area-inset-bottom))]">
    {error && <p role="alert" className="text-late">{error}</p>}
    {children}
    <div className="flex justify-end gap-3">
      <button type="button" className={secondaryButton} onClick={onCancel}>{copy.common.cancel}</button>
      <button type="submit" className={primaryButton} disabled={pending}>{copy.common.save}</button>
    </div>
  </div>
);
