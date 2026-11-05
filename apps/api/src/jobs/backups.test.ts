import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createDb } from "../db/client";
import { localDate, needsCatchUp, parseBackupTime, startBackups } from "./backups";

const at = (hour: number, minute = 0) => new Date(2026, 10, 5, hour, minute);

describe("parseBackupTime", () => {
  it("reads hours and minutes", () => expect(parseBackupTime("06:30")).toEqual({ hour: 6, minute: 30 }));
  it.each(["6:00", "24:00", "06:60", "morning"])("rejects %s", (time) => {
    expect(() => parseBackupTime(time)).toThrow(/BACKUP_TIME/);
  });
});

describe("needsCatchUp", () => {
  const todays = ["homer-2026-11-05.db"];

  it("is false before the scheduled time", () => expect(needsCatchUp(at(5, 59), "06:00", [])).toBe(false));
  it("is true after the time when today has no backup", () => expect(needsCatchUp(at(9), "06:00", ["homer-2026-11-04.db"])).toBe(true));
  it("is false once today's backup exists", () => expect(needsCatchUp(at(9), "06:00", todays)).toBe(false));
  it("is true exactly at the time", () => expect(needsCatchUp(at(6), "06:00", [])).toBe(true));
});

describe("localDate", () => {
  it("uses the local calendar day", () => expect(localDate(at(23, 59))).toBe("2026-11-05"));
});

describe("startBackups", () => {
  const dirs: string[] = [];
  afterEach(() => dirs.splice(0).forEach((dir) => rmSync(dir, { recursive: true, force: true })));
  const scratch = () => {
    const dir = mkdtempSync(join(tmpdir(), "homer-jobs-"));
    dirs.push(dir);
    return dir;
  };

  it("logs and carries on when the time is invalid", () => {
    const logged: string[] = [];
    const task = startBackups(createDb(":memory:"), { dir: scratch(), time: "soon", log: (m) => logged.push(m) });
    expect(task).toBeNull();
    expect(logged[0]).toMatch(/BACKUP_TIME/);
  });

  it("logs and carries on when the folder cannot be created", () => {
    const dir = scratch();
    const blocker = join(dir, "file");
    writeFileSync(blocker, "x");
    const logged: string[] = [];
    const task = startBackups(createDb(":memory:"), { dir: join(blocker, "inside"), time: "06:00", log: (m) => logged.push(m) });
    expect(task).toBeNull();
    expect(logged[0]).toMatch(/backup failed/);
  });

  it("schedules a backup when the setup is valid", () => {
    const task = startBackups(createDb(":memory:"), { dir: scratch(), time: "23:59", now: () => at(1) });
    expect(task).not.toBeNull();
    void task?.stop();
  });
});
