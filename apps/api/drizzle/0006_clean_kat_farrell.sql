CREATE TABLE `assistant_actions` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`tool` text NOT NULL,
	`args` text NOT NULL,
	`result` text,
	`changes` text NOT NULL,
	`created_at` text NOT NULL,
	`undone_at` text
);
