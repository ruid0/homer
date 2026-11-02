CREATE TABLE `items` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`unit` text NOT NULL,
	`quantity` real NOT NULL,
	`days_per_unit_entered` real,
	`days_per_unit_learned` real,
	`low_threshold_days` integer DEFAULT 7 NOT NULL,
	`created_at` text NOT NULL,
	`archived_at` text
);
--> statement-breakpoint
CREATE UNIQUE INDEX `items_active_name_unique` ON `items` (lower("name")) WHERE "items"."archived_at" is null;--> statement-breakpoint
CREATE TABLE `restocks` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`item_id` integer NOT NULL,
	`quantity` real NOT NULL,
	`restocked_at` text NOT NULL,
	FOREIGN KEY (`item_id`) REFERENCES `items`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `restocks_item_idx` ON `restocks` (`item_id`,`restocked_at`);