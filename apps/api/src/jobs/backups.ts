import cron from "node-cron";
import { listBackups, runBackup } from "../backups/backup";
import { backupName } from "../backups/retention";
import type { Db } from "../db/client";
import { backupLog } from "../messages";
import { localDate, parseClockTime } from "../time";

const parseBackupTime = (time: string) => parseClockTime(time, "BACKUP_TIME");

// A Mac that slept through the scheduled time still gets today's backup when the api next starts.
export const needsCatchUp = (now: Date, time: string, names: string[]): boolean => {
  const { hour, minute } = parseBackupTime(time);
  const due = now.getHours() * 60 + now.getMinutes() >= hour * 60 + minute;
  return due && !names.includes(backupName(localDate(now)));
};

type Options = { dir: string; time: string; now?: () => Date; log?: (message: string) => void };

const messageOf = (error: unknown) => (error instanceof Error ? error.message : String(error));

// Never throws: a bad time or an unwritable folder is logged and the api carries on without backups.
export const startBackups = (db: Db, { dir, time, now = () => new Date(), log = console.log }: Options) => {
  try {
    const { hour, minute } = parseBackupTime(time);
    // Mutated on purpose: the catch-up at boot and the schedule must never write the same file at once.
    let running = false;
    const run = async () => {
      if (running) return;
      running = true;
      try {
        const { file, removed } = await runBackup(db, dir, localDate(now()));
        log(backupLog.written(file, removed.length));
      } catch (error) {
        log(backupLog.failed(messageOf(error)));
      } finally {
        running = false;
      }
    };
    if (needsCatchUp(now(), time, listBackups(dir))) void run();
    return cron.schedule(`${minute} ${hour} * * *`, run);
  } catch (error) {
    log(backupLog.failed(messageOf(error)));
    return null;
  }
};
