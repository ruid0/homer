import { useEffect, useRef, useState, type ReactNode } from "react";

type Props = { title: string; onClose: () => void; children: ReactNode };

export const Dialog = ({ title, onClose, children }: Props) => {
  const ref = useRef<HTMLDialogElement>(null);
  // On a phone the dialog is a sheet that slides up from the bottom edge; from md up it is a centred card.
  // Taken while rendering, before this dialog or any dialog it replaces has touched focus.
  const [opener] = useState(() => document.activeElement);

  useEffect(() => {
    if (ref.current && !ref.current.open) ref.current.showModal();
    // Closing removes the dialog, so focus goes back to the control that opened it instead of the top of the page.
    // It waits a tick: while the dialog is still open, everything behind it cannot take focus.
    // If that control is gone (its row was removed), focus goes to the page content.
    return () => {
      window.setTimeout(() => {
        const target = opener instanceof HTMLElement && opener.isConnected ? opener : document.querySelector<HTMLElement>("main");
        target?.focus();
      }, 0);
    };
  }, [opener]);

  return (
    <dialog
      ref={ref}
      onClose={onClose}
      className="m-auto max-h-[calc(100dvh-2rem)] w-[min(28rem,calc(100vw-2rem))] overflow-y-auto rounded-xl bg-card p-5 text-inherit backdrop:animate-backdrop-in backdrop:bg-scrim max-md:mb-0 max-md:w-full max-md:max-w-none max-md:animate-sheet-up max-md:rounded-b-none max-md:rounded-t-2xl max-md:pb-[max(1.25rem,env(safe-area-inset-bottom))] md:animate-dialog-in"
    >
      <h2 className="mb-4 text-section font-semibold">{title}</h2>
      {children}
    </dialog>
  );
};
