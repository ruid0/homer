CREATE TABLE `routine_items` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`person_id` integer NOT NULL,
	`name` text NOT NULL,
	`target_per_day` integer DEFAULT 1 NOT NULL,
	`position` integer NOT NULL,
	`created_at` text NOT NULL,
	`removed_at` text,
	FOREIGN KEY (`person_id`) REFERENCES `people`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `routine_items_person_idx` ON `routine_items` (`person_id`);--> statement-breakpoint
CREATE TABLE `routine_ticks` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`routine_item_id` integer NOT NULL,
	`date` text NOT NULL,
	`count` integer NOT NULL,
	FOREIGN KEY (`routine_item_id`) REFERENCES `routine_items`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `routine_ticks_item_date_idx` ON `routine_ticks` (`routine_item_id`,`date`);