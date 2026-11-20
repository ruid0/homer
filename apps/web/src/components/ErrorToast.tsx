import { useEffect, useState } from "react";
import { copy } from "../copy";
import { cx } from "./ui";

const SHOW_FOR_MS = 8000;

// A failed save or undo: red, at the bottom above the Undo toast (so it never covers the buttons at the top of the
// page), gone after a few
// seconds or on Dismiss. The clock stops while it is hovered or focused. A new message shows again; the message going
// back to empty
// (the next attempt) clears a dismissal.
export const ErrorToast = ({ message }: { message?: string | null }) => {
  const [dismissed, setDismissed] = useState(false);
  const [held, setHeld] = useState(false);

  useEffect(() => setDismissed(false), [message]);

  useEffect(() => {
    if (!message || held) return;
    const timer = window.setTimeout(() => setDismissed(true), SHOW_FOR_MS);
    return () => window.clearTimeout(timer);
  }, [message, held]);

  if (!message || dismissed) return null;
  return (
    <div
      role="alert"
      onPointerEnter={() => setHeld(true)}
      onPointerLeave={() => setHeld(false)}
      onFocus={() => setHeld(true)}
      onBlur={() => setHeld(false)}
      className={cx(
        "fixed bottom-48 left-1/2 z-30 flex w-[calc(100%-2rem)] max-w-xl -translate-x-1/2",
        "items-center justify-between gap-3 rounded-xl bg-late py-2 pl-4 pr-2 text-on-primary",
        "shadow-lg animate-toast-in md:bottom-24",
      )}
    >
      <span className="font-medium">{message}</span>
      <button
        type="button"
        className={cx(
          "min-h-11 shrink-0 rounded-lg px-3 text-base font-medium text-on-primary underline",
          "hover:opacity-85 focus-visible:outline-2 focus-visible:outline-offset-2",
          "focus-visible:outline-on-primary",
        )}
        onClick={() => setDismissed(true)}
      >
        {copy.home.dismiss}
      </button>
    </div>
  );
};
