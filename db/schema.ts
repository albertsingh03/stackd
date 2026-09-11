import { sqliteTable, text, integer, uniqueIndex, index } from "drizzle-orm/sqlite-core";
export const workouts = sqliteTable("workouts", {
  id: text("id").primaryKey(), name: text("name").notNull(),
  startedAt: text("started_at").notNull(), completedAt: text("completed_at"),
  activeSlot: integer("active_slot"), revision: integer("revision").notNull(),
  exercises: text("exercises").notNull(),
  timer: text("timer"),
}, (t) => [uniqueIndex("workouts_one_active").on(t.activeSlot), index("workouts_started_at").on(t.startedAt, t.id)]);
