import { copy } from "../copy";
import { pastDate } from "../lib/maintenanceText";
import { snoozeUntil, type useSnooze } from "../lib/useSnooze";
import { Dialog } from "./Dialog";
import { Toast } from "./Toast";
import { secondaryButton } from "./ui";

type Props = { snooze: ReturnType<typeof useSnooze>; today: string };

// The "Not today" choices and the toast after one. The dialog is the same sheet as every other, so Escape and a tap
// outside close it.
export const SnoozeUi = ({ snooze, today }: Props) => {
  const { asking, toast } = snooze;
  return (
    <>
      {asking && (
        <Dialog title={copy.maintenance.notTodayLabel(asking.name)} onClose={snooze.cancel}>
          <ul className="grid gap-2">
            {copy.maintenance.notTodayChoices.map((choice) => {
              const until = snoozeUntil(choice, today);
              return (
                <li key={choice.label}>
                  <button
                    type="button"
                    className={`${secondaryButton} flex w-full items-center justify-between`}
                    onClick={() => snooze.choose(asking, until)}
                  >
                    {choice.label}
                    <span className="text-meta text-muted">{pastDate(until, today)}</span>
                  </button>
                </li>
              );
            })}
          </ul>
          <div className="mt-4 flex justify-end">
            <button type="button" className={secondaryButton} onClick={snooze.cancel}>
              {copy.common.cancel}
            </button>
          </div>
        </Dialog>
      )}
      {toast && (
        <Toast
          message={toast.message}
          onClose={snooze.closeToast}
          action={{ label: copy.maintenance.undo, onClick: snooze.takeBack, disabled: toast.busy }}
        />
      )}
    </>
  );
};
