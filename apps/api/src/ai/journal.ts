import { eq, getTableColumns, sql } from "drizzle-orm";
import type { SQLiteTable } from "drizzle-orm/sqlite-core";
import { assistantActions, events, groceryEntries, items, restocks, tasks } from "../db/schema";
import type { Db } from "../db/client";

// The tables a tool can change, parents first. Undo deletes in reverse order, then re-adds and updates in this order.
const journalledTables = { items, restocks, groceryEntries, tasks, events } as const;
type TableName = keyof typeof journalledTables;
const tableNames = Object.keys(journalledTables) as TableName[];

type Row = { id: number } & Record<string, unknown>;
export type Snapshot = Record<TableName, Row[]>;
export type TableChanges = { added: Row[]; changed: { before: Row; after: Row }[]; removed: Row[] };
export type Changes = Record<TableName, TableChanges>;

export const snapshot = (db: Db | Writer): Snapshot =>
  Object.fromEntries(
    tableNames.map((name) => [name, db.select().from(journalledTables[name]).orderBy(journalledTables[name].id).all()]),
  ) as unknown as Snapshot;

// Both rows come from the same select, so their keys are in the same order.
const same = (a: Row, b: Row) => JSON.stringify(a) === JSON.stringify(b);

const diffRows = (before: Row[], after: Row[]): TableChanges => {
  const old = new Map(before.map((row) => [row.id, row]));
  const next = new Map(after.map((row) => [row.id, row]));
  return {
    added: after.filter((row) => !old.has(row.id)),
    changed: after.flatMap((row) => {
      const was = old.get(row.id);
      return was && !same(was, row) ? [{ before: was, after: row }] : [];
    }),
    removed: before.filter((row) => !next.has(row.id)),
  };
};

export const diffSnapshots = (before: Snapshot, after: Snapshot): Changes =>
  Object.fromEntries(tableNames.map((name) => [name, diffRows(before[name], after[name])])) as Changes;

const isEmpty = (changes: Changes) =>
  tableNames.every((name) => {
    const { added, changed, removed } = changes[name];
    return added.length + changed.length + removed.length === 0;
  });

export type Journalled<T> = { result: T; actionId: number | null; changed: boolean };

// Runs a change and records what it did to the rows. A run that changes nothing records nothing.
// Limit: a transaction cannot span an await, so a write by someone else while `run` is pending is counted
// as part of this action. Undo's conflict rule still protects rows edited after the action finished.
export const journalled = async <T>(db: Db, tool: string, args: unknown, run: () => Promise<T>): Promise<Journalled<T>> => {
  const before = snapshot(db);
  const result = await run();
  const changes = diffSnapshots(before, snapshot(db));
  if (isEmpty(changes)) return { result, actionId: null, changed: false };
  const [action] = db
    .insert(assistantActions)
    .values({ tool, args: args ?? {}, result: result ?? null, changes })
    .returning({ id: assistantActions.id })
    .all();
  return { result, actionId: action!.id, changed: true };
};

export type UndoResult =
  | { ok: true }
  | { ok: false; reason: "missing" | "undone" }
  | { ok: false; reason: "changed"; label: string };

const idTable = (name: TableName) => journalledTables[name] as SQLiteTable & { id: (typeof items)["id"] };

const toColumns = (name: TableName, row: Row) =>
  Object.fromEntries(Object.keys(getTableColumns(journalledTables[name])).map((column) => [column, row[column]]));

// A short name for a row in the "changed since" line. Restocks are named after their item.
const labelOf = (row: Row, now: Snapshot): string => {
  const item = now.items.find((candidate) => candidate.id === row.itemId);
  return String(row.name ?? row.title ?? row.text ?? item?.name ?? row.id);
};

const findStale = (changes: Changes, now: Snapshot): Row | undefined =>
  tableNames
    .flatMap((name) => {
      const current = new Map(now[name].map((row) => [row.id, row]));
      const { added, changed, removed } = changes[name];
      const left = (row: Row) => current.has(row.id) && same(current.get(row.id)!, row);
      return [...added.filter((row) => !left(row)), ...changed.map(({ after }) => after).filter((row) => !left(row)), ...removed.filter((row) => current.has(row.id))];
    })
    .at(0);

type Writer = Parameters<Parameters<Db["transaction"]>[0]>[0];

// Added rows go first, so a re-opened row never meets the row that replaced it (one open grocery entry per item).
// Foreign keys are checked at commit, so a row can point at one that is restored a step later.
const applyReverse = (tx: Writer, changes: Changes) => {
  for (const name of [...tableNames].reverse()) {
    for (const row of changes[name].added) tx.delete(idTable(name)).where(eq(idTable(name).id, row.id)).run();
  }
  for (const name of tableNames) {
    for (const row of changes[name].removed) tx.insert(idTable(name)).values(toColumns(name, row)).run();
  }
  for (const name of tableNames) {
    for (const { before } of changes[name].changed) {
      tx.update(idTable(name)).set(toColumns(name, before)).where(eq(idTable(name).id, before.id)).run();
    }
  }
};

const isForeignKeyError = (error: unknown) =>
  error instanceof Error && "code" in error && error.code === "SQLITE_CONSTRAINT_FOREIGNKEY";

const addedLabel = (db: Db, actionId: number): string => {
  const action = db.select().from(assistantActions).where(eq(assistantActions.id, actionId)).get();
  const changes = action?.changes as Changes | undefined;
  const added = changes && tableNames.flatMap((name) => changes[name].added).at(0);
  return added ? labelOf(added, snapshot(db)) : String(actionId);
};

const reverseInTransaction = (db: Db, actionId: number): UndoResult =>
  db.transaction((tx): UndoResult => {
    const action = tx.select().from(assistantActions).where(eq(assistantActions.id, actionId)).get();
    if (!action) return { ok: false, reason: "missing" };
    if (action.undoneAt) return { ok: false, reason: "undone" };
    const changes = action.changes as Changes;
    const now = snapshot(tx);
    const stale = findStale(changes, now);
    if (stale) return { ok: false, reason: "changed", label: labelOf(stale, now) };
    tx.run(sql`pragma defer_foreign_keys = on`);
    applyReverse(tx, changes);
    tx.update(assistantActions).set({ undoneAt: new Date().toISOString() }).where(eq(assistantActions.id, actionId)).run();
    return { ok: true };
  });

// If something outside the action now points at a row it added (a restock the person added), the commit fails
// and nothing is written. That is the same refusal as an edited row.
export const undoAction = (db: Db, actionId: number): UndoResult => {
  try {
    return reverseInTransaction(db, actionId);
  } catch (error) {
    if (!isForeignKeyError(error)) throw error;
    return { ok: false, reason: "changed", label: addedLabel(db, actionId) };
  }
};
