CREATE TABLE `maintenance_done` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`item_id` integer NOT NULL,
	`done_on` text NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`item_id`) REFERENCES `maintenance_items`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `maintenance_done_item_idx` ON `maintenance_done` (`item_id`,`done_on`);--> statement-breakpoint
CREATE TABLE `maintenance_items` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`every` integer NOT NULL,
	`unit` text NOT NULL,
	`last_done_on` text,
	`notified_soon_for` text,
	`notified_due_for` text,
	`created_on` text NOT NULL,
	`created_at` text NOT NULL,
	`removed_at` text
);
--> statement-breakpoint
CREATE UNIQUE INDEX `maintenance_active_name_unique` ON `maintenance_items` (lower("name")) WHERE "maintenance_items"."removed_at" is null;