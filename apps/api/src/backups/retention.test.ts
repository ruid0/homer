import { addDays } from "@homer/shared";
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { backupDate, backupName, backupsToDelete } from "./retention";

const today = "2026-11-05";
const daysAgo = (n: number) => backupName(addDays(today, -n));

describe("backup names", () => {
  it("round-trips a date", () => expect(backupDate(backupName(today))).toBe(today));
  it("ignores other files", () => expect(backupDate("notes.txt")).toBeNull());
});

describe("backupsToDelete", () => {
  it("keeps the last 14 days", () => {
    const names = Array.from({ length: 14 }, (_, i) => daysAgo(i));
    expect(backupsToDelete(names, today)).toEqual([]);
  });

  it("keeps 14 daily and 6 weekly from a long history", () => {
    const names = Array.from({ length: 100 }, (_, i) => daysAgo(i));
    const deleted = backupsToDelete(names, today);
    expect(names.length - deleted.length).toBe(14 + 6);
  });

  it("deletes the older backup in the same older week", () => {
    // 2026-10-20 (Tue) and 2026-10-21 (Wed) share a week: the newer one stays.
    expect(backupsToDelete(["homer-2026-10-20.db", "homer-2026-10-21.db"], today)).toEqual(["homer-2026-10-20.db"]);
  });

  it("never touches files that are not backups", () => {
    expect(backupsToDelete(["my-copy.db", "homer.db"], today)).toEqual([]);
  });

  it("keeps a backup dated in the future", () => {
    expect(backupsToDelete([backupName("2026-12-01")], today)).toEqual([]);
  });

  it("never deletes today's backup, never invents names, and is stable when run again", () => {
    fc.assert(
      fc.property(fc.uniqueArray(fc.integer({ min: -3, max: 400 })), (ages) => {
        const names = ages.map(daysAgo);
        const deleted = backupsToDelete(names, today);
        expect(deleted).not.toContain(daysAgo(0));
        expect(deleted.every((name) => names.includes(name))).toBe(true);
        const left = names.filter((name) => !deleted.includes(name));
        expect(backupsToDelete(left, today)).toEqual([]);
      }),
    );
  });
});
