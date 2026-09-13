CREATE TABLE `exercise_catalog` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`normalized_key` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `exercise_catalog_name_unique` ON `exercise_catalog` (`normalized_key`);