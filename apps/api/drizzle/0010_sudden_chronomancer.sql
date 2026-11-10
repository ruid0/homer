ALTER TABLE `items` ADD `depleted_on` text;--> statement-breakpoint
-- Stamp existing items with today so the first daily run takes nothing off retroactively.
UPDATE `items` SET `depleted_on` = date('now', 'localtime');
