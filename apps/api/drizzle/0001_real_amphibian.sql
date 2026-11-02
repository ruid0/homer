CREATE TABLE `grocery_entries` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`item_id` integer,
	`text` text NOT NULL,
	`quantity` real,
	`added_by` text NOT NULL,
	`created_at` text NOT NULL,
	`bought_at` text,
	`removed_at` text,
	FOREIGN KEY (`item_id`) REFERENCES `items`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `grocery_one_open_per_item` ON `grocery_entries` (`item_id`) WHERE "grocery_entries"."item_id" is not null and "grocery_entries"."bought_at" is null and "grocery_entries"."removed_at" is null;