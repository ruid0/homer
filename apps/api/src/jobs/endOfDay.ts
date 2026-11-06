import cron from "node-cron";
import type { Db } from "../db/client";
import { notifyLog, notifyText } from "../messages";
import type { Notifier } from "../notify/ntfy";
import { dayCounts, endOfDayMessage } from "../notify/summary";
import { localDate, parseClockTime } from "../time";
import { readState, writeState } from "./state";

const SENT_ON = "endOfDay.sentOn";

export type EndOfDayResult = "sent" | "quiet" | "failed";

const minutesOf = (date: Date) => date.getHours() * 60 + date.getMinutes();

// A Mac that slept through the time sends the note when it wakes, as long as it is still the same day.
export const endOfDayDue = (now: Date, time: string, sentOn: string | null): boolean => {
  const { hour, minute } = parseClockTime(time, "END_OF_DAY_TIME");
  return minutesOf(now) >= hour * 60 + minute && sentOn !== localDate(now);
};

// A quiet day counts as done, so it is not tried again. A failed send is not recorded, so a later start can retry.
export const sendEndOfDay = async (db: Db, notify: Notifier, topic: string, now: Date): Promise<EndOfDayResult> => {
  const today = localDate(now);
  const message = endOfDayMessage(await dayCounts(db, today));
  if (message === null) {
    writeState(db, SENT_ON, today);
    return "quiet";
  }
  if (!(await notify({ topic, title: notifyText.title, message, path: "/" }))) return "failed";
  writeState(db, SENT_ON, today);
  return "sent";
};

type Options = { time: string; topic: string; notify: Notifier; now?: () => Date; log?: (message: string) => void };

const messageOf = (error: unknown) => (error instanceof Error ? error.message : String(error));

// Never throws: a bad time or a failed send is logged and the api carries on.
export const startEndOfDay = (db: Db, { time, topic, notify, now = () => new Date(), log = console.log }: Options) => {
  try {
    const { hour, minute } = parseClockTime(time, "END_OF_DAY_TIME");
    // Mutated on purpose: the run at start-up awaits, so it could still be going when the schedule fires.
    let running = false;
    const run = async () => {
      if (running || !endOfDayDue(now(), time, readState(db, SENT_ON))) return;
      running = true;
      try {
        log(notifyLog.endOfDay[await sendEndOfDay(db, notify, topic, now())]);
      } catch (error) {
        log(notifyLog.endOfDayError(messageOf(error)));
      } finally {
        running = false;
      }
    };
    void run();
    return cron.schedule(`${minute} ${hour} * * *`, run);
  } catch (error) {
    log(notifyLog.endOfDayError(messageOf(error)));
    return null;
  }
};
