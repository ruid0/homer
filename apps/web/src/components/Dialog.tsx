import { useEffect, useRef, type ReactNode } from "react";

type Props = { title: string; onClose: () => void; children: ReactNode };

export const Dialog = ({ title, onClose, children }: Props) => {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    if (ref.current && !ref.current.open) ref.current.showModal();
  }, []);

  return (
    <dialog
      ref={ref}
      onClose={onClose}
      className="m-auto max-h-[calc(100dvh-2rem)] w-[min(28rem,calc(100vw-2rem))] overflow-y-auto rounded-xl bg-white p-5 text-inherit backdrop:bg-black/50 dark:bg-stone-900"
    >
      <h2 className="mb-4 text-xl font-semibold">{title}</h2>
      {children}
    </dialog>
  );
};
