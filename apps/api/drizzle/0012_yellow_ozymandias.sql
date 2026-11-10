CREATE TABLE `routine_reminders` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`routine_item_id` integer NOT NULL,
	`fire_at` text NOT NULL,
	`daily_time` text,
	`created_at` text NOT NULL,
	`removed_at` text,
	FOREIGN KEY (`routine_item_id`) REFERENCES `routine_items`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `routine_reminders_fire_idx` ON `routine_reminders` (`removed_at`,`fire_at`);--> statement-breakpoint
ALTER TABLE `people` ADD `notify_topic` text;