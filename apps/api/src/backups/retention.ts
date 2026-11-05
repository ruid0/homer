import { addDays, weekdayOf } from "@homer/shared";

export const KEEP_DAILY = 14;
export const KEEP_WEEKLY = 6;

const NAME = /^homer-(\d{4}-\d{2}-\d{2})\.db$/;

export const backupName = (date: string) => `homer-${date}.db`;

export const backupDate = (name: string): string | null => NAME.exec(name)?.[1] ?? null;

const mondayOf = (date: string) => addDays(date, -((weekdayOf(date) + 6) % 7));

// Files that do not look like our backups are left alone, so a person's own copy in the folder is never deleted.
export const backupsToDelete = (names: string[], today: string): string[] => {
  const dated = names.flatMap((name) => {
    const date = backupDate(name);
    return date ? [{ name, date }] : [];
  });
  const dailyStart = addDays(today, -(KEEP_DAILY - 1));
  const older = dated.filter(({ date }) => date < dailyStart).sort((a, b) => b.date.localeCompare(a.date));
  const newestPerWeek = older.filter(({ date }, i) => i === 0 || mondayOf(older[i - 1]!.date) !== mondayOf(date));
  const kept = new Set(newestPerWeek.slice(0, KEEP_WEEKLY).map(({ name }) => name));
  return older.filter(({ name }) => !kept.has(name)).map(({ name }) => name);
};
