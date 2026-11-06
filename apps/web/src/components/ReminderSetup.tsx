import { useEffect, useState } from "react";
import { copy } from "../copy";
import type { ReminderState } from "../lib/reminderText";
import { trpc } from "../trpc";
import { secondaryButton } from "./ui";

type Props = { personId: number; state: ReminderState; onTurnedOn: () => void };

// The topic is a secret: it is fetched only when asked for, and not kept once hidden.
export const ReminderSetup = ({ personId, state, onTurnedOn }: Props) => {
  const [shown, setShown] = useState(false);
  const setup = trpc.people.reminderSetup.useMutation({
    onSuccess: () => {
      setShown(true);
      onTurnedOn();
    },
  });

  // Leaving the page must not leave the topic in the query cache.
  const { reset } = setup;
  useEffect(() => reset, [reset]);

  const hide = () => {
    setShown(false);
    setup.reset();
  };

  return (
    <section className="mt-6 grid gap-2 rounded-xl border border-line p-4" aria-labelledby="reminder-setup">
      <h2 id="reminder-setup" className="font-semibold">{copy.reminders.setupTitle}</h2>
      {state === "notificationsOff" && <p>{copy.reminders.notificationsOffSetup}</p>}
      {state === "failed" && <p role="alert" className="text-late">{copy.reminders.statusFailed}</p>}
      {(state === "needsSetup" || state === "ready") && !shown && (
        <button
          type="button"
          className={`${secondaryButton} justify-self-start`}
          disabled={setup.isPending}
          onClick={() => setup.mutate({ id: personId })}
        >
          {state === "ready" ? copy.reminders.showSetup : copy.reminders.turnOn}
        </button>
      )}
      {setup.error && <p role="alert" className="text-late">{setup.error.message}</p>}
      {shown && setup.data && (
        <div className="grid gap-2">
          <p>{copy.reminders.setupSteps(setup.data.server)}</p>
          <p>
            <span className="text-muted">{copy.reminders.serverLabel}: </span>
            <code className="break-all">{setup.data.server}</code>
          </p>
          <p>
            <span className="text-muted">{copy.reminders.topicLabel}: </span>
            <code className="break-all">{setup.data.topic}</code>
          </p>
          <button type="button" className={`${secondaryButton} justify-self-start`} onClick={hide}>{copy.reminders.hideSetup}</button>
        </div>
      )}
    </section>
  );
};
