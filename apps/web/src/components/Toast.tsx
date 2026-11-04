import { useEffect, useRef } from "react";
import { secondaryButton } from "./ui";
import { copy } from "../copy";

const SHOW_FOR_MS = 5000;

type Props = { message: string; onClose: () => void };

export const Toast = ({ message, onClose }: Props) => {
  // Only a new message restarts the timer, not a parent re-render with a new onClose.
  const close = useRef(onClose);
  close.current = onClose;

  useEffect(() => {
    const timer = window.setTimeout(() => close.current(), SHOW_FOR_MS);
    return () => window.clearTimeout(timer);
  }, [message]);

  return (
    <div
      role="status"
      className="fixed bottom-24 left-1/2 z-20 flex w-[calc(100%-2rem)] max-w-xl -translate-x-1/2 items-center justify-between gap-3 rounded-xl bg-primary py-2 pl-4 pr-2 text-on-primary shadow-lg md:bottom-6"
    >
      <span className="font-medium">{message}</span>
      <button type="button" className={`${secondaryButton} border-on-primary`} onClick={onClose}>
        {copy.home.dismiss}
      </button>
    </div>
  );
};
