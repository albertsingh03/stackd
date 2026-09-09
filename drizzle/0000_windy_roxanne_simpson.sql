CREATE TABLE `workouts` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`started_at` text NOT NULL,
	`completed_at` text,
	`active_slot` integer,
	`revision` integer NOT NULL,
	`exercises` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `workouts_one_active` ON `workouts` (`active_slot`);--> statement-breakpoint
CREATE INDEX `workouts_started_at` ON `workouts` (`started_at`,`id`);