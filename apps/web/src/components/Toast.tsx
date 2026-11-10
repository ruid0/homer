import { useEffect, useRef, useState } from "react";
import { secondaryButton } from "./ui";
import { copy } from "../copy";

const SHOW_FOR_MS = 5000;
// A toast with an action (Undo) is the only way back, so it stays longer.
const SHOW_WITH_ACTION_FOR_MS = 15_000;
// Holding pauses the toast, but not for ever: a pointer left resting on it must not keep it up all day.
const MOST_SHOWN_FOR_MS = 60_000;

type Props = { message: string; onClose: () => void; action?: { label: string; onClick: () => void } };

export const Toast = ({ message, onClose, action }: Props) => {
  // Only a new message restarts the timer, not a parent re-render with a new onClose.
  const hasAction = action !== undefined;
  const close = useRef(onClose);
  close.current = onClose;
  // The clock stops while a finger or a pointer is on the toast, and starts again from full when it leaves.
  const [held, setHeld] = useState(false);

  useEffect(() => {
    if (held) return;
    const timer = window.setTimeout(() => close.current(), hasAction ? SHOW_WITH_ACTION_FOR_MS : SHOW_FOR_MS);
    return () => window.clearTimeout(timer);
  }, [message, hasAction, held]);

  useEffect(() => {
    const timer = window.setTimeout(() => close.current(), MOST_SHOWN_FOR_MS);
    return () => window.clearTimeout(timer);
  }, [message]);

  return (
    <div
      role="status"
      onPointerEnter={() => setHeld(true)}
      onPointerLeave={() => setHeld(false)}
      onFocus={() => setHeld(true)}
      onBlur={() => setHeld(false)}
      className="fixed bottom-24 left-1/2 z-20 flex w-[calc(100%-2rem)] max-w-xl -translate-x-1/2 items-center justify-between gap-3 rounded-xl bg-primary py-2 pl-4 pr-2 text-on-primary shadow-lg animate-toast-in md:bottom-6"
    >
      <span className="font-medium">{message}</span>
      <div className="flex gap-2">
        {action && (
          <button type="button" className={`${secondaryButton} border-on-primary`} onClick={action.onClick}>
            {action.label}
          </button>
        )}
        {/* Quiet, so the one useful action (Undo) stands out. */}
        <button
          type="button"
          className="min-h-11 rounded-lg px-3 text-base font-medium text-on-primary underline hover:opacity-85 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-on-primary"
          onClick={onClose}
        >
          {copy.home.dismiss}
        </button>
      </div>
    </div>
  );
};
