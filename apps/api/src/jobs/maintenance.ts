import { and, eq, isNull } from "drizzle-orm";
import cron from "node-cron";
import { dueOn, maintenanceStatus } from "@homer/shared";
import type { Db } from "../db/client";
import { maintenanceItems } from "../db/schema";
import { notifyLog, notifyText } from "../messages";
import type { Notifier } from "../notify/ntfy";
import { localDate, parseClockTime } from "../time";
import { readState, writeState } from "./state";

const SENT_ON = "maintenance.sentOn";
const SETTING = "MAINTENANCE_TIME";

export type MaintenanceResult = "sent" | "quiet" | "failed";

const minutesOf = (date: Date) => date.getHours() * 60 + date.getMinutes();

// A Mac that slept through the time sends the note when it wakes, as long as it is still the same day.
export const maintenanceDue = (now: Date, time: string, sentOn: string | null): boolean => {
  const { hour, minute } = parseClockTime(time, SETTING);
  return minutesOf(now) >= hour * 60 + minute && sentOn !== localDate(now);
};

type Stage = "overdue" | "due" | "soon";

// What is new since the last note. A note is keyed to the due date, so a job is announced once per stage and due date.
// A snoozed job that is due counts as later until its snooze day, so it is not announced; on that day it is.
const news = (db: Db, today: string) =>
  db
    .select()
    .from(maintenanceItems)
    .where(isNull(maintenanceItems.removedAt))
    .all()
    .flatMap((item) => {
      const due = dueOn(item, item.every, item.unit);
      const { status } = maintenanceStatus(due, today, item.snoozedUntil);
      if (status === "soon" && item.notifiedSoonFor !== due) return [{ id: item.id, due, stage: "soon" as Stage }];
      if ((status === "overdue" || status === "due") && item.notifiedDueFor !== due) {
        return [{ id: item.id, due, stage: status as Stage }];
      }
      return [];
    });

const countOf = (list: { stage: Stage }[], stage: Stage) => list.filter((entry) => entry.stage === stage).length;

// The flags are written only after a successful send, so a failed send is tried again. A quiet day counts as done.
export const sendMaintenance = async (
  db: Db,
  notify: Notifier,
  topic: string,
  now: Date,
): Promise<MaintenanceResult> => {
  const today = localDate(now);
  const fresh = news(db, today);
  if (fresh.length === 0) {
    writeState(db, SENT_ON, today);
    return "quiet";
  }
  const message = notifyText.maintenance(countOf(fresh, "overdue"), countOf(fresh, "due"), countOf(fresh, "soon"));
  if (!(await notify({ topic, title: notifyText.title, message, path: "/upkeep" }))) return "failed";
  db.transaction((tx) => {
    fresh.forEach(({ id, due, stage }) => {
      const flag = stage === "soon" ? { notifiedSoonFor: due } : { notifiedDueFor: due };
      tx.update(maintenanceItems)
        .set(flag)
        .where(and(eq(maintenanceItems.id, id), isNull(maintenanceItems.removedAt)))
        .run();
    });
    writeState(tx, SENT_ON, today);
  });
  return "sent";
};

type Options = { time: string; topic: string; notify: Notifier; now?: () => Date; log?: (message: string) => void };

const messageOf = (error: unknown) => (error instanceof Error ? error.message : String(error));

// Never throws: a bad time or a failed send is logged and the api carries on.
export const startMaintenance = (
  db: Db,
  { time, topic, notify, now = () => new Date(), log = console.log }: Options,
) => {
  try {
    const { hour, minute } = parseClockTime(time, SETTING);
    // Mutated on purpose: the run at start-up awaits, so it could still be going when the schedule fires.
    let running = false;
    const run = async () => {
      if (running || !maintenanceDue(now(), time, readState(db, SENT_ON))) return;
      running = true;
      try {
        log(notifyLog.maintenance[await sendMaintenance(db, notify, topic, now())]);
      } catch (error) {
        log(notifyLog.maintenanceError(messageOf(error)));
      } finally {
        running = false;
      }
    };
    void run();
    return cron.schedule(`${minute} ${hour} * * *`, run);
  } catch (error) {
    log(notifyLog.maintenanceError(messageOf(error)));
    return null;
  }
};
