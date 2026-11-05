import { mkdtempSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import Database from "better-sqlite3";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createDb } from "../db/client";
import { items } from "../db/schema";
import { runBackup } from "./backup";

let dir = "";
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "homer-backup-"));
});
afterEach(() => rmSync(dir, { recursive: true, force: true }));

const scratchDb = () => {
  const db = createDb(join(dir, "live.sqlite"));
  db.insert(items).values({ name: "Salt", unit: "bag", quantity: 2 }).run();
  return db;
};

describe("runBackup", () => {
  it("writes a dated copy that restores to the same data", async () => {
    const backups = join(dir, "backups");
    const { file } = await runBackup(scratchDb(), backups, "2026-11-05");

    expect(file).toBe(join(backups, "homer-2026-11-05.db"));
    const restored = new Database(file, { readonly: true });
    expect(restored.prepare("select name, quantity from items").all()).toEqual([{ name: "Salt", quantity: 2 }]);
    restored.close();
  });

  it("leaves no partial file behind and replaces a same-day backup", async () => {
    const backups = join(dir, "backups");
    const db = scratchDb();
    await runBackup(db, backups, "2026-11-05");
    await runBackup(db, backups, "2026-11-05");
    expect(readdirSync(backups)).toEqual(["homer-2026-11-05.db"]);
  });

  it("removes backups past retention but keeps other files", async () => {
    const backups = join(dir, "backups");
    const db = scratchDb();
    await runBackup(db, backups, "2026-09-01");
    writeFileSync(join(backups, "mine.txt"), "keep");
    const { removed } = await runBackup(db, backups, "2026-11-05");
    expect(removed).toEqual([]);
    expect(readdirSync(backups).sort()).toEqual(["homer-2026-09-01.db", "homer-2026-11-05.db", "mine.txt"]);
  });

  it("leaves no partial file when the backup fails", async () => {
    const backups = join(dir, "backups");
    const db = scratchDb();
    db.$client.close();
    await expect(runBackup(db, backups, "2026-11-05")).rejects.toThrow();
    expect(readdirSync(backups)).toEqual([]);
  });
});
