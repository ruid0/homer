import { useEffect, useRef } from "react";
import { secondaryButton } from "./ui";
import { copy } from "../copy";

const SHOW_FOR_MS = 5000;
// A toast with an action (Undo) is the only way back, so it stays longer.
const SHOW_WITH_ACTION_FOR_MS = 10_000;

type Props = { message: string; onClose: () => void; action?: { label: string; onClick: () => void } };

export const Toast = ({ message, onClose, action }: Props) => {
  // Only a new message restarts the timer, not a parent re-render with a new onClose.
  const hasAction = action !== undefined;
  const close = useRef(onClose);
  close.current = onClose;

  useEffect(() => {
    const timer = window.setTimeout(() => close.current(), hasAction ? SHOW_WITH_ACTION_FOR_MS : SHOW_FOR_MS);
    return () => window.clearTimeout(timer);
  }, [message, hasAction]);

  return (
    <div
      role="status"
      className="fixed bottom-24 left-1/2 z-20 flex w-[calc(100%-2rem)] max-w-xl -translate-x-1/2 items-center justify-between gap-3 rounded-xl bg-primary py-2 pl-4 pr-2 text-on-primary shadow-lg md:bottom-6"
    >
      <span className="font-medium">{message}</span>
      <div className="flex gap-2">
        {action && (
          <button type="button" className={`${secondaryButton} border-on-primary`} onClick={action.onClick}>
            {action.label}
          </button>
        )}
        <button type="button" className={`${secondaryButton} border-on-primary`} onClick={onClose}>
          {copy.home.dismiss}
        </button>
      </div>
    </div>
  );
};
