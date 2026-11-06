import { useEffect, useRef, useState } from "react";
import { copy } from "../copy";
import { quietButton, secondaryButton } from "./ui";

type Props = { pending: boolean; onRemove: () => void };

// "Remove item", then a question before anything is removed. Focus follows the control the person just used.
export const ConfirmRemove = ({ pending, onRemove }: Props) => {
  const [confirming, setConfirming] = useState(false);
  const asked = useRef(false);
  const removeButton = useRef<HTMLButtonElement>(null);
  const keepButton = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!asked.current) return;
    (confirming ? keepButton : removeButton).current?.focus();
  }, [confirming]);

  const change = (next: boolean) => {
    asked.current = true;
    setConfirming(next);
  };

  if (!confirming) {
    return (
      <button ref={removeButton} type="button" className={`${quietButton} justify-self-start`} onClick={() => change(true)}>
        {copy.maintenance.remove}
      </button>
    );
  }
  return (
    <div className="grid gap-2" role="group" aria-label={copy.maintenance.remove}>
      <p>{copy.maintenance.confirmRemove}</p>
      <div className="flex gap-2">
        <button type="button" className={secondaryButton} disabled={pending} onClick={onRemove}>{copy.maintenance.confirmYes}</button>
        <button ref={keepButton} type="button" className={quietButton} onClick={() => change(false)}>{copy.maintenance.keep}</button>
      </div>
    </div>
  );
};
