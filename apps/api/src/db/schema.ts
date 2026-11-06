import { sql } from "drizzle-orm";
import { maintenanceUnitValues, repeatValues } from "@homer/shared";
import { localDate } from "../time";
import { index, integer, real, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

const now = () => new Date().toISOString();

export const items = sqliteTable(
  "items",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    name: text("name").notNull(),
    unit: text("unit").notNull(),
    quantity: real("quantity").notNull(),
    daysPerUnitEntered: real("days_per_unit_entered"),
    daysPerUnitLearned: real("days_per_unit_learned"),
    // When the entered estimate was last set by hand. Learning only looks at restocks from then on.
    learningSince: text("learning_since"),
    lowThresholdDays: integer("low_threshold_days").notNull().default(7),
    // The last day the daily job took usage off the quantity. Restocks and edits leave it alone; restoring an archived item resets it.
    // Null means "stamp the day, take nothing off".
    depletedOn: text("depleted_on").$defaultFn(() => localDate(new Date())),
    createdAt: text("created_at").notNull().$defaultFn(now),
    archivedAt: text("archived_at"),
  },
  (table) => [
    uniqueIndex("items_active_name_unique")
      .on(sql`lower(${table.name})`)
      .where(sql`${table.archivedAt} is null`),
  ],
);

export const restocks = sqliteTable(
  "restocks",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    itemId: integer("item_id")
      .notNull()
      .references(() => items.id),
    quantity: real("quantity").notNull(),
    restockedAt: text("restocked_at").notNull().$defaultFn(now),
  },
  (table) => [index("restocks_item_idx").on(table.itemId, table.restockedAt)],
);

export const groceryEntries = sqliteTable(
  "grocery_entries",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    itemId: integer("item_id").references(() => items.id),
    text: text("text").notNull(),
    quantity: real("quantity"),
    addedBy: text("added_by", { enum: ["auto", "manual"] }).notNull(),
    createdAt: text("created_at").notNull().$defaultFn(now),
    boughtAt: text("bought_at"),
    removedAt: text("removed_at"),
  },
  (table) => [
    uniqueIndex("grocery_one_open_per_item")
      .on(table.itemId)
      .where(sql`${table.itemId} is not null and ${table.boughtAt} is null and ${table.removedAt} is null`),
  ],
);

export const people = sqliteTable(
  "people",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    name: text("name").notNull(),
    createdAt: text("created_at").notNull().$defaultFn(now),
    // Not used: people are not removed in this household. Kept so the applied migration stays as it is.
    archivedAt: text("archived_at"),
    // The secret ntfy topic for this person's routine reminders. It leaves the api only when they set up their phone.
    notifyTopic: text("notify_topic"),
  },
  (table) => [
    uniqueIndex("people_active_name_unique")
      .on(sql`lower(${table.name})`)
      .where(sql`${table.archivedAt} is null`),
  ],
);

export const tasks = sqliteTable("tasks", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  title: text("title").notNull(),
  dueDate: text("due_date"),
  dueTime: text("due_time"),
  repeat: text("repeat", { enum: repeatValues }),
  personId: integer("person_id").references(() => people.id),
  createdAt: text("created_at").notNull().$defaultFn(now),
  doneAt: text("done_at"),
  removedAt: text("removed_at"),
});

export const events = sqliteTable("events", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  title: text("title").notNull(),
  date: text("date").notNull(),
  time: text("time"),
  personId: integer("person_id").references(() => people.id),
  createdAt: text("created_at").notNull().$defaultFn(now),
  removedAt: text("removed_at"),
});

export const routineItems = sqliteTable(
  "routine_items",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    personId: integer("person_id")
      .notNull()
      .references(() => people.id),
    name: text("name").notNull(),
    targetPerDay: integer("target_per_day").notNull().default(1),
    position: integer("position").notNull(),
    createdAt: text("created_at").notNull().$defaultFn(now),
    // A removed row is hidden from the grid but keeps its past ticks.
    removedAt: text("removed_at"),
  },
  (table) => [index("routine_items_person_idx").on(table.personId)],
);

// One row per routine row per day, holding how many times it was done, so setting a count twice is harmless.
export const routineTicks = sqliteTable(
  "routine_ticks",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    routineItemId: integer("routine_item_id")
      .notNull()
      .references(() => routineItems.id),
    date: text("date").notNull(),
    count: integer("count").notNull(),
  },
  (table) => [uniqueIndex("routine_ticks_item_date_idx").on(table.routineItemId, table.date)],
);

// A reminder on a routine row. One-off ones are marked done when they fire, daily ones move to the next day.
export const routineReminders = sqliteTable(
  "routine_reminders",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    routineItemId: integer("routine_item_id")
      .notNull()
      .references(() => routineItems.id),
    // When it next fires, as an ISO-8601 UTC time.
    fireAt: text("fire_at").notNull(),
    // HH:MM when it repeats every day, otherwise null.
    dailyTime: text("daily_time"),
    createdAt: text("created_at").notNull().$defaultFn(now),
    removedAt: text("removed_at"),
  },
  (table) => [index("routine_reminders_fire_idx").on(table.removedAt, table.fireAt)],
);

// Things that come round on a long cycle. The interval is counted from the day it was last done.
export const maintenanceItems = sqliteTable(
  "maintenance_items",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    name: text("name").notNull(),
    every: integer("every").notNull(),
    unit: text("unit", { enum: maintenanceUnitValues }).notNull(),
    // Always the latest done_on in maintenance_done, or null when it was never done.
    lastDoneOn: text("last_done_on"),
    // The due dates a note was already sent for, so each stage is sent once per due date.
    notifiedSoonFor: text("notified_soon_for"),
    notifiedDueFor: text("notified_due_for"),
    // The household's local day it was added. A never-done item is due on this day.
    createdOn: text("created_on").notNull(),
    createdAt: text("created_at").notNull().$defaultFn(now),
    removedAt: text("removed_at"),
  },
  (table) => [
    uniqueIndex("maintenance_active_name_unique")
      .on(sql`lower(${table.name})`)
      .where(sql`${table.removedAt} is null`),
  ],
);

// One row per time an item was marked done. Removed items keep theirs.
export const maintenanceDone = sqliteTable(
  "maintenance_done",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    itemId: integer("item_id")
      .notNull()
      .references(() => maintenanceItems.id),
    doneOn: text("done_on").notNull(),
    createdAt: text("created_at").notNull().$defaultFn(now),
  },
  (table) => [index("maintenance_done_item_idx").on(table.itemId, table.doneOn)],
);

// Small facts the daily jobs remember between runs, such as the day the end-of-day note was last sent.
export const jobState = sqliteTable("job_state", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
});

// One row per assistant change, with the rows it touched, so Undo can put them back.
export const assistantActions = sqliteTable("assistant_actions", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  tool: text("tool").notNull(),
  args: text("args", { mode: "json" }).notNull(),
  result: text("result", { mode: "json" }),
  changes: text("changes", { mode: "json" }).notNull(),
  createdAt: text("created_at").notNull().$defaultFn(now),
  undoneAt: text("undone_at"),
});

// The chat people see. Clearing sets clearedAt, so rows are never deleted.
export const assistantMessages = sqliteTable("assistant_messages", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  role: text("role", { enum: ["user", "assistant"] }).notNull(),
  text: text("text").notNull(),
  actionIds: text("action_ids", { mode: "json" }).$type<number[]>().notNull(),
  createdAt: text("created_at").notNull().$defaultFn(now),
  clearedAt: text("cleared_at"),
});
