import { sql } from "drizzle-orm";
import { repeatValues } from "@homer/shared";
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
    lowThresholdDays: integer("low_threshold_days").notNull().default(7),
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
