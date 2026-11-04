CREATE TABLE `assistant_messages` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`role` text NOT NULL,
	`text` text NOT NULL,
	`action_ids` text NOT NULL,
	`created_at` text NOT NULL,
	`cleared_at` text
);
