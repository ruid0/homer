import { mkdirSync, readdirSync, renameSync, rmSync } from "node:fs";
import { join } from "node:path";
import Database from "better-sqlite3";
import type { Db } from "../db/client";
import { backupLog } from "../messages";
import { backupName, backupsToDelete } from "./retention";

// The copy inherits WAL mode. Switching it off makes the copy one self-contained file, with no -wal or -shm beside it.
const copyIsIntact = (path: string): boolean => {
  const copy = new Database(path);
  try {
    copy.pragma("journal_mode = DELETE");
    return copy.pragma("integrity_check", { simple: true }) === "ok";
  } finally {
    copy.close();
  }
};

export const ensureDir = (dir: string) => mkdirSync(dir, { recursive: true });

export const listBackups = (dir: string): string[] => {
  ensureDir(dir);
  return readdirSync(dir);
};

// Written under a temporary name and renamed once checked, so a half-written file is never taken for a backup.
const writeChecked = async (db: Db, file: string) => {
  const partial = `${file}.partial`;
  try {
    await db.$client.backup(partial);
    if (!copyIsIntact(partial)) throw new Error(backupLog.corrupt(file));
    renameSync(partial, file);
  } catch (error) {
    rmSync(partial, { force: true });
    throw error;
  }
};

// A backup that is written stays a success even if an old one cannot be removed.
const removeOld = (dir: string, today: string): string[] =>
  backupsToDelete(listBackups(dir), today).filter((name) => {
    try {
      rmSync(join(dir, name), { force: true });
      return true;
    } catch {
      return false;
    }
  });

export const runBackup = async (db: Db, dir: string, today: string): Promise<{ file: string; removed: string[] }> => {
  ensureDir(dir);
  const file = join(dir, backupName(today));
  await writeChecked(db, file);
  return { file, removed: removeOld(dir, today) };
};
