import { copy } from "../copy";
import type { ReminderState } from "../lib/reminderText";
import { cx } from "./ui";

// `count` is undefined until the reminders have loaded, so "none set" is not said too early.
type Props = { state: ReminderState; name: string; count: number | undefined };

// Whether reminders will go out for this person, said at the top of the page, not only in the box at the bottom.
export const ReminderStatus = ({ state, name, count }: Props) => {
  if (state === "loading" || state === "failed") return null;
  const on = state === "ready";
  const words = on
    ? count === undefined
      ? null
      : copy.reminders.statusReady(count)
    : state === "needsSetup"
      ? copy.reminders.statusNeedsSetup(name)
      : copy.reminders.statusNotificationsOff;
  return (
    <p className="mb-4 flex flex-wrap items-center gap-2" role="status" aria-label={copy.reminders.statusLabel}>
      <span
        className={cx(
          "rounded-full border px-3 text-meta font-semibold",
          on ? "border-ok text-ok" : "border-control text-muted",
        )}
      >
        {copy.reminders.statusLabel}: {on ? copy.reminders.statusOn : copy.reminders.statusOff}
      </span>
      {words && <span className="text-muted">{words}</span>}
    </p>
  );
};
